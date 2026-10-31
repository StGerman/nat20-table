// An AI player on the Claude Agent SDK (M6 spec §3.2, §3.6, step 9; TASKS.md AGT-5, AGT-6, AGT-21,
// CHR-5, AGT-52). It plays one character through the seat tools the orchestrator bound to that
// character: its system prompt is our own text, its personality card and the rules primer for its
// class, and it has no tool but these. One
// session per scene: at a scene change it closes the session, and the next one starts from its
// sheet, its own notes and the summaries it wrote, so its context stays bounded by one scene.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Handle } from "@nat20-table/engine-client";
import { z } from "zod";
import { NOTE_KINDS, type NoteKind } from "../table/state.ts";
import type { PlayerTools } from "../table/tools.ts";
import type { PlayerAgent, PlayerWake, ToolOutcome } from "../table/types.ts";
import type { UsageLog } from "../usage.ts";
import { TurnCancelled, TurnTimeout, UsageLimitReached } from "../errors.ts";
import { playerLanguage, type Language } from "./language.ts";
import { AgentSession, reply, seatTool, type CallToolResult, type ModelChoice, type SeatTool, type SessionConfig, type TurnSession } from "./sdk-session.ts";

/** A player turn that runs longer falls back (spec §6). */
export const PLAYER_TURN_TIMEOUT_MS = 20_000;
/**
 * The limit for a combat turn or an action the DM granted. They take a few model calls each, and a
 * fallback there loses the character's turn; Sonnet players at low effort already ran combat turns
 * past 20 s, and the unattended run's are at medium (decision 0047).
 */
export const PLAYER_LONG_WAKE_TIMEOUT_MS = 45_000;
const PLAYER_LONG_WAKES: PlayerWake[] = ["combat_turn", "granted"];

/**
 * A combat turn ends for the loop once the player ended it (M10 S2, S3; decision 0053): with
 * `end_turn`, or a `submit_decision` that ended it too. The closing call drains in the background.
 */
export const PLAYER_SETTLE_ON: Partial<Record<PlayerWake, readonly string[]>> = { combat_turn: ["end_turn"] };

/**
 * The players' rules primer (AGT-52): the 2024 rules a player needs at this table, and one block per
 * class, in our own words from SRD 5.2.1 and kept to what the engine does.
 */
const PRIMER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "primer");

/**
 * The rules primer for a character of `characterClass` (`fighter`): the common rules, then its class
 * block. A class with no block throws, so no player sits down without its class's rules.
 */
export function rulesPrimer(characterClass: string): string {
  const block = path.join(PRIMER, `${characterClass}.md`);
  if (!/^[a-z_]+$/.test(characterClass) || !existsSync(block)) {
    throw new Error(`no rules primer block for class ${JSON.stringify(characterClass)}: add game/src/agents/primer/<class>.md`);
  }
  return `${readFileSync(path.join(PRIMER, "rules.md"), "utf8").trim()}\n\n${readFileSync(block, "utf8").trim()}`;
}

/** How much of its notes a new session is seeded with; older notes live on in the summaries. */
const NOTES_BUDGET = 2_000;

export interface ModelPlayerConfig {
  handle: Handle;
  /** The character's personality card from the scenario pack (CHR-5), as Markdown. */
  card: string;
  choice: ModelChoice;
  /** What the player says, declares, notes and summarises is written in; default `en` (decision 0038). */
  language?: Language;
  /** Whether a human plays one of the other characters; default true. False for a table with no human (AGT-40). */
  withHuman?: boolean;
  /** The character's class from its pregen (`fighter`), for its block of the rules primer. */
  characterClass: string;
  /** The pack's one Russian name per party member (`PackParty.russianNames`), for a Russian prompt (AGT-38); never the NPCs'. */
  russianNames?: readonly string[];
  usage?: UsageLog;
  /** Every wake's limit. Default `PLAYER_TURN_TIMEOUT_MS`, and `PLAYER_LONG_WAKE_TIMEOUT_MS` for the long wakes. */
  turnTimeoutMs?: number;
  /** Opens a session; `AgentSession` by default. Tests pass one that calls the tools as a model would. */
  open?: (config: SessionConfig) => TurnSession;
}

/**
 * A card's optional `## Voice in Russian` section: how the character sounds in Russian, in our own
 * Russian words. It leaves the card and reaches only a Russian prompt, after the language rule.
 */
const RUSSIAN_VOICE = /^## +Voice in Russian[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m;

/** The card as the prompt shows it under "Your character": without its Russian voice. */
export function promptCard(card: string): string {
  return card.replace(RUSSIAN_VOICE, "").trim();
}

/** The character's name: the card's first heading, else its handle. */
export function cardName(handle: Handle, card: string): string {
  return /^#\s+(.+)$/m.exec(card)?.[1].trim() ?? handle;
}

/** The player's system prompt: the same for every session of the run, so it stays cached. */
export function playerPrompt(handle: Handle, fullCard: string, characterClass: string, language: Language = "en", human = true, names: readonly string[] = []): string {
  const name = cardName(handle, fullCard);
  const russianVoice = RUSSIAN_VOICE.exec(fullCard)?.[1].trim();
  const card = promptCard(fullCard);
  // A table with no human has only AI players, and a round starts from the DM (M7 spec §4.2, AGT-40).
  const others = human ? "A human and other AI players play the other characters." : "Other AI players play the other characters.";
  const after = human ? "after the human's character acted" : "after the DM narrated";
  const waits = human ? " The human's character answers when its player likes; nobody waits for it." : "";
  return `You are a player at a game of Dungeons & Dragons (fifth edition, 2024 rules). You play one character, ${name} (handle ${handle}), and only ${name}. Another AI runs the game as the Dungeon Master (DM). ${others}

## At the table

You are a player at a game table, and you know it: this is a game the people at the table play together. The DM runs the world and everyone in it; the players share one party that wins or loses together. A good player keeps the game moving, leaves room for the others, follows the DM's lead, and plays for a story the whole table enjoys. You can ask the DM what ${name} sees, or whether something can be done, by declaring it. You don't know what lies ahead: not how many fights, places or foes the adventure holds.

${rulesPrimer(characterClass)}

## Your character

Who ${name} is, from your personality card:

${card.trim()}

- ${name}'s temperament shapes what ${name} says and risks. Play it fully, but never throw ${name}'s life, or a companion's, away for a moment of drama.
- Personality first, and the party still holds. ${name} meets a plan, a rest or a companion in danger in ${name}'s own way: eagerly, grudgingly, for a price, or with a sneer. However selfish or cold ${name} is, you as the player find ${name}'s own reason to stick with the party (their own skin, a share, a debt, pride, a grudge against the foe): temperament shapes how ${name} goes along, never whether the party holds together.

## Play as a team

The party survives together or not at all. Decide together, in the table talk you already have:
- Before the party heads into the unknown, propose what to do, or agree with or question someone else's plan. Say in plain words what ${name} can still do ("I've no prayers left", "I can mend one more wound").
- When you are hurt or spent, say so and ask for a rest before going on. If a companion asks, back them unless something presses.
- Spend limited powers when they turn a fight, and keep something back when you can: you never know what comes next.
- In a fight, call it: name the foe you go for, call for help, call the retreat. Join the foe your companions are hitting until it falls.
- A fallen companion comes first: get them up if you can.
- Don't fight alone in the open: stay where companions can help you and fewer foes can reach you, and fall back together when the fight turns.
- Argue in character if you disagree, then go with what the party decides.
- When the party agrees on something (a plan, a rule, who does what), write it down with note as a plan, and follow it later, also in a new scene. If it goes against what ${name} believes or would never do, ${name} comes first: say so aloud, in character, and don't just ignore it.

## How this table works

- A rules engine resolves every rule and every roll. You decide what ${name} does; the engine says what happens. Never decide an outcome yourself, and never claim a roll or a result the engine didn't report.
- You act only through your tools, and they always act as ${name}.
- You know only what ${name} knows: your own sheet, what you perceive (look), what you are told, and your own notes. You don't know an enemy's Hit Points or Armor Class or the DC of a check, and you don't ask for them.

## Why you are woken

Each message says why:
- "It is your turn in the fight": your options are listed with their ids and targets. Make the short check below, then usually one call: submit_decision with the option (an attack, a spell, a heal, Help), a line in say if ${name} would speak, and end_turn: true. Move first if you must, and leave end_turn out only when a bonus action after the option helps; then take it and call end_turn. Name targets by handle. If the engine refuses something, read why and pick another option. Always end the turn. The line reacts to what happened since your last turn (an ally falling, a kill, words aimed at you); often ${name} says nothing.
- "You may react now": call react with the choice number to take it, or with null to let it pass.
- "Do you raise your hand?": out of combat, ${after}, before anyone has the floor. First decide as ${name}: is any of this important to ${name} now, given ${name}'s goal, character and view of the others (your card's "Talk and silence" and "With the party", and your notes)? A plan, a rest or a companion in danger usually is, for ${name}'s own reasons. If not, just PASS: that is a normal answer, and in most rounds someone at the table stays quiet. If it is, ${name} may speak, act without a word, or both. Call no tool: your final answer starts with SPEAK (a line to say), BOTH (a line and a deed), ACT: and one sentence on what ${name} does without a word ("ACT: ${name} kneels to look at the tracks."), or PASS, and if you like, on the next line, half a sentence of why that nobody hears. Those who raise a hand then get the floor one at a time, each hearing what was said before.
- "You have the floor": you raised your hand, someone named ${name}, or a companion spoke to ${name}. Read what was said since; if it has been said, a word of agreement or PASS. When you were named or asked, answer, in words, deeds or both, or refuse in character. To speak, say one short line in character with say. Then your final answer is one sentence on what ${name} sets out to do ("${name} kneels to look at the tracks."), or PASS when ${name} only spoke or does nothing new. Don't take an option here: the DM decides what happens, and may let you act. "Declare again" asks the same after a refusal.
- "Something just happened in the fight": it isn't your turn, and the fight goes on without waiting. If ${name} would react aloud to it (an ally falling or back up, a foe down or yielding, a great blow, a hit on ${name}), say one short line with say; otherwise just answer PASS. Call no other tool. Only the first companion to speak is heard, so a line that comes too late reaches nobody.
- "The DM lets you act now": take one of your options with submit_decision.
- "The scene is over": your final answer is a summary in a few sentences of fiction, for your own memory: what happened, who you met, what the party decided, what you promised or suspect.

## Speaking and notes

- say is heard by everyone at the table. Speak as ${name}, in character and briefly, in the voice and temperament of your card. Don't repeat what someone else already said: a word of agreement, or silence, beats a retelling. If you have something to say to the last speaker, answer them. Never put numbers or game terms in it: no Hit Points, Armor Class, DCs, dice or bonuses. Say "I'm badly hurt", not "I have 3 HP".
- When ${name} turns to one companion (a remark, an opinion, a request, a proposal), give their handle as to; a line for the whole party needs no to. Choose whom and how from your card's "With the party" and your bond notes, never from anyone's sheet. Out of combat the one you speak to has the floor next, in a fight they hear it on their own turn.${waits} A line spoken to ${name} ("<speaker> says to you") asks nothing of your tools: help, answer, argue, refuse or let it pass, as ${name} would. Help with a deed is something you declare, and the DM resolves it.
- note keeps a private note that nobody else reads: a fact, promise, suspicion, plan or bond that will matter later in the adventure; a decision the party made is a plan. Write fiction, never numbers: Hit Points, positions and results are always read fresh from the engine. Note only what matters to ${name}; one or two notes a scene is plenty, besides the party's decisions.

Before you act in a fight, check three things in a line or two: is a companion down within your reach or range, which foe your companions are hitting, and whether you stand where many foes can reach you. Then act. Elsewhere, keep your reasoning to a sentence between tool calls. Text you write outside say, and outside your final answer to a hand, a declaration or a summary, reaches nobody.${playerLanguage(language, russianVoice, names)}`;
}

/** A declaration as the loop takes it: one line, or undefined for a pass. */
export function declaration(answer: string): string | undefined {
  const line = answer.trim().replace(/^["“](.*)["”]$/s, "$1").trim();
  return line === "" || /^pass\b/i.test(line) ? undefined : line;
}

export class ModelPlayer implements PlayerAgent {
  readonly handle: Handle;
  readonly reacts = true;
  readonly systemPrompt: string;
  private readonly config: ModelPlayerConfig;
  /** The seat tools the model sees; each acts through the tools of the wake that is running. */
  readonly seatTools: SeatTool[];
  private session: TurnSession | undefined;
  /** The actions whose summary this session has read, so `legal_actions` gives each once. */
  private described = new Set<string>();
  /** The bound tools while a wake runs; a call outside a wake (after a timeout) does nothing. */
  private current: PlayerTools | undefined;
  /** The wake running, and the wakes cancelled before their turn was sent (AGT-34). */
  private running: object | undefined;
  private readonly cancelled = new WeakSet<object>();
  /** Its notes, in order (spec §3.6). */
  readonly notes: Array<{ kind: NoteKind; text: string }> = [];
  /** What it wrote at the end of each scene (AGT-6). */
  readonly summaries: string[] = [];

  constructor(config: ModelPlayerConfig) {
    this.config = config;
    this.handle = config.handle;
    this.systemPrompt = playerPrompt(config.handle, config.card, config.characterClass, config.language, config.withHuman ?? true, config.russianNames);
    this.seatTools = this.defineTools();
  }

  async wake(wake: PlayerWake, briefing: string, tools: PlayerTools): Promise<string | void> {
    const running = {};
    this.running = running;
    this.current = tools;
    try {
      const seed = this.session ? undefined : this.seed(await tools.sheet());
      // Cancelled while its sheet came: the loop has moved on, maybe to this player's next wake.
      if (this.cancelled.has(running)) throw new TurnCancelled(`${this.handle}: wake cancelled before its turn`);
      if (!this.session) {
        tools.record(this.systemPrompt);
        this.session = this.openSession();
      }
      if (seed) tools.record(seed);
      const result = await this.session.turn(seed ? `${seed}\n\n${briefing}` : briefing, wake);
      if (wake === "declare") return declaration(result.final);
      if (wake === "hand" || wake === "summary" || wake === "bark") return result.final;
    } catch (error) {
      // A timed-out session goes on, and a plan limit stops the run. After any other failure the
      // session may be dead, so the next wake starts a fresh one from the seed.
      if (!(error instanceof TurnTimeout) && !(error instanceof UsageLimitReached)) await this.close();
      throw error;
    } finally {
      // A cancelled wake ends after the loop may have started the next one, whose tools stay.
      if (this.current === tools) this.current = undefined;
      if (this.running === running) this.running = undefined;
    }
  }

  cancel(): void {
    if (this.running) this.cancelled.add(this.running);
    this.session?.cancel?.();
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

  /** What each of its sessions is opened with. */
  sessionConfig(): SessionConfig {
    return {
      agent: this.handle,
      choice: this.config.choice,
      systemPrompt: this.systemPrompt,
      tools: this.seatTools,
      usage: this.config.usage,
      settleOn: PLAYER_SETTLE_ON,
      turnTimeoutMs: this.config.turnTimeoutMs ?? PLAYER_TURN_TIMEOUT_MS,
      ...(this.config.turnTimeoutMs === undefined ? { turnTimeoutsMs: Object.fromEntries(PLAYER_LONG_WAKES.map((w) => [w, PLAYER_LONG_WAKE_TIMEOUT_MS])) } : {}),
    };
  }

  private openSession(): TurnSession {
    // A new session hasn't read any option's summary yet (formatOptions).
    this.described = new Set();
    return (this.config.open ?? ((c) => new AgentSession(c)))(this.sessionConfig());
  }

  /** A new session's first lines: its sheet, the newest notes that fit, and the story so far. */
  private seed(sheet: ToolOutcome): string {
    const kept: string[] = [];
    let size = 0;
    for (const note of [...this.notes].reverse()) {
      const line = `- ${note.kind}: ${note.text}`;
      if (size + line.length > NOTES_BUDGET) break;
      kept.unshift(line);
      size += line.length;
    }
    return [
      "Your character sheet (only you see it):",
      sheet.ok ? sheet.text : "(not available; call my_sheet)",
      ...(this.summaries.length > 0 ? ["", "The story so far, as you summed it up:", ...this.summaries.map((s) => `- ${s}`)] : []),
      ...(kept.length > 0
        ? ["", `Your notes${kept.length < this.notes.length ? " (the newest; older ones are in your summaries)" : ""}:`, ...kept]
        : []),
    ].join("\n");
  }

  /** Runs a tool call through the wake's bound tools; outside a wake it does nothing. */
  private async bound(use: (tools: PlayerTools) => Promise<ToolOutcome & { ended?: boolean }>): Promise<CallToolResult> {
    const tools = this.current;
    if (!tools) return reply("not now: the table isn't waiting on you", true);
    // A call from a turn that timed out, or one the player already ended, must not act in the wake after it.
    if (this.session?.settling) return reply("not now: that turn is over", true);
    const outcome = await use(tools);
    const answer = reply(outcome.text, !outcome.ok);
    return outcome.ended ? { ...answer, _meta: { settles_as: "end_turn" } } : answer;
  }

  /**
   * One option, then a line and the turn's end if asked (M10 S3): one model call for a plain attack.
   * A refused option stops there, so nothing is said and the turn stays open for a retry.
   */
  private async decide(t: PlayerTools, decision: Parameters<PlayerTools["submitDecision"]>[0], then: { say?: string; say_to?: Handle; end_turn?: boolean }): Promise<ToolOutcome & { ended?: boolean }> {
    const submitted = await t.submitDecision(decision);
    if (!submitted.ok || (!then.say && !then.end_turn)) return submitted;
    const parts = [submitted.text];
    if (then.say) {
      const said = await t.say(then.say, then.say_to);
      parts.push(said.ok ? `said: ${said.text}` : `your line was not said: ${said.text}`);
    }
    let ended = false;
    if (then.end_turn) {
      const state = t.turnState();
      if (state === "open") {
        const end = await t.endTurn();
        ended = end.ok;
        parts.push(end.ok ? end.text : `the turn goes on: ${end.text}`);
      } else if (state === "reaction") parts.push("the turn waits on a reaction; end it once you are woken again");
      else {
        ended = true;
        parts.push("turn ended");
      }
    }
    return { ok: true, text: parts.join("\n"), ended };
  }

  /**
   * The model's tools, one per seat tool of spec §3.2. No input has a viewer, actor or prompt id:
   * the bound tools fill them in. Fields are named one by one, so extra input goes nowhere.
   */
  private defineTools(): SeatTool[] {
    const handle = z.string().describe("A creature's handle, such as goblin_1.");
    return [
      seatTool("my_sheet", "Your character sheet: abilities, Hit Points, spells and slots, equipment.", {}, () => this.bound((t) => t.mySheet())),
      seatTool(
        "look",
        "What your character perceives now: the round, the places around, and every creature you can see with its distance and how hurt it looks.",
        {},
        () => this.bound((t) => t.look()),
      ),
      seatTool(
        "legal_actions",
        "The options you can take now, each with its id, cost and targets: on your turn in a fight, or when the DM lets you act.",
        {},
        () => this.bound((t) => t.legalActions(this.described)),
      ),
      seatTool(
        "submit_decision",
        "Take one option from legal_actions. Name its targets by handle; a target marked (walks first) is out of reach and you walk to it first. Give a variant when the option lists them, and an aim (a creature or a place) for an area. In a fight you may add a line to say and end_turn: true, so one call takes the option, speaks and ends the turn; if the option is refused, nothing is said and the turn goes on.",
        {
          option_id: z.string().describe("The option's id, such as melee_attack/mace."),
          targets: z.array(handle).optional(),
          variant: z.string().optional(),
          aim_creature: handle.optional().describe("For an area: the creature to centre it on."),
          aim_place: z.string().optional().describe("For an area: the place (anchor id) to centre it on."),
          say: z.string().optional().describe("A short line to say aloud after the option, in character; as with say."),
          say_to: handle.optional().describe("The companion the line is meant for, by handle."),
          end_turn: z.boolean().optional().describe("true to end your turn after the option (and the line)."),
        },
        (input) =>
          this.bound((t) =>
            this.decide(t, {
              option_id: input.option_id,
              ...(input.targets ? { targets: input.targets } : {}),
              ...(input.variant ? { variant: input.variant } : {}),
              ...(input.aim_creature
                ? { aim: { kind: "creature", handle: input.aim_creature } }
                : input.aim_place
                  ? { aim: { kind: "anchor", anchor: input.aim_place } }
                  : {}),
            }, { ...(input.say ? { say: input.say } : {}), ...(input.say_to ? { say_to: input.say_to } : {}), ...(input.end_turn ? { end_turn: true } : {}) }),
          ),
      ),
      seatTool(
        "move",
        "On your turn in a fight: walk to a place (its anchor id) or up to a creature (its handle). If it is farther than your movement, you walk as far as you can and the answer says you stopped short. Leaving an enemy's reach can provoke an Opportunity Attack.",
        { place: z.string().optional().describe("An anchor id from look."), creature: handle.optional() },
        (input) => {
          if (Boolean(input.place) === Boolean(input.creature)) {
            return this.bound(async (t) => {
              const text = "give either a place or a creature";
              t.record(text);
              return { ok: false, text };
            });
          }
          return this.bound((t) =>
            t.move(input.place ? { kind: "anchor", anchor: input.place } : { kind: "creature", handle: input.creature! }),
          );
        },
      ),
      seatTool("end_turn", "End your turn in a fight.", {}, () => this.bound((t) => t.endTurn())),
      seatTool(
        "react",
        "Answer a reaction you were offered: the choice number to take it, or null to let it pass.",
        { choice: z.number().int().nullable() },
        (input) => this.bound((t) => t.react(input.choice)),
      ),
      seatTool(
        "say",
        "Say a line aloud, in character; everyone at the table hears it. No numbers or game terms.",
        {
          text: z.string(),
          to: handle.optional().describe("The companion you speak to, by handle, when the line is meant for one of them."),
        },
        (input) => this.bound((t) => t.say(input.text, input.to)),
      ),
      seatTool(
        "note",
        "Keep a private note; nobody else reads it. Fiction only, never numbers.",
        { kind: z.enum(NOTE_KINDS), text: z.string() },
        (input) =>
          this.bound(async (t) => {
            const outcome = await t.note(input.kind, input.text);
            if (outcome.ok) this.notes.push({ kind: input.kind, text: input.text });
            return outcome;
          }),
      ),
    ];
  }
}
