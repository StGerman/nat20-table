// An AI player on the Claude Agent SDK (M6 spec §3.2, §3.6, step 9; TASKS.md AGT-5, AGT-6, AGT-21,
// CHR-5). It plays one character through the seat tools the orchestrator bound to that character:
// its system prompt is our own text and its personality card, and it has no tool but these. One
// session per scene: at a scene change it closes the session, and the next one starts from its
// sheet, its own notes and the summaries it wrote, so its context stays bounded by one scene.
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

/** How much of its notes a new session is seeded with; older notes live on in the summaries. */
const NOTES_BUDGET = 2_000;

export interface ModelPlayerConfig {
  handle: Handle;
  /** The character's personality card from the scenario pack (CHR-5), as Markdown. */
  card: string;
  choice: ModelChoice;
  /** What the player says, declares, notes and summarises is written in; default `en` (decision 0038). */
  language?: Language;
  usage?: UsageLog;
  /** Default `PLAYER_TURN_TIMEOUT_MS`. */
  turnTimeoutMs?: number;
  /** Opens a session; `AgentSession` by default. Tests pass one that calls the tools as a model would. */
  open?: (config: SessionConfig) => TurnSession;
}

/** The character's name: the card's first heading, else its handle. */
export function cardName(handle: Handle, card: string): string {
  return /^#\s+(.+)$/m.exec(card)?.[1].trim() ?? handle;
}

/** The player's system prompt: the same for every session of the run, so it stays cached. */
export function playerPrompt(handle: Handle, card: string, language: Language = "en"): string {
  const name = cardName(handle, card);
  return `You are a player at a game of Dungeons & Dragons (fifth edition, 2024 rules). You play one character, ${name} (handle ${handle}), and only ${name}. Another AI runs the game as the Dungeon Master (DM). A human and other AI players play the other characters.

Who ${name} is, from your personality card:

${card.trim()}

How this table works:
- A rules engine resolves every rule and every roll. You decide what ${name} does; the engine says what happens. Never decide an outcome yourself, and never claim a roll or a result the engine didn't report.
- You act only through your tools, and they always act as ${name}.
- You know only what ${name} knows: your own sheet, what you perceive (look), what you are told, and your own notes. You don't know an enemy's Hit Points or Armor Class or the DC of a check, and you don't ask for them.

Each message says why you are woken:
- "It is your turn in the fight": your options are listed with their ids and targets. Decide quickly. Usually: move if you must, take one option with submit_decision (an attack, a spell, Dodge), add a bonus action if one helps, then call end_turn. Name targets by handle. If the engine refuses something, read why and pick another option. Always finish with end_turn. You may also say one short line with say, reacting to what happened since your last turn (an ally falling, a kill, words aimed at you), when ${name} would; often ${name} says nothing.
- "You may react now": call react with the choice number to take it, or with null to let it pass.
- "Do you raise your hand?": out of combat, after the human's character acted, before anyone has the floor. First decide as ${name}: is any of this important to ${name} now, given ${name}'s goal, character and view of the others (your card's "Talk and silence" and "With the party", and your notes)? If not, just PASS: that is a normal answer, and in most rounds someone at the table stays quiet. If it is, ${name} may speak, act without a word, or both. Call no tool: your final answer starts with SPEAK (a line to say), BOTH (a line and a deed), ACT: and one sentence on what ${name} does without a word ("ACT: ${name} kneels to look at the tracks."), or PASS, and if you like, on the next line, half a sentence of why that nobody hears. Those who raise a hand then get the floor one at a time, each hearing what was said before.
- "You have the floor": you raised your hand, someone named ${name}, or a companion spoke to ${name}. Read what was said since; if it has been said, a word of agreement or PASS. When you were named or asked, answer, in words, deeds or both, or refuse in character. To speak, say one short line in character with say. Then your final answer is one sentence on what ${name} sets out to do ("${name} kneels to look at the tracks."), or PASS when ${name} only spoke or does nothing new. Don't take an option here: the DM decides what happens, and may let you act. "Declare again" asks the same after a refusal.
- "Something just happened in the fight": it isn't your turn, and the fight goes on without waiting. If ${name} would react aloud to it (an ally falling or back up, a foe down or yielding, a great blow, a hit on ${name}), say one short line with say; otherwise just answer PASS. Call no other tool. Only the first companion to speak is heard, so a line that comes too late reaches nobody.
- "The DM lets you act now": take one of your options with submit_decision.
- "The scene is over": your final answer is a summary in a few sentences of fiction, for your own memory: what happened, who you met, what you promised or suspect.

Speaking and notes:
- say is heard by everyone at the table. Speak as ${name}, in character and briefly, in the voice and temperament of your card. Don't repeat what someone else already said: a word of agreement, or silence, beats a retelling. If you have something to say to the last speaker, answer them. Never put numbers or game terms in it: no Hit Points, Armor Class, DCs, dice or bonuses. Say "I'm badly hurt", not "I have 3 HP".
- When ${name} turns to one companion (a remark, an opinion, a request, a proposal), give their handle as to; a line for the whole party needs no to. Choose whom and how from your card's "With the party" and your bond notes, never from anyone's sheet. Out of combat the one you speak to has the floor next, in a fight they hear it on their own turn. The human's character answers when its player likes; nobody waits for it. A line spoken to ${name} ("<speaker> says to you") asks nothing of your tools: help, answer, argue, refuse or let it pass, as ${name} would. Help with a deed is something you declare, and the DM resolves it.
- note keeps a private note that nobody else reads: a fact, promise, suspicion, plan or bond that will matter later in the adventure. Write fiction, never numbers: Hit Points, positions and results are always read fresh from the engine. Note only what matters to ${name}; one or two notes a scene is plenty.

Be quick: at most a sentence of reasoning between tool calls. Text you write outside say, and outside your final answer to a hand, a declaration or a summary, reaches nobody.${playerLanguage(language)}`;
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
    this.systemPrompt = playerPrompt(config.handle, config.card, config.language);
    this.seatTools = this.defineTools();
  }

  async wake(wake: PlayerWake, briefing: string, tools: PlayerTools): Promise<string | void> {
    const running = {};
    this.running = running;
    this.current = tools;
    try {
      const seed = this.session ? undefined : this.seed(await tools.mySheet());
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

  private openSession(): TurnSession {
    const config: SessionConfig = {
      agent: this.handle,
      choice: this.config.choice,
      systemPrompt: this.systemPrompt,
      tools: this.seatTools,
      usage: this.config.usage,
      turnTimeoutMs: this.config.turnTimeoutMs ?? PLAYER_TURN_TIMEOUT_MS,
    };
    return (this.config.open ?? ((c) => new AgentSession(c)))(config);
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
  private async bound(use: (tools: PlayerTools) => Promise<ToolOutcome>): Promise<CallToolResult> {
    const tools = this.current;
    if (!tools) return reply("not now: the table isn't waiting on you", true);
    // A call from a turn that timed out must not act in the wake that came after it.
    if (this.session?.settling) return reply("not now: that turn is over", true);
    const outcome = await use(tools);
    return reply(outcome.text, !outcome.ok);
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
        () => this.bound((t) => t.legalActions()),
      ),
      seatTool(
        "submit_decision",
        "Take one option from legal_actions. Name its targets by handle; a target marked (walks first) is out of reach and you walk to it first. Give a variant when the option lists them, and an aim (a creature or a place) for an area.",
        {
          option_id: z.string().describe("The option's id, such as melee_attack/mace."),
          targets: z.array(handle).optional(),
          variant: z.string().optional(),
          aim_creature: handle.optional().describe("For an area: the creature to centre it on."),
          aim_place: z.string().optional().describe("For an area: the place (anchor id) to centre it on."),
        },
        (input) =>
          this.bound((t) =>
            t.submitDecision({
              option_id: input.option_id,
              ...(input.targets ? { targets: input.targets } : {}),
              ...(input.variant ? { variant: input.variant } : {}),
              ...(input.aim_creature
                ? { aim: { kind: "creature", handle: input.aim_creature } }
                : input.aim_place
                  ? { aim: { kind: "anchor", anchor: input.aim_place } }
                  : {}),
            }),
          ),
      ),
      seatTool(
        "move",
        "On your turn in a fight: walk to a place (its anchor id) or up to a creature (its handle). Leaving an enemy's reach can provoke an Opportunity Attack.",
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
