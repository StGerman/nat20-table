// The DM agent on the Claude Agent SDK (M6 spec §3.2, §3.3, §3.6, §3.7, step 10; TASKS.md AGT-4,
// AGT-6, AGT-21). It runs the table through the DM's tools: it narrates, maps the players' words to
// engine calls, picks checks from the pack or the SRD ladder, moves the story along the skeleton's
// exits, and remembers what it established in fiction. The engine decides every outcome (Rule 4);
// everything it says to the table passes the narration guard first. One session per scene: the
// next one starts from the scene's state, its memory and its summaries, with the same system
// prompt (the rules, the craft guidance, the whole pack), so the prompt stays cached.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Ability, Handle, Skill } from "@nat20-table/engine-client";
import { z } from "zod";
import { TurnTimeout, UsageLimitReached } from "../errors.ts";
import type { PackText } from "../pack/read.ts";
import type { DmTools } from "../table/tools.ts";
import type { DmAgent, DmWake, ToolOutcome } from "../table/types.ts";
import type { UsageLog } from "../usage.ts";
import { dmLanguage, type Language } from "./language.ts";
import { AgentSession, reply, seatTool, type CallToolResult, type ModelChoice, type SeatTool, type SessionConfig, type TurnSession } from "./sdk-session.ts";

/** A DM turn that runs longer falls back to the engine lines alone (spec §6). */
export const DM_TURN_TIMEOUT_MS = 12_000;

/** The DM's craft guidance (D10): our own text, one skill per file, for the DM session only. */
export const CRAFT_PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dm-craft");

/** The craft plugin's name, as its `plugin.json` gives it: skills are named `<plugin>:<skill>`. */
const CRAFT_NAME = "nat20-dm-craft";

/**
 * How the craft guidance reaches the DM: in its system prompt, or as skills the SDK loads from our
 * plugin folder (D10: skills once the step 1 spike shows they load with no setting sources).
 */
export type CraftMode = "prompt" | "skills";

/** Each skill's own ability (SRD 5.2.1, Skills), so the DM names only the skill. */
const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: "dexterity",
  animal_handling: "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};
const SKILLS = Object.keys(SKILL_ABILITY) as [Skill, ...Skill[]];

/** The SRD DC ladder (SRD 5.2.1, Difficulty Class). */
const LADDER = [5, 10, 15, 20, 25, 30];

/** The craft skills in the plugin folder: name, when to use it, and its text. */
export function craftSkills(dir = CRAFT_PLUGIN): Array<{ name: string; description: string; body: string }> {
  const skills = path.join(dir, "skills");
  return readdirSync(skills, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const text = readFileSync(path.join(skills, name, "SKILL.md"), "utf8");
      const [, front = "", body = text] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text) ?? [];
      const description = /^description:\s*(.+)$/m.exec(front)?.[1].trim() ?? "";
      return { name, description, body: body.trim() };
    });
}

/** The DM's system prompt: the same for every session of a run. */
export function dmPrompt(pack: PackText, human: Handle | undefined, players: Handle[], craft: CraftMode, language: Language = "en"): string {
  const party = [...(human ? [human] : []), ...players];
  // A table with no human (M7 spec §4.2, AGT-40): every character is an AI player, nobody is asked
  // anything, and a surrender is the DM's call.
  const seats = human ? `A human plays ${human}; AI players play ${players.join(", ")}.` : `AI players play every character: ${players.join(", ")}. No human sits at this table.`;
  // The English run called Torva "he" throughout (M7 design §3.4): the pack names each one's pronouns.
  const named = pack.adventure.party.filter((p) => p.pronouns).map((p) => `${p.handle} ${p.pronouns}`);
  const pronouns = named.length > 0 ? ` Pronouns: ${named.join(", ")}; keep to them in every language.` : "";
  const fightMoves = human ? ` (in a fight only ${human} moves, on ${human}'s turn)` : "";
  const hears = human ? "narrate (to everyone, or to one character with `to`) and ask_human" : "narrate (to everyone, or to one character with `to`)";
  const spoken = human
    ? `- "The table has spoken": ${human} acted or spoke, then the AI players declared. Resolve it: ask for a check (request_check, with the character who tries as actor), move characters (move), have one help another (help), rest (short_rest), start the scene's fight (start_combat), or answer in fiction. When an AI player declares one of its own options, such as a spell or a potion, don't take it for them: grant_action, and they take it. ${human}'s own options go through submit. If ${human}'s intent is unclear, ask_human. Then narrate the outcome in one to three sentences.
- "It is ${human}'s turn, and the human playing ${human} said": map the words to ${human}'s options (legal_actions, submit, move, end_turn), then narrate only what the engine did. If it can't be done, or a move is refused, say so in narration.`
    : `- "The table has spoken": the AI players declared. Resolve it: ask for a check (request_check, with the character who tries as actor), move characters (move), have one help another (help), rest (short_rest), start the scene's fight (start_combat), or answer in fiction. When an AI player declares one of its own options, such as a spell or a potion, don't take it for them: grant_action, and they take it. Then narrate the outcome in one to three sentences.`;
  const surrenderWords = human ? `- "answered your surrender offer in words": if the human accepts, end_combat with surrender; otherwise answer in fiction with narrate. The offer stays open until they accept or fight on.\n` : "";
  const surrender = human
    ? `- Surrender: while get_state shows a surrender is available, the human decides whether to accept it. Narrate the foes begging for their lives, then call offer_surrender with the handles get_state lists as surrendering; never ask about it with ask_human. The table asks the human at once, and nothing happens in the fight before the answer: accepted, the fight ends and you narrate it; refused, you hear so and narrate the fight going on. The AI players may speak to it, but only ${human} decides. When ${human} is down, you decide: end_combat with surrender, or fight on.`
    : "- Surrender: while get_state shows a surrender is available, you decide, as no human sits at this table: narrate the foes begging for their lives, then end_combat with surrender to accept it, or narrate the fight going on. The AI players may speak to it.";
  const skills = craftSkills();
  const guidance =
    craft === "prompt"
      ? ["## DM craft", "", ...skills.flatMap((s) => [`### ${s.name}`, "", s.body, ""])]
      : [
          "## DM craft",
          "",
          `Your craft skills hold how to run the table well: ${skills.map((s) => `${CRAFT_NAME}:${s.name} (${s.description})`).join("; ")}. Load the one a situation needs, once per scene.`,
          "",
        ];
  return `You are the Dungeon Master of "${pack.adventure.title}", a game of Dungeons & Dragons (fifth edition, 2024 rules). ${seats}${pronouns}

## How this table works

- A rules engine resolves every rule and every roll: attacks, damage, checks, saves, and the monsters' turns, which it plays itself. You never decide an outcome and never set a number. Never narrate a hit, a wound, a death, a success or a failure the engine didn't report.
- Where everyone stands is the engine's too. Never narrate a character walking up to someone or somewhere unless move put them there. If move is refused, or not allowed now${fightMoves}, the character acts from where they stand: calls out, waits, points.
- You act only through your tools. get_state shows you everything in the scene (creatures with their Hit Points, positions, checks, encounters, spawns, flags); call it when you need it.
- What the table hears from you goes through ${hears}. Anything else you write reaches nobody.

## What the table may hear

A guard reads everything you say to the table and refuses it, with the reason, when it breaks one of these. Then rewrite it.
- No numbers: no digits, and no numbers in words from ten up. A roll may be cited as [r12], only with an id the engine reported.
- No game statistics: Armor Class, AC, DC, Difficulty Class, Hit Points, HP, attack or saving throw bonuses, challenge rating.
- No ids from the scene files: check, encounter, spawn, flag, hazard and stat-block ids. Creature handles and place names are fine.
- No secret the characters haven't found out, in any words. Say how hurt a creature looks (unhurt, bloodied, down), never how close it is to dropping.
The guard reads only what the table hears: tool inputs such as a check's DC are yours.

## Each message says why you are woken

- "Scene ... is loaded": open the scene for the table in two to five sentences, from its prose: what the characters see, and what they can obviously do.
${spoken}
- "Narrate these events": one to three sentences. The table reads your narration, not the engine's lines, and reads it as one running story: say who acted, against whom, and what came of it (missed, wounded, dropped, healed); don't say whose turn it is or comes next; don't set the scene again or describe again a creature the fight already met.
${surrenderWords}- "The fight is over": narrate how it ends, then go on with the scene.
- "The scene is over": your final answer is a short summary for yourself: what happened, what you established, what is left open.

## Running the adventure

- Checks: when one of the scene's checks fits what a character tries (the skeleton's check hints say which intent each answers), request it by its id; each is rolled once. Otherwise name a skill and a DC from the ladder: ${LADDER.join(", ")}. Call for a check only when the outcome is uncertain and something rides on it.
- Fights: start_combat with the scene's encounter when its hint says so. end_combat with fled when one side gets away, scenario when the scene's prose ends the fight.
${surrender}
- Scenes: the skeleton lists the scenes in order with their exits. When an exit's condition holds, narrate the way there and call load_scene with the next scene's id and the party (${party.join(", ")}), adding the handle of any creature that surrendered when the exit carries captives. After the last scene, call end_adventure with the closing narration.
- Memory: remember keeps a fact you established in fiction that the engine doesn't track (a name you improvised, a promise, a door you called locked) for the rest of the adventure. Fiction only: positions, Hit Points and results always come fresh from the engine. Memory can change which check you ask for; it never decides an outcome.
- Actions the adventure didn't plan for (robbing an NPC, threatening a villager): turn the intent into what the engine can do, usually a ladder check. Nothing changes hands and nobody is hurt unless the engine says so; there is no fight with anyone the scene doesn't hold. A consequence the engine doesn't track is fiction you remember, and the adventure goes on along its exits.

Be quick: decide, call the tools, narrate once. Most wakes need one to three tool calls.

${[...guidance, ...dmLanguage(language, Boolean(human))].join("\n")}
## The adventure (only you see it)

${pack.text}`;
}

export interface ModelDmConfig {
  pack: PackText;
  /** The human's character; absent for a table with no human (AGT-40). */
  human?: Handle;
  /** The AI players' characters. */
  players: Handle[];
  choice: ModelChoice;
  /** Default `prompt` (D10). */
  craft?: CraftMode;
  /** What the table hears from the DM is written in; default `en` (decision 0038). */
  language?: Language;
  usage?: UsageLog;
  /** Default `DM_TURN_TIMEOUT_MS`. */
  turnTimeoutMs?: number;
  /** Opens a session; `AgentSession` by default. Tests pass one that calls the tools as a model would. */
  open?: (config: SessionConfig) => TurnSession;
}

export class ModelDm implements DmAgent {
  readonly systemPrompt: string;
  readonly seatTools: SeatTool[];
  private readonly config: ModelDmConfig;
  private session: TurnSession | undefined;
  /** The bound tools while a wake runs; a call outside a wake (after a timeout) does nothing. */
  private current: DmTools | undefined;
  /** What it established in fiction (spec §3.6), in order. */
  readonly memory: string[] = [];
  /** What it wrote at the end of each scene (AGT-6). */
  readonly summaries: string[] = [];

  constructor(config: ModelDmConfig) {
    this.config = config;
    this.systemPrompt = dmPrompt(config.pack, config.human, config.players, config.craft ?? "prompt", config.language);
    this.seatTools = this.defineTools();
  }

  async wake(wake: DmWake, briefing: string, tools: DmTools): Promise<string | void> {
    this.current = tools;
    try {
      const seed = this.session ? undefined : this.seed(await tools.getState());
      this.session ??= this.openSession();
      const result = await this.session.turn(seed ? `${seed}\n\n${briefing}` : briefing, wake);
      if (wake === "summary") return result.final;
    } catch (error) {
      // As for a player: a timed-out session goes on, a plan limit stops the run, and after any
      // other failure the next wake starts a fresh session from the seed.
      if (!(error instanceof TurnTimeout) && !(error instanceof UsageLimitReached)) await this.close();
      throw error;
    } finally {
      this.current = undefined;
    }
  }

  async newScene(summary: string): Promise<void> {
    if (summary.trim()) this.summaries.push(summary.trim());
    await this.close();
  }

  async close(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.close();
  }

  /** What each of its sessions is opened with; the run command's dry run prints it. */
  sessionConfig(): SessionConfig {
    const craft = this.config.craft ?? "prompt";
    return {
      agent: "dm",
      choice: this.config.choice,
      systemPrompt: this.systemPrompt,
      tools: this.seatTools,
      ...(craft === "skills" ? { plugins: [CRAFT_PLUGIN], skills: craftSkills().map((s) => `${CRAFT_NAME}:${s.name}`) } : {}),
      usage: this.config.usage,
      turnTimeoutMs: this.config.turnTimeoutMs ?? DM_TURN_TIMEOUT_MS,
    };
  }

  private openSession(): TurnSession {
    return (this.config.open ?? ((c) => new AgentSession(c)))(this.sessionConfig());
  }

  /** A new session's first lines: the scene as it stands, the story so far, and its memory. */
  private seed(state: ToolOutcome): string {
    return [
      "The scene now:",
      state.ok ? state.text : "(call get_state)",
      ...(this.summaries.length > 0 ? ["", "The story so far, as you summed it up:", ...this.summaries.map((s) => `- ${s}`)] : []),
      ...(this.memory.length > 0 ? ["", "What you established in fiction (your memory):", ...this.memory.map((m) => `- ${m}`)] : []),
    ].join("\n");
  }

  /** Runs a tool call through the wake's bound tools; outside a wake it does nothing. */
  private async bound(use: (tools: DmTools) => ToolOutcome | Promise<ToolOutcome>): Promise<CallToolResult> {
    const tools = this.current;
    if (!tools) return reply("not now: nothing is waiting on you", true);
    const outcome = await use(tools);
    return reply(outcome.text, !outcome.ok);
  }

  /** The DM's tools of spec §3.2. Fields are named one by one, so extra input goes nowhere. */
  private defineTools(): SeatTool[] {
    const human = this.config.human;
    const handle = z.string().describe("A creature's handle, such as goblin_1.");
    const refuse = (text: string): ToolOutcome => ({ ok: false, text });
    const tools = [
      seatTool(
        "get_state",
        "Everything in the scene now, as only you see it: creatures with Hit Points, AC, state and position, places, checks, encounters, spawns, flags.",
        {},
        () => this.bound((t) => t.getState()),
      ),
      seatTool("get_sheet", "A creature's character sheet or stat block.", { actor: handle }, (i) => this.bound((t) => t.getSheet(i.actor))),
      seatTool(
        "load_scene",
        "Load the next scene of the skeleton and carry the party (and any captive) into it.",
        { scene_id: z.string(), party: z.array(handle).describe("Who goes along: the party, plus any captive the exit carries.") },
        (i) => this.bound((t) => t.loadScene(i.scene_id, i.party)),
      ),
      seatTool(
        "start_combat",
        "Start one of the scene's encounters. The engine rolls Initiative and plays the monsters.",
        { encounter_id: z.string() },
        (i) => this.bound((t) => t.startCombat(i.encounter_id)),
      ),
      seatTool(
        "end_combat",
        human
          ? `End the running fight: fled, or scenario. Surrender only after ${human} accepted your offer in words, or when ${human} is down.`
          : "End the running fight: fled, scenario, or surrender while get_state shows one available.",
        { reason: z.enum(["surrender", "fled", "scenario"]) },
        (i) => this.bound((t) => t.endCombat(i.reason)),
      ),
      seatTool(
        "offer_surrender",
        `Offer ${human} the surrender of the creatures get_state lists as surrendering, only while the engine shows one available. The table asks the human at once; nothing happens before the answer.`,
        { handles: z.array(handle).describe("The creatures that give up, as you narrated them.") },
        (i) => this.bound((t) => t.offerSurrender(i.handles)),
      ),
      seatTool("spawn", "Bring in one of the scene's spawns.", { spawn_id: z.string() }, (i) => this.bound((t) => t.spawn(i.spawn_id))),
      seatTool(
        "request_check",
        "Ask a character for an ability check: one of the scene's checks by its id, or a skill with a DC from the ladder. The engine rolls and decides.",
        {
          actor: handle.describe("The character who tries."),
          check_id: z.string().optional().describe("A scene check's id."),
          skill: z.enum(SKILLS).optional(),
          dc: z.number().int().optional().describe(`For a ladder check: ${LADDER.join(", ")}.`),
        },
        (i) =>
          this.bound((t) => {
            if (i.check_id) return t.requestCheck(i.actor, { kind: "scenario", check_id: i.check_id });
            if (i.skill && i.dc !== undefined) {
              return t.requestCheck(i.actor, { kind: "ladder", ability: SKILL_ABILITY[i.skill], skill: i.skill, dc: i.dc });
            }
            return refuse("give a check_id, or a skill and a dc");
          }),
      ),
      seatTool(
        "help",
        "One character helps another: with a check (ally and skill), or by stabilizing a creature at 0 Hit Points (stabilize).",
        { actor: handle.describe("The helper."), ally: handle.optional(), skill: z.enum(SKILLS).optional(), stabilize: handle.optional() },
        (i) =>
          this.bound((t) => {
            if (i.stabilize) return t.help(i.actor, { kind: "stabilize", target: i.stabilize });
            if (i.ally && i.skill) return t.help(i.actor, { kind: "assist_check", ally: i.ally, skill: i.skill });
            return refuse("give an ally and a skill, or stabilize");
          }),
      ),
      seatTool(
        "short_rest",
        "A Short Rest for these characters; each may spend Hit Point Dice.",
        {
          participants: z.array(handle),
          hit_dice: z.array(z.object({ handle, count: z.number().int().positive() })).optional(),
        },
        (i) => this.bound((t) => t.shortRest(i.participants, i.hit_dice?.map((h) => ({ handle: h.handle, count: h.count })))),
      ),
      seatTool(
        "move",
        human
          ? `Out of combat: move any creature to a place (anchor id) or next to a creature. In a fight: only ${human}, on ${human}'s turn, as far as ${human}'s movement goes; the answer says if they stopped short.`
          : "Out of combat: move any creature to a place (anchor id) or next to a creature. In a fight the characters move themselves.",
        { actor: handle, place: z.string().optional(), creature: handle.optional() },
        (i) =>
          this.bound((t) => {
            if (Boolean(i.place) === Boolean(i.creature)) return refuse("give either a place or a creature");
            return t.move(i.actor, i.place ? { kind: "anchor", anchor: i.place } : { kind: "creature", handle: i.creature! });
          }),
      ),
      seatTool(
        "legal_actions",
        `${human}'s options now: any time out of combat, on ${human}'s turn in a fight.`,
        {},
        () => this.bound((t) => t.legalActions()),
      ),
      seatTool(
        "submit",
        `Take one of ${human}'s options for the human, from what they said. Targets by handle; a variant when the option lists them; an aim for an area.`,
        {
          option_id: z.string(),
          targets: z.array(handle).optional(),
          variant: z.string().optional(),
          aim_creature: handle.optional(),
          aim_place: z.string().optional(),
        },
        (i) =>
          this.bound((t) =>
            t.submit({
              option_id: i.option_id,
              ...(i.targets ? { targets: i.targets } : {}),
              ...(i.variant ? { variant: i.variant } : {}),
              ...(i.aim_creature
                ? { aim: { kind: "creature", handle: i.aim_creature } }
                : i.aim_place
                  ? { aim: { kind: "anchor", anchor: i.aim_place } }
                  : {}),
            }),
          ),
      ),
      seatTool("end_turn", `End ${human}'s turn in a fight.`, {}, () => this.bound((t) => t.endTurn())),
      seatTool(
        "grant_action",
        "Out of combat: let an AI player take one of its own options now, such as a spell or a potion it declared.",
        { actor: handle },
        (i) => this.bound((t) => t.grantAction(i.actor)),
      ),
      seatTool(
        "narrate",
        "Say this to the table, or to one character only (to). Fiction only: the guard refuses numbers, game statistics and ids.",
        { text: z.string(), to: handle.optional() },
        (i) => this.bound((t) => t.narrate(i.text, i.to)),
      ),
      seatTool(
        "ask_human",
        `Ask the human playing ${human} a question; their next words answer it.`,
        { question: z.string() },
        (i) => this.bound((t) => t.askHuman(i.question)),
      ),
      seatTool(
        "remember",
        "Keep a fact you established in fiction for the rest of the adventure. Fiction only, no numbers.",
        { fact: z.string() },
        (i) =>
          this.bound((t) => {
            const outcome = t.remember(i.fact);
            if (outcome.ok) this.memory.push(i.fact);
            return outcome;
          }),
      ),
      seatTool(
        "end_adventure",
        "The adventure's last scene is over: the closing narration, then the run ends.",
        { text: z.string() },
        (i) => this.bound((t) => t.endAdventure(i.text)),
      ),
    ];
    // With no human at the table, nothing is the human's to take, ask or answer (M7 spec §4.2).
    const humanOnly = new Set(["offer_surrender", "legal_actions", "submit", "end_turn", "ask_human"]);
    return human ? tools : tools.filter((tool) => !humanOnly.has(tool.name));
  }
}
