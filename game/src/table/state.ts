// What the orchestrator knows about the table between engine calls, and the only way text moves
// between seats (M6 spec §3.1, §3.5, §3.6). Agents never reach this object directly: they get the
// bound tools in tools.ts, which call it.
import { appendFileSync } from "node:fs";
import type { Awaiting, Event, Handle, Response } from "@nat20-table/engine-client";
import type { GameEngine } from "../engine.ts";
import { eventLine, noDeaths, tellable } from "../view.ts";
import type { Address } from "./floor.ts";
import { Transcript } from "./transcript.ts";
import type { Seat, TableEvent, ToolOutcome } from "./types.ts";

/** Kinds of private note an AI player keeps (spec §3.6, AGT-21). */
export const NOTE_KINDS = ["fact", "promise", "suspicion", "plan", "bond"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/**
 * A check on text one seat writes for others (spec §3.5, AGT-20). Returns why the text is refused,
 * or undefined to let it through. Step 10 fills these in; until then everything passes.
 */
export type TextGuard = (text: string) => string | undefined;

export interface TableOptions {
  engine: GameEngine;
  /** The human's character. */
  human: Handle;
  /** The AI players' characters. */
  players: Handle[];
  seat: Seat;
  transcript: Transcript;
  /** Every model input a player agent gets and everything the human seat gets (spec §3.5, AGT-19). */
  inputsFile?: string;
  narrationGuard?: TextGuard;
  speechGuard?: TextGuard;
  /** Rejections a decision may take before the loop falls back (spec §6). Default 2. */
  maxRetries?: number;
}

/** How many engine lines `/log` shows. */
const RECENT_LINES = 20;

export class TableState {
  readonly engine: GameEngine;
  readonly human: Handle;
  readonly players: Handle[];
  readonly seat: Seat;
  readonly transcript: Transcript;
  /** The engine's last `awaiting`: whose decision it waits on. Every response updates it. */
  awaiting: Awaiting = { kind: "none" };
  /** AI players the DM granted one explore action, not yet used (spec §3.3 step 4). */
  readonly grants = new Set<Handle>();
  /** Lines each AI player hears before its next wake: narration to the table or to it, speech. */
  private readonly inboxes = new Map<Handle, string[]>();
  /** Lines the DM hears before its next wake: what players said and declared. */
  private dmInbox: string[] = [];
  /** The lines that carry the human's typed words to the AI players, as they hear them. */
  private readonly humanLines = new Set<string>();
  /** Each AI player's private notes, in order (spec §3.6). Only that player reads them. */
  readonly notes = new Map<Handle, Array<{ kind: NoteKind; text: string }>>();
  /** What the DM established in fiction (spec §3.6). Only the DM reads it. */
  readonly dmMemory: string[] = [];
  /** Deaths and scene loads read so far, so a dead creature's later empty turns are told to nobody. */
  readonly deaths = noDeaths();
  /**
   * Rejections and guard refusals in the decision each seat is making now (spec §6), by seat: a
   * player's handle, or `dm`. Per seat, because the AI players declare in parallel.
   */
  private readonly retryCounts = new Map<string, number>();
  readonly maxRetries: number;
  /** Accepted state changes so far, so the loop can tell whether a wake did anything. */
  acted = 0;
  /** A question the DM asked the human that the human hasn't answered yet. */
  question: string | undefined;
  /**
   * A surrender the DM offered that the human hasn't answered yet (TASKS.md AGT-30): the creatures
   * the DM named. While it is open nothing else changes the session, so no creature acts between
   * the offer and the answer. `words` is set while the DM maps the human's typed answer: only then
   * may the DM accept it with `end_combat`.
   */
  surrender: { handles: Handle[]; words: boolean } | undefined;
  /** DM narrations and questions the human was shown, so the loop can tell whether a wake answered them. */
  dmToHuman = 0;
  /** Why the run ended, once it has. */
  ended: string | undefined;
  /** The human's own rejected decisions: no limit, but acceptance 5 counts them (spec §6). */
  humanRejections = 0;
  /** Fallbacks the loop took (spec §6). */
  fallbacks = 0;
  /** Lines the AI players spoke in fights, on their turns and between them (party talk goal 4). */
  fightLines = 0;
  /** While set, `flush` shows only events up to this seq: the DM is narrating one part of a batch. */
  flushLimit: number | undefined;
  /**
   * While set, a `flush` given no `holdFrom` holds lines from the first event this matches: the DM
   * is narrating the human's turn as it maps the human's words, and what follows the turn waits.
   */
  hold: ((event: Event) => boolean) | undefined;
  /** The seq of the last engine line the DM's narration came after: what its latest narration covers. */
  narratedTo = -1;
  /** The last engine lines shown to the human, for `/log`. */
  readonly recent: string[] = [];
  /**
   * While the AI players are woken in parallel (the scene summaries), what each one says waits here
   * and reaches the table in seat order, so the order never depends on which model was faster. In a
   * talk round, lines reach the table as they are spoken (party talk §4.2).
   */
  private collecting: Map<Handle, Array<() => Promise<void>>> | undefined;
  /**
   * The DM's narrations to the whole table out of combat since the last talk round: an AI player
   * one of them speaks to has the floor first in the next talk round (party talk §4.2). A fight's
   * narrations («Ильса, твой ход») aren't kept, and a fight drops the ones before it.
   */
  private narrations: string[] = [];
  /**
   * Lines the AI players spoke to a companion out of combat, since the loop last took them (party
   * talk §4.4): one hands its addressee the floor. The loop drops them in a fight.
   */
  private addresses: Address[] = [];
  /**
   * The AI players who spoke since the talk round began. A declaration from one of them retells its
   * own line, so the human's screen leaves it out (party talk §6); the DM and the transcript still
   * get it.
   */
  private readonly spokeThisRound = new Set<Handle>();
  /** The AI players who declared something since the talk round began. */
  private readonly declaredThisRound = new Set<Handle>();
  /** When the talk round began, and when its first AI line reached the human's screen (`performance.now()`). */
  private talkStarted = 0;
  private firstShown: number | undefined;
  /** Engine events fetched for the human's screen and the DM's transcript lines, not written yet. */
  private screen: Event[] = [];
  private dmLines: Event[] = [];
  /** The seq of the last engine line written to the DM's transcript. */
  private dmShownTo = -1;
  /** The DM's narration failed: the lines the next flush shows stand alone (AGT-37). */
  private unnarrated = false;
  /** Whose turn the human's screen is in, from the lines shown so far: the human's own lines show at once (AGT-37). */
  private screenTurn: Handle | undefined;
  /** The flush running now, if any: the next one starts after it. */
  private flushing: Promise<void> = Promise.resolve();
  /** Each seat's state changes in flight, one after another (see `oneAtATime`). */
  private readonly changing = new Map<string, Promise<unknown>>();
  private readonly inputsFile: string | undefined;
  private readonly narrationGuard: TextGuard;
  private readonly speechGuard: TextGuard;

  constructor(options: TableOptions) {
    this.engine = options.engine;
    this.human = options.human;
    this.players = options.players;
    this.seat = options.seat;
    this.transcript = options.transcript;
    this.inputsFile = options.inputsFile;
    this.narrationGuard = options.narrationGuard ?? (() => undefined);
    this.speechGuard = options.speechGuard ?? (() => undefined);
    this.maxRetries = options.maxRetries ?? 2;
    for (const player of this.players) {
      this.inboxes.set(player, []);
      this.notes.set(player, []);
    }
  }

  /** Whether a fight is running: the engine waits on a combat decision. */
  get inCombat(): boolean {
    return this.awaiting.kind === "action" || this.awaiting.kind === "reaction";
  }

  /** The retries `seat` has used in its current decision. */
  retries(seat: string): number {
    return this.retryCounts.get(seat) ?? 0;
  }

  /**
   * Counts one retry against `seat`'s current decision, and writes why to the run channel: the count
   * decides the fallback, the records are what the run report counts (spec §6).
   */
  retry(seat: string, why: string): void {
    this.retryCounts.set(seat, this.retries(seat) + 1);
    this.log("retry", why, seat);
  }

  /** Ends `seat`'s current decision at once (a refusal that isn't retryable, spec §6): the loop falls back. */
  spend(seat: string): void {
    this.retryCounts.set(seat, this.maxRetries + 1);
  }

  /** A new decision for `seat`: its retries start again. */
  resetRetries(seat: string): void {
    this.retryCounts.delete(seat);
  }

  /** Whether `seat`'s retries are spent: its state changes are refused and the loop falls back. */
  exhausted(seat: string): boolean {
    return this.retries(seat) > this.maxRetries;
  }

  /**
   * Runs `change` once every earlier change `seat` started has been answered, so each one sees the
   * retries the ones before it spent: parallel tool calls can't slip past a spent decision.
   */
  oneAtATime<T>(seat: string, change: () => Promise<T>): Promise<T> {
    const run = (this.changing.get(seat) ?? Promise.resolve()).then(change);
    this.changing.set(seat, run.catch(() => undefined));
    return run;
  }

  /** Takes in a response: its `awaiting` is now the truth. */
  observe(response: Response): Response {
    this.awaiting = response.awaiting;
    return response;
  }

  /**
   * Records a model input a seat received, for the leak scan (spec §3.5, crates/nat20-duel/src/leak_scan.rs).
   * The lines in it that carry the human's words go along as `quoted`: the human may say anything,
   * so the scan skips them as it skips what the human typed.
   */
  recordInput(seat: Handle, text: string, human = false): void {
    if (!this.inputsFile) return;
    const quoted = human ? [] : [...new Set(text.split("\n").filter((line) => this.humanLines.has(line)))];
    appendFileSync(this.inputsFile, JSON.stringify({ seat, text, ...(human ? { human: true } : {}), ...(quoted.length > 0 ? { quoted } : {}) }) + "\n");
  }

  /** Shows the human something, and records it as the human seat's input. */
  show(event: TableEvent, typedByHuman = false): void {
    this.recordInput(this.human, JSON.stringify(event), typedByHuman);
    this.seat.show(event);
  }

  /**
   * Shows the human the engine lines it hasn't seen, projected for the human's viewer, and writes
   * them and the DM's view of the same stretch to the transcript (`to:<human>` and `dm`). Runs
   * before any text reaches the human, so a roll always shows before the narration about it.
   * Lines from the first event `holdFrom` matches (in the DM's view) onwards wait for a later flush.
   * One flush runs at a time, so two overlapping ones can't both take the same new lines.
   */
  flush(holdFrom = this.hold): Promise<void> {
    const run = this.flushing.then(() => this.flushNow(holdFrom));
    this.flushing = run.catch(() => undefined);
    return run;
  }

  private async flushNow(holdFrom: ((event: Event) => boolean) | undefined): Promise<void> {
    this.screen.push(...tellable(await this.engine.newEvents(this.human, "screen"), this.deaths));
    this.dmLines.push(...tellable(await this.engine.newEvents("dm", "transcript"), this.deaths));
    let limit = this.flushLimit ?? Number.POSITIVE_INFINITY;
    const held = holdFrom ? this.dmLines.find(holdFrom) : undefined;
    if (held) limit = Math.min(limit, held.seq - 1);
    for (const event of take(this.dmLines, limit)) {
      this.transcript.add({ speaker: "engine", channel: "dm", kind: "engine", text: eventLine(event) });
      this.dmShownTo = event.seq;
    }
    for (const event of take(this.screen, limit)) {
      const line = eventLine(event);
      this.transcript.add({ speaker: "engine", channel: `to:${this.human}`, kind: "engine", text: line });
      this.recent.push(line);
      if (this.recent.length > RECENT_LINES) this.recent.shift();
      if (event.kind === "turn_start") this.screenTurn = event.actor;
      const own = this.screenTurn === this.human;
      if (event.kind === "turn_end" || event.kind === "combat_over") this.screenTurn = undefined;
      this.show({ kind: "engine", text: event.text, seq: event.seq, ...(event.kind === "roll" ? { roll: event.roll.id } : {}), ...(own ? { own: true as const } : {}) });
    }
    if (this.unnarrated) {
      this.unnarrated = false;
      this.seat.unnarrated?.();
    }
  }

  /** Takes the lines queued for an AI player's next wake. */
  drainInbox(player: Handle): string[] {
    const lines = this.inboxes.get(player) ?? [];
    this.inboxes.set(player, []);
    return lines;
  }

  /** Takes the lines queued for the DM's next wake. */
  drainDmInbox(): string[] {
    const lines = this.dmInbox;
    this.dmInbox = [];
    return lines;
  }

  /** Queues a line for the DM only (a declaration, an engine refusal of the DM's own call). */
  tellDm(line: string): void {
    this.dmInbox.push(line);
  }

  /** A line said once that was refused: dropped with no retry, and logged for the report (AGT-34). */
  private dropped(from: Handle, reason: string): ToolOutcome {
    this.log("system", `reaction dropped: ${reason}`, from);
    return { ok: false, retryable: false, text: `Refused, nobody heard it: ${reason}. The moment has passed.` };
  }

  /** A refusal of free text: counts as a retry, or once retries are spent, drops the text. */
  private refuse(speaker: string, what: string, reason: string, fix: string): ToolOutcome {
    this.retry(speaker, `${what} refused: ${reason}`);
    if (this.exhausted(speaker)) return this.spent();
    return { ok: false, retryable: true, text: `Refused, nobody heard it: ${reason}. ${fix}` };
  }

  /** The answer once this decision's retries are spent (spec §6): nothing more is accepted. */
  spent(): ToolOutcome {
    return { ok: false, retryable: false, text: "No retries left for this decision; the table moves on." };
  }

  /**
   * DM text to the table, or to one seat (spec §3.5). The narration guard runs first; a refused
   * line reaches nobody and the DM gets the reason.
   */
  async narrate(text: string, to?: Handle): Promise<ToolOutcome> {
    if (this.exhausted("dm")) return this.spent();
    const refused = this.narrationGuard(text);
    if (refused) return this.refuse("dm", "narration", refused, "Rewrite it.");
    if (to && to !== this.human && !this.players.includes(to)) {
      this.retry("dm", `narration refused: ${to} is not a seat`);
      return { ok: false, retryable: true, text: `${to} is not a seat at the table; address the table or one of ${[this.human, ...this.players].join(", ")}.` };
    }
    await this.flush();
    this.transcript.add({ speaker: "dm", channel: to ? `to:${to}` : "table", kind: "narration", text });
    this.narratedTo = this.dmShownTo;
    if (this.inCombat) this.narrations = [];
    else if (!to) this.narrations.push(text);
    for (const player of this.players) {
      if (!to || to === player) this.inboxes.get(player)?.push(`DM${to ? " (to you)" : ""}: ${text}`);
    }
    if (!to || to === this.human) {
      this.dmToHuman += 1;
      this.show({ kind: "narration", speaker: "dm", text, ...(to ? { to } : {}) });
    }
    return { ok: true, text: "said" };
  }

  /** A DM question to the human, guarded like narration. The human's next input answers it. */
  async askHuman(text: string): Promise<ToolOutcome> {
    if (this.exhausted("dm")) return this.spent();
    const refused = this.narrationGuard(text);
    if (refused) return this.refuse("dm", "question", refused, "Rewrite it.");
    await this.flush();
    this.transcript.add({ speaker: "dm", channel: `to:${this.human}`, kind: "question", text });
    this.question = text;
    this.dmToHuman += 1;
    this.show({ kind: "question", text });
    return { ok: true, text: "asked; the answer comes with the human's next action" };
  }

  /**
   * A character's spoken line, heard by every other seat. AI players' lines go through the speech
   * guard (spec §3.5); the human's go as typed and are marked as the human's. `to` is the companion
   * an AI player speaks to (party talk §4.4): the addressee's brief says "<speaker> says to you",
   * and out of combat the loop may hand it the floor. A line said `once` (a reaction between turns
   * in a fight, AGT-34) is dropped when it is refused, with no retry: its moment has passed.
   */
  async speak(from: Handle, text: string, to?: Handle, once = false): Promise<ToolOutcome> {
    if (to !== undefined && (to === from || (to !== this.human && !this.players.includes(to)))) {
      if (once) return this.dropped(from, `${to} is not a companion at the table`);
      if (this.exhausted(from)) return this.spent();
      const companions = [this.human, ...this.players].filter((seat) => seat !== from);
      return this.refuse(from, "speech", `${to} is not a companion at the table`, `Give one of ${companions.join(", ")} as to, or leave it out.`);
    }
    return this.say(from, text, "speech", to, once);
  }

  /**
   * What a character sets out to do out of combat (spec §3.3 explore step 2-3): the human's typed
   * line, or an AI player's declaration. Heard like speech, so guarded like speech.
   */
  async declare(from: Handle, text: string): Promise<ToolOutcome> {
    return this.say(from, text, "intent");
  }

  private async say(from: Handle, text: string, kind: "speech" | "intent", to?: Handle, once = false): Promise<ToolOutcome> {
    const human = from === this.human;
    if (!human) {
      if (!once && this.exhausted(from)) return this.spent();
      const refused = this.speechGuard(text);
      if (refused && once) return this.dropped(from, refused);
      if (refused) return this.refuse(from, kind === "speech" ? "speech" : "declaration", refused, "Say it without that.");
    }
    const deliver = async () => {
      await this.flush();
      this.transcript.add({ speaker: from, channel: "table", kind, text, human, ...(to ? { to } : {}) });
      const line = kind === "speech" ? `${from} says${to ? ` to ${to}` : ""}: ${text}` : `${from}: ${text}`;
      if (human) for (const part of line.split("\n")) this.humanLines.add(part);
      for (const player of this.players) {
        if (player !== from) this.inboxes.get(player)?.push(player === to ? `${from} says to you: ${text}` : line);
      }
      this.dmInbox.push(line);
      if (human) return;
      if (kind === "speech") {
        if (this.inCombat) this.fightLines += 1;
        this.spokeThisRound.add(from);
        if (to && !this.inCombat) this.addresses.push({ from, to });
      } else {
        this.declaredThisRound.add(from);
        if (this.spokeThisRound.has(from)) return;
      }
      this.firstShown ??= performance.now();
      this.show(kind === "speech" && to ? { kind, speaker: from, text, to } : { kind, speaker: from, text });
    };
    const queue = this.collecting?.get(from);
    if (queue) {
      queue.push(deliver);
      return { ok: true, text: "said; the table hears it in turn" };
    }
    await deliver();
    return { ok: true, text: "said" };
  }

  /** From now until `commit`, what the AI players say waits and is delivered in seat order. */
  collect(): void {
    this.collecting = new Map(this.players.map((player) => [player, []]));
  }

  /** Takes the DM's narrations to the table since the last talk round, oldest first. */
  takeNarrations(): string[] {
    const narrations = this.narrations;
    this.narrations = [];
    return narrations;
  }

  /** Takes the lines AI players spoke to a companion out of combat since the last take, oldest first. */
  takeAddresses(): Address[] {
    const addresses = this.addresses;
    this.addresses = [];
    return addresses;
  }

  /** A talk round out of combat begins (party talk §4.2): who spoke and declared is counted afresh. */
  beginTalk(): void {
    this.spokeThisRound.clear();
    this.declaredThisRound.clear();
    this.talkStarted = performance.now();
    this.firstShown = undefined;
  }

  /** The talk round so far: which AI players spoke or declared, and how long its first line took to show. */
  talkSoFar(): { spoke: Handle[]; declared: Handle[]; firstLineMs: number | undefined } {
    return {
      spoke: this.players.filter((p) => this.spokeThisRound.has(p)),
      declared: this.players.filter((p) => this.declaredThisRound.has(p)),
      firstLineMs: this.firstShown === undefined ? undefined : Math.round(this.firstShown - this.talkStarted),
    };
  }

  /** Delivers what the AI players said while collecting, player by player in seat order. */
  async commit(): Promise<void> {
    const queued = this.collecting;
    this.collecting = undefined;
    for (const player of this.players) {
      for (const deliver of queued?.get(player) ?? []) await deliver();
    }
  }

  /** An AI player's private note (spec §3.6): its own channel, nobody else reads it. */
  note(player: Handle, kind: NoteKind, text: string): ToolOutcome {
    if (!NOTE_KINDS.includes(kind)) return { ok: false, retryable: true, text: `kind must be one of ${NOTE_KINDS.join(", ")}` };
    this.notes.get(player)?.push({ kind, text });
    const write = () => this.transcript.add({ speaker: player, channel: `notes:${player}`, kind: "note", text: `${kind}: ${text}` });
    const queue = this.collecting?.get(player);
    if (queue) queue.push(async () => void write());
    else write();
    return { ok: true, text: "noted" };
  }

  /** A fact the DM established in fiction (spec §3.6). Fiction only: the narration guard runs. */
  remember(fact: string): ToolOutcome {
    const refused = this.narrationGuard(fact);
    if (refused) {
      this.retry("dm", `memory refused: ${refused}`);
      return { ok: false, retryable: true, text: `Not remembered: ${refused}. Memory holds fiction only.` };
    }
    this.dmMemory.push(fact);
    this.transcript.add({ speaker: "dm", channel: "memory:dm", kind: "memory", text: fact });
    return { ok: true, text: "remembered" };
  }

  /** Ends the run: the adventure's last exit, a stop, or the human's `/quit`. */
  end(reason: string): void {
    this.ended ??= reason;
  }

  /**
   * A raised hand on the run channel (party talk §4.3): its word, then what the player wrote after
   * it. That text is the model's own and nobody hears it, but the audit reads every line, so it goes
   * through the speech guard first: a number or a game term in it is left out, and the reason kept.
   */
  logHand(handle: Handle, word: string, said: string): void {
    const refused = said ? this.speechGuard(said) : undefined;
    this.log("hand", refused ? `${word} (left out: ${refused})` : said ? `${word}: ${said}` : word, handle);
  }

  /** The orchestrator's own bookkeeping line: a retry, a fallback, an error, a raised hand. */
  log(kind: "retry" | "fallback" | "error" | "system" | "intent" | "hand", text: string, speaker = "table"): void {
    this.transcript.add({ speaker, channel: "run", kind, text });
    if (kind === "fallback" && speaker === "dm") this.unnarrated = true;
  }
}

/** Removes and returns the events up to `limit`, keeping the rest in order. */
function take(events: Event[], limit: number): Event[] {
  const cut = events.findIndex((e) => e.seq > limit);
  return events.splice(0, cut < 0 ? events.length : cut);
}
