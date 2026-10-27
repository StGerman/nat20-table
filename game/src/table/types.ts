// The table's own types: the UI boundary (M6 spec §3.4, decision 0016), the seat and agent
// interfaces, and transcript records. None of these cross the engine boundary, so they are game
// types, not wire (Rule 1). TableEvent and PlayerIntent map one-to-one onto AG-UI's text, state
// and tool-call events, so a later web client can replace the terminal UI behind this boundary.
import type { Handle, TurnBudget } from "@nat20-table/engine-client";
import type { Choice } from "./choices.ts";
import type { Situation } from "./situation.ts";
import type { DmTools, PlayerTools } from "./tools.ts";

/** What a tool call gave back. `text` is what the model reads; `data` is for scripted agents. */
export interface ToolOutcome {
  ok: boolean;
  text: string;
  /** For a refusal: whether trying again (differently) can work. */
  retryable?: boolean;
  data?: unknown;
}

// --- The UI boundary --------------------------------------------------------------------------

/** One thing the human's screen shows. Everything in it was made for the human's viewer. */
export type TableEvent =
  /** A line of DM narration (guarded, spec §3.5) or a character's spoken line. */
  | { kind: "narration"; speaker: string; text: string; to?: Handle }
  /** `to`: the character it is spoken to, the human's own included (party talk §4.4). */
  | { kind: "speech"; speaker: Handle; text: string; to?: Handle }
  /** What a character sets out to do out of combat, as its player declared it. */
  | { kind: "intent"; speaker: Handle; text: string }
  /**
   * An engine event's own text, rendered for the human's viewer, with its roll id if any. `own`: it
   * happened on the human's own turn, so the seat shows it at once instead of holding it for the
   * DM's narration (AGT-37).
   */
  | { kind: "engine"; text: string; roll?: string; seq: number; own?: true }
  /**
   * Numbered decisions the human can pick by number (`/options`), or a follow-up pick inside one
   * (`title` names it). `choices` carries the same list as data for a seat that picks by rule.
   * `budget` is what is left of the human's combat turn, from the same `legal_actions`.
   */
  | { kind: "options"; title?: string; lines: string[]; choices: Choice[]; budget?: TurnBudget }
  /** A reaction the human may take: yes or no. */
  | { kind: "reaction"; summary: string; options: string[] }
  /** A question the DM asks the human (guarded). */
  | { kind: "question"; text: string }
  /** The answer to a slash command (`/sheet`, `/where`, `/log`), already formatted. */
  | { kind: "info"; title: string; text: string }
  /**
   * What the human's character perceives now, for the situation panel (an AG-UI state snapshot):
   * made from the human's own `get_state`, so it holds nothing the human can't see. Absent when the
   * refresh failed; the panel keeps its last frame, marked stale.
   */
  | { kind: "situation"; situation?: Situation }
  /** Whose turn it is, the round, the scene. */
  | { kind: "status"; text: string }
  /** The run ended or stopped (scene exit, engine stop, plan limit). */
  | { kind: "end"; text: string };

/** What the human sends. */
export type PlayerIntent =
  | { kind: "text"; text: string }
  | { kind: "option"; number: number }
  | { kind: "reaction"; take: boolean }
  | { kind: "command"; name: "sheet" | "where" | "options" | "log" | "pause" | "quit" };

/** Why the loop needs the human. */
export type HumanPrompt =
  /** A combat turn: the options are on screen; a number, free text or a command. */
  | { kind: "combat_turn" }
  /** A reaction: yes or no (or a command). */
  | { kind: "reaction" }
  /** Out of combat: what Bren does or says. */
  | { kind: "explore" }
  /** A question from the DM. */
  | { kind: "answer" }
  /** A follow-up pick inside a numbered option: its targets, variants or aims. */
  | { kind: "pick" }
  /** `/pause` is on and an AI player is next: only commands until `/pause` again. */
  | { kind: "paused" };

/**
 * The human's seat (spec §3.4). The Ink UI implements it (step 11); scripted seats implement it
 * for tests and Milestone 7's unattended runs (AGT-14).
 */
export interface Seat {
  readonly handle: Handle;
  show(event: TableEvent): void;
  ask(prompt: HumanPrompt): Promise<PlayerIntent>;
  /**
   * What the table waits on while it isn't asking the human ("The DM is thinking", "ilsa is thinking"), for
   * the seat's loading indicator; `undefined` once nothing named is in flight. Not a TableEvent and
   * not recorded: it names a seat, never what the seat is deciding.
   */
  busy?(on: string | undefined): void;
  /**
   * The DM's narration of the engine lines the seat was shown failed (a fallback): a seat that
   * holds lines for their narration shows them now, as they are (AGT-37). Not recorded.
   */
  unnarrated?(): void;
}

// --- Agents -----------------------------------------------------------------------------------

/** Why a player agent is woken. */
export type PlayerWake =
  | "combat_turn"
  | "reaction"
  /**
   * Out of combat, after the human acted, before anyone has the floor: whether it raises its hand
   * to speak, to act without a word, or both, or passes (party talk §4.3). It answers in text only;
   * its tools refuse to speak or act.
   */
  | "hand"
  /**
   * Out of combat, with the floor: it was named, or raised its hand. At most one declaration
   * (`say` and/or intent) or pass.
   */
  | "declare"
  /** The DM granted it one of its own options out of combat (spec §3.3 step 4). */
  | "granted"
  /** A scene is ending: summarise it in a few sentences of fiction (AGT-6). */
  | "summary";

/**
 * An AI player (spec §3.2). It acts only through its tools, which are bound to its own handle.
 * `briefing` is built from what its viewer may see: projected events, narration addressed to the
 * table or to it, spoken lines.
 */
export interface PlayerAgent {
  readonly handle: Handle;
  wake(wake: PlayerWake, briefing: string, tools: PlayerTools): Promise<string | void>;
  /** A scene changed: drop the session and start again from the summary (AGT-6). */
  newScene?(summary: string): Promise<void>;
  close?(): Promise<void>;
}

/** Why the DM is woken. */
export type DmWake =
  /** A scene was loaded: open it. */
  | "scene_open"
  /** The human acted out of combat, with the AI players' declarations after it. */
  | "table_turn"
  /** The human typed free text on Bren's combat turn: map it to Bren's decisions (D5). */
  | "map_combat"
  /** New engine events to narrate. */
  | "narrate"
  /** A fight ended. */
  | "combat_over"
  | "summary";

export interface DmAgent {
  wake(wake: DmWake, briefing: string, tools: DmTools): Promise<string | void>;
  newScene?(summary: string): Promise<void>;
  close?(): Promise<void>;
}

// --- Transcript -------------------------------------------------------------------------------

/**
 * Who hears a record. `table`: everyone at the table. `dm`: the DM only. `to:<handle>`: one seat
 * (narration addressed to it, a tool result). `notes:<handle>` / `memory:dm`: an agent's own
 * memory (spec §3.6). `run`: the orchestrator's bookkeeping (retries, fallbacks, errors).
 */
export type Channel = "table" | "dm" | "run" | "memory:dm" | `to:${string}` | `notes:${string}`;

/** One line of the run's transcript. `nat20-audit` reads it (crates/nat20-duel/src/game_audit.rs). */
export interface TranscriptRecord {
  at: string;
  /** `dm`, a character handle, `engine` or `table` (the orchestrator). */
  speaker: string;
  channel: Channel;
  kind: "narration" | "speech" | "question" | "engine" | "intent" | "note" | "memory" | "retry" | "fallback" | "error" | "system" | "hand";
  text: string;
  /** Roll ids the text cites, `rN`. */
  rolls: string[];
  /** The engine log's length when the line was written. */
  log_head: number;
  /** For a human line: it is the human's own, so the leak scan skips it (spec §3.5). */
  human?: boolean;
  /** For speech: the character it is spoken to (party talk §4.4). */
  to?: Handle;
}
