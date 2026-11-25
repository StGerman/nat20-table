// The table's own types: the UI boundary (M6 spec §3.4, decision 0016), the seat and agent
// interfaces, and transcript records. None of these cross the engine boundary, so they are game
// types, not wire (Rule 1). TableEvent and PlayerIntent map one-to-one onto AG-UI's text, state
// and tool-call events, so a later web client can replace the terminal UI behind this boundary.
import type { Event, Handle, TurnBudget } from "@nat20-table/engine-client";
import type { Choice } from "./choices.ts";
import type { SeatCard, SeatPlace, SeatPositions, SeatRoad, SeatSheet, SeatUnavailable, SeatUse } from "./seat-data.ts";
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

/**
 * One thing the human's screen shows. Everything in it was made for the human's viewer. Beside the
 * text a terminal draws, an event may carry data a window draws it from (AGT-140, Glass Table design
 * §4.3), each field copied from a view the projection made for the human; the terminal seat reads
 * only the text.
 */
export type TableEvent =
  /** A line of DM narration (guarded, spec §3.5) or a character's spoken line. `rolls`: the roll ids it tells (AGT-140). */
  | { kind: "narration"; speaker: string; text: string; to?: Handle; rolls?: string[] }
  /** `to`: the character it is spoken to, the human's own included (party talk §4.4). */
  | { kind: "speech"; speaker: Handle; text: string; to?: Handle }
  /** What a character sets out to do out of combat, as its player declared it. */
  | { kind: "intent"; speaker: Handle; text: string }
  /**
   * An engine event's own text, rendered for the human's viewer, with its roll id if any. `own`: it
   * happened on the human's own turn, so the seat shows it at once instead of holding it for the
   * DM's narration (AGT-37).
   */
  | {
      kind: "engine";
      text: string;
      roll?: string;
      seq: number;
      own?: true;
      /** The engine event itself, projected for the human's viewer (a roll in its player view: no `against`), and the seat's name for each creature it names (AGT-140). */
      event?: Event;
      names?: Record<string, string>;
    }
  /**
   * Numbered decisions the human can pick by number (`/options`), or a follow-up pick inside one
   * (`title` names it). `choices` carries the same list as data for a seat that picks by rule.
   * `budget` is what is left of the human's combat turn, from the same `legal_actions`.
   */
  | {
      kind: "options";
      title?: string;
      lines: string[];
      choices: Choice[];
      budget?: TurnBudget;
      /** The number Enter on an empty line takes (a road card: the first choice when the human speaks first, else the others' choice; AGT-80, AGT-87). */
      preset?: number;
      /** The engine's options that are not open now, with why (AGT-140). */
      unavailable?: SeatUnavailable[];
      /** What is left of the human's limited uses and spell slots, from their own sheet (AGT-140). */
      uses?: SeatUse[];
      /** A road card's list: the card as the human's world view has it (AGT-140). */
      card?: SeatCard;
    }
  /** A reaction the human may take: yes or no. */
  | { kind: "reaction"; summary: string; options: string[] }
  /** A question the DM asks the human (guarded). */
  | { kind: "question"; text: string }
  /** The answer to a slash command (`/sheet`, `/where`, `/log`), already formatted. */
  | {
      kind: "info";
      title: string;
      text: string;
      /** `/sheet`: the human's own sheet as data (AGT-140). */
      sheet?: SeatSheet;
      /** A road card's words: the card as the human's world view has it (AGT-140). */
      card?: SeatCard;
    }
  /**
   * What the human's character perceives now, for the situation panel (an AG-UI state snapshot):
   * made from the human's own `get_state`, so it holds nothing the human can't see. Absent when the
   * refresh failed; the panel keeps its last frame, marked stale.
   */
  | {
      kind: "situation";
      situation?: Situation;
      /** Where everyone stands and the scene's anchors, in feet, for a yard lens (AGT-140). */
      positions?: SeatPositions;
      /** The road as data: the trip's legs, the roads and places discovered, the contract's terms (AGT-140). */
      road?: SeatRoad;
      /** The human's death saves while they are down, from their own sheet (AGT-140). */
      death_saves?: { successes: number; failures: number };
      /** The place of the scene, for a window's picture of it (CON-26); none where the pack names none. */
      place?: SeatPlace;
    }
  /** Whose turn it is, the round, the scene. */
  | { kind: "status"; text: string }
  /** The run ended or stopped (scene exit, engine stop, plan limit). */
  | { kind: "end"; text: string }
  /**
   * What the human sent, as the seat echoes it (AGT-140): a window rebuilt from the events keeps
   * the player's own words. The terminal seat echoes locally and draws nothing for it.
   */
  | { kind: "said"; intent: PlayerIntent; text: string };

/** What the human sends. */
export type PlayerIntent =
  /**
   * Words for the DM. `suggestion`: the line came from the suggestions picker (AGT-49), its row
   * `n` (from 1), sent as offered or `edited` first; recorded in `inputs.jsonl` and counted in the report.
   */
  | { kind: "text"; text: string; suggestion?: { n: number; edited: boolean } }
  | { kind: "option"; number: number }
  /** Esc on an empty line inside a follow-up pick: back to the turn's own options (AGT-48 Q5). */
  | { kind: "back" }
  | { kind: "reaction"; take: boolean }
  | { kind: "command"; name: "sheet" | "where" | "map" | "options" | "log" | "usage" | "pause" | "suggest" | "quit" };

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
  | { kind: "paused" }
  /** The DM offered a surrender: accept it (1), fight on (2), or say what you do (AGT-30). */
  | { kind: "surrender" }
  /** A road card waits for the human's word, asked first as a Blade (AGT-87) and last as the owner: a number, or Enter for the marked choice. */
  | { kind: "card"; /** The prompt line in the run's language; it names Enter only when a choice is marked (AGT-101). */ line?: string }
  /** A choice for the human's new level (AGT-80): a number, or Enter for the recommended pick. */
  | { kind: "level_up" }
  /** The DM says the party moves on or settles for the night, and the human drives the caravan (AGT-80): Enter on the first line, or not yet. */
  | { kind: "road" };

/** What the DM may propose on the road (AGT-80, `propose_road`): the caravan moves on, or the day ends in camp or at the inn. */
export type RoadStep = "move_on" | "camp" | "inn";

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
   * The DM's narration as it is being written (M10 S4): complete sentences so far, `undefined` to
   * clear. Replaced by the finished narration event; never recorded, and only the human's seat has it.
   */
  preview?(text: string | undefined): void;
  /**
   * The DM's narration of the engine lines the seat was shown failed (a fallback): a seat that
   * holds lines for their narration shows them now, as they are (AGT-37). Not recorded.
   */
  unnarrated?(): void;
  /**
   * The loop is answering a command the human typed (AGT-103), or is done with it: the info,
   * options and status lines the seat draws meanwhile are that command's answer.
   */
  answering?(on: boolean): void;
  /**
   * Response suggestions for the prompt that is open (AGT-49): a call started (`cancel` drops it,
   * as the human's first key does), its three rows, or none (timed out, failed, or the prompt
   * closed). Not a TableEvent and not recorded: only a sent line says it came from one.
   */
  suggest?(update: SuggestUpdate): void;
  /**
   * Commands the human gave with no ask open (AGT-141: a window's pause control), taken once. The
   * loop reads them before each AI wake; the terminal seat takes commands only at a prompt.
   */
  takeCommands?(): Array<"pause">;
}

/** What the loop tells the seat about suggestions for the open prompt (AGT-49). */
export type SuggestUpdate = { kind: "waiting"; cancel: () => void } | { kind: "rows"; rows: string[] } | { kind: "none" };

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
  /**
   * In a fight, not on its turn: something just happened, and it may react in one line with `say`,
   * or pass (party talk §5 R1, AGT-34). The fight doesn't wait for it, and only the first AI
   * player's line is heard.
   */
  | "bark"
  /** A scene is ending: summarise it in a few sentences of fiction (AGT-6). */
  | "summary"
  /** A road card waits for its word (AGT-80): advice to the merchant or a vote, with choose_card. */
  | "card"
  /** The DM says the party moves on or settles for the night, and it drives the caravan (AGT-80): travel or rest_night, or not yet. */
  | "road";

/**
 * An AI player (spec §3.2). It acts only through its tools, which are bound to its own handle.
 * `briefing` is built from what its viewer may see: projected events, narration addressed to the
 * table or to it, spoken lines.
 */
export interface PlayerAgent {
  readonly handle: Handle;
  /** Whether it takes `bark` wakes in a fight (AGT-34): a model player does; a scripted one only with a `bark` policy. */
  readonly reacts?: boolean;
  /**
   * The actions whose summary its current session has read (AGT-70), for every option listing it
   * gets, its own `legal_actions` and the loop's briefings alike; emptied when the session closes.
   * A scripted player has none, and its listings carry no summaries.
   */
  readonly described?: Set<string>;
  wake(wake: PlayerWake, briefing: string, tools: PlayerTools): Promise<string | void>;
  /** Ends the wake in flight, if any: its answer is no longer wanted (a `bark` whose moment passed). */
  cancel?(): void;
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
  /** The human answered a surrender offer in words: accept it for them, or answer in fiction (AGT-30). */
  | "surrender_words"
  /** A fight ended. */
  | "combat_over"
  /** The road moved on (AGT-80): a card settled, a night passed, the escort was paid. */
  | "road"
  /** A draw offered two or three road cards (AGT-88): pick one with pick_card, then open it (AGT-100). */
  | "pick"
  /** A road card came with no pick (a soon card, a zone's only card, an arrival card): open it (AGT-100). */
  | "card"
  /** A player's own words on the road card waiting (API-56, AGT-99): an own move, or only an answer. */
  | "card_words"
  /** The journey is over (AGT-91): suggest up to two road cards, as JSON in the final answer. */
  | "suggest"
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
  kind: "narration" | "speech" | "question" | "engine" | "intent" | "note" | "memory" | "retry" | "fallback" | "error" | "system" | "hand" | "described";
  text: string;
  /** For `described` (AGT-127): whose card line the describer reworded, and the authored line `text` replaced. */
  person?: string;
  authored?: string;
  /** Roll ids the text cites, `rN`. */
  rolls: string[];
  /** The engine log's length when the line was written. */
  log_head: number;
  /** For a human line: it is the human's own, so the leak scan skips it (spec §3.5). */
  human?: boolean;
  /** For speech: the character it is spoken to (party talk §4.4). */
  to?: Handle;
  /** For a fallback: why the decision fell back (M7 design §3.3; acceptance 5 fails only on `retries`). */
  cause?: FallbackCause;
  /**
   * For the human's refusals (a `retry`, or the DM's `unmapped` fallback): the decision they belong
   * to, the engine's prompt id in a fight and `explore:<round>` out of one, so acceptance 5 counts
   * refusals per decision (M7 design §3.3).
   */
  decision?: string;
  /** For a DM narration, error or fallback: the wake it came from (AGT-100). */
  wake?: DmWake;
  /** For a DM wake's error or fallback: whether a narration was shown in that wake (AGT-97). */
  narrated?: boolean;
}

/**
 * Why a decision fell back (M7 design §3.3): its retries were spent on refusals (`retries`), its wake
 * timed out or failed (`timeout`, `error`), the DM couldn't map the human's words (`unmapped`), or the
 * wake ended with nothing refused and nothing done (`unanswered`), or its wake ran out of time
 * after its narration was shown (`cut_after_narration`, AGT-97: not a skipped wake).
 */
export type FallbackCause = "retries" | "timeout" | "error" | "unmapped" | "unanswered" | "cut_after_narration";

/**
 * Which stop ended a run early (M7 design §3.1): the time limit, a stall, the plan's usage limit, an
 * expired login, the network, the operator's Ctrl+C or `/quit`, or a crash of the engine or the loop.
 */
export type StopKind = "time_limit" | "stalled" | "usage_limit" | "login" | "offline" | "operator" | "crash";
