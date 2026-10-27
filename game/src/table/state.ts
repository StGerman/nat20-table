// What the orchestrator knows about the table between engine calls, and the only way text moves
// between seats (M6 spec §3.1, §3.5, §3.6). Agents never reach this object directly: they get the
// bound tools in tools.ts, which call it.
import { appendFileSync } from "node:fs";
import type { Awaiting, Handle, Response } from "@nat20-table/engine-client";
import type { GameEngine } from "../engine.ts";
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
}

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
  /** Each AI player's private notes, in order (spec §3.6). Only that player reads them. */
  readonly notes = new Map<Handle, Array<{ kind: NoteKind; text: string }>>();
  /** What the DM established in fiction (spec §3.6). Only the DM reads it. */
  readonly dmMemory: string[] = [];
  /** Rejections and guard refusals in the decision being made now (spec §6). */
  retries = 0;
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
    for (const player of this.players) {
      this.inboxes.set(player, []);
      this.notes.set(player, []);
    }
  }

  /** Whether a fight is running: the engine waits on a combat decision. */
  get inCombat(): boolean {
    return this.awaiting.kind === "action" || this.awaiting.kind === "reaction";
  }

  /** Takes in a response: its `awaiting` is now the truth. */
  observe(response: Response): Response {
    this.awaiting = response.awaiting;
    return response;
  }

  /** Records a model input a seat received, for the leak scan (spec §3.5). */
  recordInput(seat: Handle, text: string, human = false): void {
    if (this.inputsFile) appendFileSync(this.inputsFile, JSON.stringify({ seat, text, ...(human ? { human: true } : {}) }) + "\n");
  }

  /** Shows the human something, and records it as the human seat's input. */
  show(event: TableEvent, typedByHuman = false): void {
    this.recordInput(this.human, JSON.stringify(event), typedByHuman);
    this.seat.show(event);
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

  /**
   * DM text to the table, or to one seat (spec §3.5). The narration guard runs first; a refused
   * line reaches nobody and the DM gets the reason.
   */
  narrate(text: string, to?: Handle): ToolOutcome {
    const refused = this.narrationGuard(text);
    if (refused) {
      this.retries += 1;
      this.transcript.add({ speaker: "dm", channel: "run", kind: "retry", text: `narration refused: ${refused}` });
      return { ok: false, retryable: true, text: `Refused, nobody heard it: ${refused}. Rewrite it.` };
    }
    if (to && to !== this.human && !this.players.includes(to)) {
      return { ok: false, retryable: true, text: `${to} is not a seat at the table; address the table or one of ${[this.human, ...this.players].join(", ")}.` };
    }
    this.transcript.add({ speaker: "dm", channel: to ? `to:${to}` : "table", kind: "narration", text });
    for (const player of this.players) {
      if (!to || to === player) this.inboxes.get(player)?.push(`DM${to ? " (to you)" : ""}: ${text}`);
    }
    if (!to || to === this.human) this.show({ kind: "narration", speaker: "dm", text, ...(to ? { to } : {}) });
    return { ok: true, text: "said" };
  }

  /** A DM question to the human, guarded like narration. */
  askHuman(text: string): ToolOutcome {
    const refused = this.narrationGuard(text);
    if (refused) {
      this.retries += 1;
      this.transcript.add({ speaker: "dm", channel: "run", kind: "retry", text: `question refused: ${refused}` });
      return { ok: false, retryable: true, text: `Refused, nobody heard it: ${refused}. Rewrite it.` };
    }
    this.transcript.add({ speaker: "dm", channel: `to:${this.human}`, kind: "question", text });
    this.show({ kind: "question", text });
    return { ok: true, text: "asked; the answer comes with the human's next action" };
  }

  /**
   * A character's spoken line, heard by every other seat. AI players' lines go through the speech
   * guard (spec §3.5); the human's go as typed and are marked as the human's.
   */
  speak(from: Handle, text: string): ToolOutcome {
    const human = from === this.human;
    if (!human) {
      const refused = this.speechGuard(text);
      if (refused) {
        this.retries += 1;
        this.transcript.add({ speaker: from, channel: "run", kind: "retry", text: `speech refused: ${refused}` });
        return { ok: false, retryable: true, text: `Refused, nobody heard it: ${refused}. Say it without that.` };
      }
    }
    this.transcript.add({ speaker: from, channel: "table", kind: "speech", text, human });
    for (const player of this.players) if (player !== from) this.inboxes.get(player)?.push(`${from} says: ${text}`);
    this.dmInbox.push(`${from} says: ${text}`);
    if (!human) this.show({ kind: "speech", speaker: from, text });
    return { ok: true, text: "said" };
  }

  /** An AI player's private note (spec §3.6): its own channel, nobody else reads it. */
  note(player: Handle, kind: NoteKind, text: string): ToolOutcome {
    if (!NOTE_KINDS.includes(kind)) return { ok: false, retryable: true, text: `kind must be one of ${NOTE_KINDS.join(", ")}` };
    this.notes.get(player)?.push({ kind, text });
    this.transcript.add({ speaker: player, channel: `notes:${player}`, kind: "note", text: `${kind}: ${text}` });
    return { ok: true, text: "noted" };
  }

  /** A fact the DM established in fiction (spec §3.6). Fiction only: the narration guard runs. */
  remember(fact: string): ToolOutcome {
    const refused = this.narrationGuard(fact);
    if (refused) {
      this.retries += 1;
      return { ok: false, retryable: true, text: `Not remembered: ${refused}. Memory holds fiction only.` };
    }
    this.dmMemory.push(fact);
    this.transcript.add({ speaker: "dm", channel: "memory:dm", kind: "memory", text: fact });
    return { ok: true, text: "remembered" };
  }

  /** The orchestrator's own bookkeeping line: a retry, a fallback, an error. */
  log(kind: "retry" | "fallback" | "error" | "system" | "intent", text: string, speaker = "table"): void {
    this.transcript.add({ speaker, channel: "run", kind, text });
  }
}
