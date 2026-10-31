// The human's seat in the terminal (M6 spec §3.4, step 11, TASKS.md AGT-7): an Ink app on the
// `Seat` interface, drawn as one full-screen frame (AGT-69, decision 0054; the zones are in
// frame.ts). What the loop shows goes into the story as messages, one speaker label each (AGT-37);
// other characters' engine lines wait for the DM's narration of them and are left out of the
// story, or folded under it with `verbose`; the human's own, and any before a decision, show at
// once. The story keeps every line and scrolls with PgUp/PgDn; the terminal's own scrollback
// isn't used, and the run folder's transcript is the record. Under the story, while the table
// waits on the human, the action zone holds the turn block (the budget and the numbered options,
// AGT-36), then the input row: a line editor (editor.ts, AGT-48) whose placeholder is the
// prompt's hint, or while no prompt is open a braille spinner with who is thinking; mistakes show
// on the row, not in the story. The situation panel stands right of the story from 124 columns,
// and folds to two rows above the action zone below that. The loop answers the slash commands
// (`/sheet`, `/where`, `/options`, `/log`, `/usage`, `/pause`, `/quit`); `/help` and `/panel` are
// answered here. The answers to /sheet, /where, /log, /usage and /help stand over the story as
// overlays, and a reaction, the DM's question, a refusal and the pause stand in the action zone
// until they are settled (AGT-69 step 2). Written with `createElement`, not JSX, so the game still runs as plain `.ts`
// with no build step.
import type { Handle } from "@nat20-table/engine-client";
import { Box, render, Text, useInput, useWindowSize, type Instance, type RenderOptions } from "ink";
import { createElement as h, useEffect, useState, useSyncExternalStore } from "react";
import type { Situation } from "../table/situation.ts";
import type { HumanPrompt, PlayerIntent, Seat, TableEvent } from "../table/types.ts";
import { edit, editFor, EMPTY, type Edit } from "./editor.ts";
import { COMMAND_HELP, promptHint, readLine } from "./input.ts";
import { actionRows, frameLayout, freshText, headerText, MIN_STORY_ROWS, NARROW_PANEL_ROWS, page, previewRows, rowsFor, RULE_COLUMNS, storyRows, storyWindow, type Scroll } from "./frame.ts";
import { eventLines, speakerOf, textProps, TONE_STYLE, wrapText, type Line } from "./lines.ts";
import { paletteFor, type Palette, type Style } from "./palette.ts";
import { cardRows, endsTurn, foldedRows, situationRows, turnRows, type PanelSize, type Row } from "./panel.ts";
import { costText, guideFor } from "../table/guide.ts";

/** The numbered options held above the prompt while they are the human's to pick from. */
export type PinnedOptions = Extract<TableEvent, { kind: "options" }>;

/** What the screen draws: every line so far, the panel, what the table waits for, and the line being typed. */
export interface SeatView {
  lines: Array<Line & { id: number }>;
  prompt: HumanPrompt | undefined;
  /** The line being typed. */
  draft: string;
  /** Where the cursor stands in `draft` (M10 P6). */
  cursor: number;
  /**
   * A mistake, or what happened to a line typed while the table was busy: shown on the input row
   * until the next key, never in the story (AGT-48).
   */
  notice?: { text: string; error: boolean };
  /** The last situation the loop sent; `stale` once a refresh failed. */
  situation?: Situation;
  stale?: boolean;
  /**
   * `/panel`: on a wide frame it folds the side panel to its bar; on a narrow one it opens the
   * whole panel as an overlay over the story (AGT-69), which Esc closes.
   */
  folded?: boolean;
  /**
   * A command's answer (/sheet, /where, /log, /usage, /help) laid over the story instead of
   * printed into it (AGT-69); `at` is how many story lines there were when it opened, so lines
   * that arrive under it are counted. Esc closes it.
   */
  overlay?: { title: string; text: string; at: number };
  /** A reaction the engine offers, in the action zone until it is answered (screen 7). */
  reaction?: Extract<TableEvent, { kind: "reaction" }>;
  /** The DM's question, kept above the input until it is answered (screen 8). */
  question?: string;
  /** Why the engine refused the last decision, above the options until the next one (AGT-69). */
  refusal?: string;
  /** The option ↑/↓ have lit (AGT-48 Q1): Enter on an empty line plays it. */
  highlight?: number;
  /**
   * The run is over (screens 12 and 13): how it ended, and for a stop what to do about it, with the
   * post-run checks as they go. The table stays on screen until they finish or a key is pressed.
   */
  finale?: Finale;
  options?: PinnedOptions;
  /** Who the table waits on while it isn't asking the human, and since when (ms). */
  busy?: { on: string; since: number };
  /** The DM's narration as it is written (M10 S4), dim at the foot of the story until the finished line comes. */
  preview?: string;
  /** The scene being played, by its number in the adventure, for the header (no scene names, C9). */
  scene?: { number: number; of: number };
  /** When the first scene started (ms), for the header's minutes. */
  started?: number;
}

export interface InkSeatOptions {
  /**
   * Called on the first Ctrl+C: the run command ends the table there, so a run stops between
   * decisions and still writes its report. A second Ctrl+C exits at once.
   */
  onQuit?: () => void;
  /** Colours; default from the terminal's environment (palette.ts). */
  palette?: Palette;
  /**
   * Spin the loading indicator. Default: on a terminal without NO_COLOR; otherwise the wait is one
   * still line, so a screen reader or a log isn't fed a frame every 80 ms.
   */
  animate?: boolean;
  /** The clock for the wait's elapsed seconds; tests pass a fixed one. */
  now?: () => number;
  /**
   * Fold the engine lines a DM narration covers under it, dim. Default false: they stay out of the
   * story, and `/log` prints them (AGT-37).
   */
  verbose?: boolean;
  /** Glyphs for the panel's turn-order line, by handle or creature kind (AGT-67); none by default. */
  glyphs?: Record<string, string>;
  /** The adventure's title, for the header. */
  title?: string;
}

export class InkSeat implements Seat {
  readonly handle: Handle;
  private readonly options: InkSeatOptions;
  private view: SeatView = { lines: [], prompt: undefined, draft: "", cursor: 0 };
  /** Lines entered so far, oldest first, for Ctrl+P and Ctrl+N; `recalled` is the one on the row. */
  private readonly history: string[] = [];
  private recalled: number | undefined;
  private nextId = 0;
  private answer: ((intent: PlayerIntent) => void) | undefined;
  /** Commands typed while the table was busy, answered at the next prompt. */
  private readonly queued: PlayerIntent[] = [];
  private readonly listeners = new Set<() => void>();
  private instance: Instance | undefined;
  private interrupted = false;
  /**
   * Other characters' engine lines waiting for the DM's narration of them, and the newest panel
   * frame, which waits for the next narration or decision, so neither tells the outcome first (AGT-37).
   */
  private held: Line[] = [];
  private heldSituation: Extract<TableEvent, { kind: "situation" }> | undefined;
  /** The speaker of the message the last line belongs to; undefined after anything else. */
  private speaker: string | undefined;

  constructor(handle: Handle, options: InkSeatOptions = {}) {
    this.handle = handle;
    this.options = options;
    this.palette = options.palette ?? paletteFor();
    this.animate = options.animate ?? (!process.env.NO_COLOR && process.stdout.isTTY === true);
    this.now = options.now ?? Date.now;
  }

  readonly animate: boolean;
  readonly now: () => number;
  get glyphs(): Record<string, string> | undefined {
    return this.options.glyphs;
  }
  get title(): string | undefined {
    return this.options.title;
  }

  /**
   * A scene starts (AGT-69): the header shows its number of the total, and the story a divider.
   * The first one starts the header's clock. Drawn here only; the transcript has the scene's load.
   */
  scene(number: number, of: number): void {
    this.update({ scene: { number, of }, started: this.view.started ?? this.now() });
    this.add([{ tone: "status", text: `— Scene ${number} of ${of} —` }]);
  }

  /** A line from the run itself (who plays, the run folder) into the story, instead of printing over the frame. */
  note(text: string): void {
    this.add([{ tone: "status", text }]);
  }

  busy(on: string | undefined): void {
    if (on === this.view.busy?.on) return;
    this.update({ busy: on ? { on, since: this.now() } : undefined });
  }

  preview(text: string | undefined): void {
    if (text === this.view.preview) return;
    this.update({ preview: text });
  }

  /**
   * Starts drawing; tests pass their own streams. The run passes `alternateScreen`, so the frame
   * owns the screen and the terminal comes back as it was when the seat stops, or the process exits.
   */
  start(options: RenderOptions = {}): Instance {
    this.instance = render(h(TableScreen, { seat: this }), { exitOnCtrlC: false, incrementalRendering: true, ...options });
    if (options.alternateScreen) this.guardCrash();
    return this.instance;
  }

  /**
   * Takes over a screen already drawing in the alternate screen (the pick screen, AGT-69 step 3):
   * the table replaces it in the same frame, with no flash of the normal terminal between them.
   */
  adopt(instance: Instance): void {
    this.instance = instance;
    instance.rerender(h(TableScreen, { seat: this }));
    this.guardCrash();
  }

  private guardCrash(): void {
    process.on("uncaughtException", this.crash);
    process.on("unhandledRejection", this.crash);
  }

  /** Stops drawing; in the alternate screen, the terminal returns to what it showed before. */
  stop(): void {
    process.off("uncaughtException", this.crash);
    process.off("unhandledRejection", this.crash);
    this.instance?.unmount();
    this.instance = undefined;
  }

  /**
   * A crash gives the terminal back before its stack trace prints, so the trace lands on the
   * normal screen instead of the alternate one, which the exit wipes (decision 0054).
   */
  private readonly crash = (error: unknown): void => {
    this.stop();
    console.error(error);
    process.exit(1);
  };

  show(event: TableEvent): void {
    switch (event.kind) {
      case "situation":
        // The loop refreshes the panel before each step, ahead of the narration of what came
        // before it: the frame waits for that narration, or for the next decision. A turn block
        // the frame shows is over goes at once.
        this.heldSituation = event;
        if (this.view.options?.budget && event.situation && endsTurn(event.situation, this.handle)) this.update({ options: undefined });
        return;
      case "options":
        // Numbered options stay above the prompt instead of scrolling away; `/options` prints them again.
        this.release();
        this.update({ options: event, highlight: undefined });
        return;
      case "engine": {
        // The human's own line shows at once; others' lines before it still wait for their narration.
        const lines = eventLines(event, this.handle);
        if (event.own) this.add(lines);
        else this.held.push(...lines);
        return;
      }
      case "narration": {
        if (this.view.preview !== undefined) this.update({ preview: undefined });
        // The lines it narrates go under it, or nowhere: the narration tells them.
        const covered = this.held.map((line) => ({ ...line, text: `    ${line.text.trimStart()}` }));
        this.held = [];
        this.message(event);
        if (this.options.verbose) this.print(covered, false);
        this.release();
        return;
      }
      case "info":
        // A command's answer stands over the story; a refusal stands over the options.
        if (OVERLAYS.has(event.title)) {
          this.update({ overlay: { title: event.title, text: event.text, at: this.view.lines.length } });
          return;
        }
        if (event.title === "Not accepted") {
          this.update({ refusal: event.text });
          return;
        }
        break;
      case "reaction":
        // The fight stands still until the human answers: the action zone holds it, not the story.
        this.release();
        this.update({ reaction: event });
        return;
      case "question":
        this.release();
        this.update({ question: event.text });
        break;
      case "end":
        // The end of the run is read in the story, whatever was open over it.
        this.release();
        // The narrow frame's /panel overlay is `folded`, so it closes too; a wide frame's folded pane opens again.
        this.update({ overlay: undefined, folded: false, reaction: undefined, question: undefined });
        break;
    }
    if (speakerOf(event) !== undefined) this.message(event);
    else this.add(eventLines(event, this.handle));
  }

  /** A narration, a line, an intent or a question: on the message above when the speaker is the same. */
  private message(event: TableEvent): void {
    const speaker = speakerOf(event);
    const continued = speaker === this.speaker;
    this.print(eventLines(event, this.handle, continued), !continued);
    this.speaker = speaker;
  }

  /** Shows the held engine lines as they are, with no narration over them, and the panel frame held with them. */
  private release(): void {
    const lines = this.held;
    this.held = [];
    this.add(lines);
    const situation = this.heldSituation;
    this.heldSituation = undefined;
    if (situation) this.situation(situation);
  }

  private situation(event: Extract<TableEvent, { kind: "situation" }>): void {
    const situation = event.situation ?? this.view.situation;
    const options = this.view.options?.budget && event.situation && endsTurn(event.situation, this.handle) ? undefined : this.view.options;
    this.update({ situation, stale: !event.situation, options });
  }

  readonly palette: Palette;

  unnarrated(): void {
    this.release();
  }

  ask(prompt: HumanPrompt): Promise<PlayerIntent> {
    // Nothing waits for a narration while the human decides.
    this.release();
    const queued = this.queued.shift();
    if (queued) return Promise.resolve(queued);
    if (this.interrupted) return Promise.resolve({ kind: "command", name: "quit" });
    // A fight's options belong to the human's own turn: any other prompt means it is over.
    const turnOver = this.view.options?.budget && prompt.kind !== "combat_turn" && prompt.kind !== "pick";
    this.update({ prompt, ...(turnOver ? { options: undefined } : {}) });
    return new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  // --- For the screen ---------------------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getView = (): SeatView => this.view;

  /** Typed text. A pasted chunk can hold line breaks: each one is an Enter. */
  type(input: string): void {
    const parts = input.split(/\r\n|\r|\n/);
    parts.forEach((part, i) => {
      if (i > 0) this.enter();
      if (part) this.edit({ kind: "insert", text: part });
    });
  }

  erase(): void {
    this.edit({ kind: "backspace" });
  }

  /** One edit to the input row (editor.ts); any key clears the notice on the row. */
  edit(change: Edit): void {
    const next = edit({ text: this.view.draft, cursor: this.view.cursor }, change);
    this.update({ draft: next.text, cursor: next.cursor, notice: undefined });
  }

  /** Ctrl+P (-1) and Ctrl+N (+1): an earlier or later line entered, onto the row. */
  recall(step: -1 | 1): void {
    if (this.history.length === 0) return;
    const from = this.recalled ?? this.history.length;
    const to = Math.max(0, Math.min(this.history.length, from + step));
    this.recalled = to === this.history.length ? undefined : to;
    const text = this.recalled === undefined ? "" : this.history[to];
    this.update({ draft: text, cursor: text.length, notice: undefined });
  }

  enter(): void {
    // Enter on an empty line plays the option ↑/↓ lit, as if its number were typed.
    if (!this.view.draft.trim() && this.view.highlight !== undefined && picksOptions(this.view.prompt)) this.update({ draft: String(this.view.highlight) });
    const draft = this.view.draft;
    const typed = readLine(draft, this.view.prompt);
    if (typed.kind === "empty") return;
    if (typed.kind === "error") {
      // The line stays on the row to fix or send later, with what was wrong under the cursor.
      this.update({ notice: { text: typed.text, error: true } });
      return;
    }
    if (this.history.at(-1) !== draft.trim()) this.history.push(draft.trim());
    this.recalled = undefined;
    this.update({ ...EMPTY_ROW, notice: undefined });
    switch (typed.kind) {
      case "panel":
        this.update({ folded: !this.view.folded, overlay: undefined });
        return;
      case "help":
        this.update({ overlay: { title: "Help", text: helpText(), at: this.view.lines.length } });
        return;
      case "intent": {
        this.add([{ tone: "prompt", text: `> ${draft.trim()}` }]);
        const answer = this.answer;
        if (answer) {
          this.answer = undefined;
          // What the answer settles leaves the action zone; a command leaves it standing.
          // A move or words also close an overlay, so the story shows what they lead to.
          if (typed.intent.kind !== "command") this.update({ reaction: undefined, question: undefined, refusal: undefined, overlay: undefined });
          // Out of combat a pick or words answer the options; in a fight they stay until the turn ends.
          const done = this.view.options && !this.view.options.budget && this.view.prompt?.kind !== "pick" && (typed.intent.kind === "option" || typed.intent.kind === "text");
          this.update({ prompt: undefined, highlight: undefined, ...(done ? { options: undefined } : {}) });
          answer(typed.intent);
        } else {
          this.queued.push(typed.intent);
          this.update({ notice: { text: "answered at your next prompt", error: false } });
        }
      }
    }
  }

  /**
   * The run is over (AGT-69 step 4): the action zone says how, and lists the post-run checks,
   * which the run marks with `check` as they go. Nothing more is asked of the human; any key
   * leaves (`left`).
   */
  finish(finale: Omit<Finale, "checks">, checks: string[]): void {
    const answer = this.answer;
    this.answer = undefined;
    this.update({
      finale: { ...finale, checks: checks.map((name) => ({ name, state: "waiting" })) },
      prompt: undefined,
      options: undefined,
      reaction: undefined,
      question: undefined,
      refusal: undefined,
      overlay: undefined,
      busy: undefined,
      preview: undefined,
      // A line typed while the table was busy goes: the input row now says any key leaves.
      draft: "",
      cursor: 0,
    });
    answer?.({ kind: "command", name: "quit" });
  }

  /** A post-run check starts, passes or fails. */
  check(name: string, state: CheckState): void {
    const finale = this.view.finale;
    if (!finale) return;
    this.update({ finale: { ...finale, checks: finale.checks.map((c) => (c.name === name ? { ...c, state } : c)) } });
  }

  // Declared before `left`, whose initializer sets it.
  private leave!: () => void;
  /** Resolves when a key is pressed on the end screen. */
  readonly left: Promise<void> = new Promise((resolve) => {
    this.leave = resolve;
  });

  /** A key on the end screen. */
  keyAtEnd(): void {
    this.leave();
  }

  /**
   * ↑ (-1) and ↓ (+1): move the highlight over the options on screen while the table waits on the
   * human (AGT-48 Q1). The first press lights the first (↓) or the last (↑) option; it wraps round.
   */
  move(step: -1 | 1): void {
    const numbers = (this.view.options?.lines ?? []).map((line) => Number(/^(\d+)\. /.exec(line)?.[1])).filter((n) => Number.isInteger(n) && n > 0);
    if (!picksOptions(this.view.prompt) || numbers.length === 0) return;
    const at = this.view.highlight === undefined ? -1 : numbers.indexOf(this.view.highlight);
    const next = at < 0 ? (step === 1 ? 0 : numbers.length - 1) : (at + step + numbers.length) % numbers.length;
    this.update({ highlight: numbers[next] });
  }

  /**
   * Esc on an empty line inside a follow-up pick: back to the turn's own options (AGT-48 Q5). The
   * loop shows them again; false when there is no pick to leave.
   */
  back(): boolean {
    if (this.view.draft || this.view.prompt?.kind !== "pick" || !this.answer) return false;
    const answer = this.answer;
    this.answer = undefined;
    this.update({ prompt: undefined, highlight: undefined });
    answer({ kind: "back" });
    return true;
  }

  /** Esc: closes an overlay (a command's answer, or the narrow frame's whole panel); false when none was open. */
  closeOverlay(narrow: boolean): boolean {
    if (this.view.overlay) {
      this.update({ overlay: undefined });
      return true;
    }
    if (narrow && this.view.folded) {
      this.update({ folded: false });
      return true;
    }
    return false;
  }

  /** Ctrl+C: the first ends the run between decisions, the second exits at once. */
  interrupt(): void {
    if (this.interrupted) {
      this.stop();
      process.exit(130);
    }
    this.interrupted = true;
    this.add([{ tone: "end", text: "Stopping after the current decision; Ctrl+C again stops at once." }]);
    this.options.onQuit?.();
    const answer = this.answer;
    if (answer) {
      this.answer = undefined;
      this.update({ prompt: undefined });
      answer({ kind: "command", name: "quit" });
    }
  }

  /**
   * The run stops from outside the seat (the time limit): a prompt waiting on the human is answered
   * with quit, and so is any later one, so the table ends between decisions.
   */
  stopAsking(why: string): void {
    if (this.interrupted) return;
    this.interrupted = true;
    this.add([{ tone: "end", text: `Stopping: ${why}.` }]);
    const answer = this.answer;
    if (answer) {
      this.answer = undefined;
      this.update({ prompt: undefined });
      answer({ kind: "command", name: "quit" });
    }
  }

  /** Adds lines that aren't a message's: they end the message above, after a blank line. */
  private add(lines: Line[]): void {
    if (lines.length === 0) return;
    this.print(lines, this.speaker !== undefined);
    this.speaker = undefined;
  }

  /** Adds lines to the story, after a blank line when `gap` (and the story has lines). */
  private print(lines: Line[], gap: boolean): void {
    if (lines.length === 0) return;
    const blank = gap && this.view.lines.length > 0 && this.view.lines.at(-1)!.text !== "" ? [{ tone: "status" as const, text: "" }] : [];
    this.update({ lines: [...this.view.lines, ...[...blank, ...lines].map((line) => ({ ...line, id: this.nextId++ }))] });
  }

  private update(change: Partial<SeatView>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }
}

const EMPTY_ROW = { draft: EMPTY.text, cursor: EMPTY.cursor };

/**
 * Whether a number typed now picks from the options on screen: not for the DM's question, where a
 * number is words, nor for a reaction, whose numbers are its own (input.ts `readLine`).
 */
function picksOptions(prompt: HumanPrompt | undefined): boolean {
  return prompt !== undefined && prompt.kind !== "answer" && prompt.kind !== "reaction" && prompt.kind !== "paused";
}

export type CheckState = "waiting" | "running" | "done" | "failed";

/** What the end screen shows: how the run ended, what to do after a stop, and the checks. */
export interface Finale {
  /** "The run is over: the party reached the end", or "Stopped: the run failed: ...". */
  text: string;
  /** For a stop (screen 13): one line on what to do now. */
  todo?: string;
  checks: Array<{ name: string; state: CheckState }>;
}

/** The story's last line with text, without copying the story. */
function lastText(lines: Line[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].text.trim() !== "") return lines[i].text;
  return undefined;
}

const CHECK_MARK: Record<CheckState, string> = { waiting: " ", running: "…", done: "✓", failed: "✗" };

/** The end screen's rows (screens 12 and 13): no verdict and no report, which are the DM's view (Rule 3). */
export function finaleRows(finale: Finale, width: number, told = false): Row[] {
  const said = (text: string, style: Style): Row[] => wrapText(text, width, 0).split("\n").map((row) => [{ text: row, style }]);
  return [
    // Said once: when the story's last line already ends the run in these words, the zone doesn't repeat it.
    ...(told ? [] : said(finale.text, { accent: "rust", bold: true })),
    ...(finale.todo ? said(finale.todo, {}) : []),
    [],
    ...finale.checks.map((c): Row => [{ text: `${CHECK_MARK[c.state]} ${c.name}`, style: c.state === "failed" ? { accent: "rust" } : c.state === "done" ? {} : { accent: "hint" } }]),
  ];
}

/** The loop's answers to /sheet, /where, /log and /usage, by their info titles: shown as overlays. */
export const OVERLAYS = new Set(["Sheet", "Where", "Log", "Usage"]);

/** The /help overlay: the commands, then the keys. */
export function helpText(): string {
  return [
    "Commands:",
    ...Object.entries(COMMAND_HELP).map(([name, what]) => `  /${name}  ${what}`),
    "",
    "Keys:",
    "  Enter      send the line",
    "  Tab        complete a /command",
    "  ↑/↓        light an option; Enter plays it",
    "  Esc        close this, go back from a sub-list, or clear the line",
    "  PgUp/PgDn  scroll the story, or this",
    "  End        back to the newest lines",
    "  Ctrl+P/N   lines you sent before",
    "  Ctrl+C     stop after this decision; twice, at once",
  ].join("\n");
}

/** The braille dots spinner (6/braille-pattern-cli-loading-indicator), one frame per 80 ms. */
export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** What the table waits on: "⠹ The DM is thinking · 4s" spinning, or "waiting... The DM is thinking" still. */
export function waitText(on: string | undefined, seconds: number, frame: number | undefined): string {
  const who = on ?? "The table is playing";
  if (frame === undefined) return `waiting... ${who} (/help for commands)`;
  return `${SPINNER[frame % SPINNER.length]} ${who}${seconds >= 1 ? ` · ${seconds}s` : ""} (/help for commands)`;
}

/** The wait as the input row's placeholder while no prompt is open; it re-draws itself only while spinning. */
function Waiting({ seat, busy }: { seat: InkSeat; busy: SeatView["busy"] }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!seat.animate) return;
    const timer = setInterval(() => setFrame((n) => n + 1), 80);
    return () => clearInterval(timer);
  }, [seat]);
  const seconds = busy ? Math.floor((seat.now() - busy.since) / 1000) : 0;
  return h(Text, textProps(TONE_STYLE.status, seat.palette), waitText(busy?.on, seconds, seat.animate ? frame : undefined));
}

/** The option a typed number names, from the numbered lines on screen ("2. End turn" for "2"). */
export function previewOption(draft: string, lines: string[] | undefined): { number: number; line: string } | undefined {
  if (!lines || !/^\d+$/.test(draft.trim())) return undefined;
  const number = Number(draft.trim());
  const line = lines.find((l) => l.startsWith(`${number}. `));
  return line ? { number, line } : undefined;
}


/** What the tiny frame says instead of the table (under 40 columns or 16 rows). */
export const TOO_SMALL = "Window too small: make it at least 40×16. The game goes on.";

/**
 * The screen: one full frame (AGT-69). The header; the story at the reading measure, pinned to its
 * foot, with its own PgUp/PgDn scroll; the action zone (the turn block) under it; the notice and
 * the input row. From 124 columns the side panel stands right of it at full height, past a thin
 * rule; below, the panel folds to two rows above the action zone.
 */
export function TableScreen({ seat }: { seat: InkSeat }) {
  const view = useSyncExternalStore(seat.subscribe, seat.getView);
  const size: PanelSize = useWindowSize();
  const [scroll, setScroll] = useState<Scroll | undefined>(undefined);
  // How far down the open overlay is read, from its top; a new overlay starts at its top.
  const [overlayRead, setOverlayTop] = useState(0);
  useEffect(() => setOverlayTop(0), [view.overlay, view.folded]);
  const [cache] = useState(() => new Map<number, { width: number; rows: string[] }>());
  // The header's minutes move on their own while nothing else draws.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!seat.animate) return;
    const timer = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [seat]);
  const palette = seat.palette;
  const layout = frameLayout(size);
  const width = layout.story;

  // A typed number names an option: it is lit in the turn block and named after the cursor.
  // ↑/↓ light one too (AGT-48 Q1), while nothing is typed.
  const picked = view.prompt
    ? (previewOption(view.draft, view.options?.lines) ?? (view.draft ? undefined : previewOption(String(view.highlight ?? ""), view.options?.lines)))
    : undefined;
  // The creature the option under the cursor aims at is lit in the panel too (screen 5).
  const choice = picked ? view.options?.choices.find((c) => c.number === picked.number) : undefined;
  const lit = choice?.target?.handle;
  // What the lit option does (AGT-70): a card under the roster in the wide frame, one line above the input in the narrow one.
  const guide = choice?.about ? guideFor(choice.about.id) : undefined;
  const card = guide && choice ? { label: choice.label.replace(/…$/, ""), cost: costText(choice.about?.cost), text: guide.text } : undefined;
  const cardLine = card && layout.mode === "narrow" ? wrapText(`${card.label}: ${card.text}`, width, 0).split("\n")[0] : undefined;
  const inputH = view.draft ? rowsFor(`> ${view.draft} ${picked ? `  ${picked.line}` : ""}`, width, 3) : 1;
  const notice = view.notice ? wrapText(view.notice.text, width, 0).split("\n").slice(0, 2) : [];
  // Paused, the panel is a frame of the last moment: marked stale until the game goes on (screen 10).
  const paused = view.prompt?.kind === "paused";
  const stale = view.stale || paused;
  // On the narrow frame /panel opens the whole panel over the story instead of folding it.
  const panelOverlay = layout.mode === "narrow" && view.folded && view.situation !== undefined;
  const panel =
    view.situation && layout.mode === "narrow"
      ? // The bar and your own line, with a fallen ally and a foe in reach on it (AGT-47 C1).
        foldedRows(view.situation, { stale, glyphs: seat.glyphs, lit }).slice(0, NARROW_PANEL_ROWS)
      : [];
  const below = 1 + (panel.length > 0 ? panel.length + 1 : 0) + notice.length + (cardLine ? 1 : 0) + inputH;
  // The action zone: what is asked of the human now, above the turn block (screens 4, 5, 7 to 10).
  const said = (text: string, style: Style): Row[] => wrapText(text, width, 0).split("\n").map((row) => [{ text: row, style }]);
  const reaction = view.reaction;
  const block: Row[] = [
    ...(view.refusal ? said(`Not accepted: ${view.refusal}`, TONE_STYLE.error) : []),
    ...(reaction ? [...said(`Reaction: ${reaction.summary}`, { accent: "rust", bold: true }), ...reaction.options.map((o, i) => [{ text: `${i + 1}. ${o}` }])] : []),
    ...(view.question && view.prompt?.kind === "answer" ? said(`DM asks you: ${view.question}`, TONE_STYLE.dm) : []),
    ...(paused ? said("Paused: the AI players wait. /pause to go on.", { accent: "hint" }) : []),
    ...(view.options ? turnRows(view.options.lines, view.options.budget, view.options.title, picked?.number) : []),
    ...(view.finale ? finaleRows(view.finale, width, lastText(view.lines) === view.finale.text) : []),
  ];
  const actionRoom = Math.min(Math.floor(size.rows / 2), size.rows - below - MIN_STORY_ROWS - 2);
  const action = actionRows(block, width, actionRoom, picked?.number);
  const storyH = Math.max(1, size.rows - below - action.length - (action.length > 0 ? 2 : 1));
  const story = [...storyRows(view.lines, width, cache), ...(view.preview && !view.prompt && !scroll ? previewRows(view.preview, width) : [])];
  const shown = storyWindow(story, storyH, view.lines.length, scroll);
  // An overlay over the story: its name row, then its text read from the top (AGT-69, screen 11).
  const overlayRows: Row[] | undefined = view.overlay
    ? view.overlay.text
        .split("\n")
        // A row that fits keeps its spacing (the sheet's and /help's columns); a longer one wraps.
        .flatMap((text) => ([...text].length <= width ? [text] : wrapText(text, width, 2).split("\n")).map((row) => [{ text: row, style: TONE_STYLE.info }]))
    : panelOverlay
      ? situationRows(view.situation!, { columns: width, rows: size.rows }, { stale, glyphs: seat.glyphs, pane: true, lit })
      : undefined;
  const overlayRoom = Math.max(1, storyH - 1);
  const overlayMax = overlayRows ? Math.max(0, overlayRows.length - overlayRoom) : 0;
  // A bigger window shows more of the overlay at once: the offset read near the foot of a small one
  // is clamped, so the overlay never slides past its last row.
  const overlayTop = Math.min(overlayRead, overlayMax);

  useInput((input, key) => {
    // The end screen: any key, Ctrl+C too, gives the terminal back; the checks go on.
    if (view.finale) return seat.keyAtEnd();
    if (key.ctrl && input === "c") return seat.interrupt();
    // PgUp/PgDn read the overlay while one is open, the story otherwise; Esc closes the overlay first.
    if (overlayRows && key.pageUp) return setOverlayTop(Math.max(0, overlayTop - Math.max(1, overlayRoom - 1)));
    if (overlayRows && key.pageDown) return setOverlayTop(Math.min(overlayMax, overlayTop + Math.max(1, overlayRoom - 1)));
    if (key.pageUp) return setScroll(page(scroll, -1, story, storyH, view.lines.length));
    if (key.pageDown) return setScroll(page(scroll, 1, story, storyH, view.lines.length));
    if (key.escape && seat.closeOverlay(layout.mode === "narrow")) return;
    if (key.escape && seat.back()) return;
    if (key.return) {
      // Anything sent brings the story back to its foot.
      setScroll(undefined);
      return seat.enter();
    }
    if (key.end) setScroll(undefined);
    if (key.ctrl && input === "p") return seat.recall(-1);
    if (key.ctrl && input === "n") return seat.recall(1);
    if (key.upArrow) return seat.move(-1);
    if (key.downArrow) return seat.move(1);
    const change = editFor(input, key);
    if (!change) return;
    // A paste arrives as one chunk and can hold line breaks.
    if (change.kind === "insert") return seat.type(input);
    seat.edit(change);
  });

  // A row with no text still takes its row.
  const line = (row: Row, key: string) =>
    row.every((span) => span.text === "") ? h(Text, { key }, " ") : h(Text, { key, wrap: "truncate-end" }, ...row.map((span, j) => h(Text, { key: j, ...textProps(span.style ?? {}, palette) }, span.text)));
  const blank = (key: string) => h(Text, { key }, " ");
  // The row: "> " and the line with its cursor, or, while nothing is typed, the hint or the wait as its placeholder (AGT-48).
  const inputRow = () => {
    const mark = h(Text, { key: "mark", ...textProps({ accent: "rust" }, palette) }, "> ");
    if (!view.draft) {
      const placeholder = view.finale
        ? h(Text, { key: "hint", ...textProps({ accent: "hint" }, palette) }, "Any key leaves; the checks go on after it.")
        : view.prompt && picked
          ? h(Text, { key: "hint", ...textProps(TONE_STYLE.prompt, palette) }, `Enter plays ${picked.line}`)
          : view.prompt
            ? h(Text, { key: "hint", ...textProps(TONE_STYLE.prompt, palette) }, promptHint(view.prompt, seat.handle))
            : h(Waiting, { key: "wait", seat, busy: view.busy });
      return h(Box, { key: "input", width, height: 1, overflow: "hidden" }, h(Text, { wrap: "truncate-end" }, mark, h(Text, { key: "cursor", inverse: true }, " "), placeholder));
    }
    const at = view.cursor;
    const under = view.draft.slice(at, at + 1) || " ";
    return h(
      Box,
      { key: "input", width, height: inputH, overflow: "hidden" },
      h(
        Text,
        { wrap: "wrap" },
        mark,
        view.draft.slice(0, at),
        h(Text, { inverse: true }, under),
        view.draft.slice(at + 1),
        ...(picked ? [h(Text, { key: "preview", ...textProps({ accent: "hint" }, palette) }, `  ${picked.line.slice(String(picked.number).length + 2)}`)] : []),
      ),
    );
  };

  // The overlay in the story's rows: a dim name row with its keys, and the text from `overlayTop`.
  function overlayLines() {
    const name = view.overlay?.title ?? "Panel";
    const fresh = view.overlay ? new Set(view.lines.slice(view.overlay.at).filter((l) => l.text.trim() !== "").map((l) => l.id)).size : 0;
    const more = overlayMax > 0 ? " · PgUp/PgDn" : "";
    const nameRow = h(Text, { key: "oname", wrap: "truncate-end", ...textProps({ accent: "hint", bold: true }, palette) }, `${name} · Esc closes${more}${fresh > 0 ? ` · ↓ ${fresh} new` : ""}`);
    const rows = overlayRows!.slice(overlayTop, overlayTop + overlayRoom);
    return [nameRow, ...rows.map((row, i) => line(row, `o${i}`)), ...Array.from({ length: overlayRoom - rows.length }, (_, i) => blank(`ob${i}`))];
  }

  if (layout.mode === "tiny") {
    return h(Box, { flexDirection: "column", width: size.columns }, h(Text, { wrap: "truncate-end", ...textProps({ accent: "hint" }, palette) }, TOO_SMALL), inputRow());
  }

  const mode = view.prompt?.kind === "paused" ? "Paused" : view.situation ? (view.situation.mode === "combat" ? `Round ${view.situation.round ?? 1}` : "Explore") : undefined;
  const header = headerText({
    title: seat.title,
    scene: view.scene,
    mode,
    minutes: view.started === undefined ? undefined : Math.floor((seat.now() - view.started) / 60_000),
  });
  const storyLines = overlayRows
    ? overlayLines()
    : shown.rows.map((row, i) => {
        const key = `s${i}`;
        if (scroll && i === shown.rows.length - 1) return h(Text, { key, wrap: "truncate-end", ...textProps({ accent: "hint" }, palette) }, freshText(shown.fresh));
        return row ? h(Text, { key, wrap: "truncate-end", ...textProps(row.style, palette) }, row.text || " ") : blank(key);
      });
  const left = [
    ...storyLines,
    ...(panel.length > 0 ? [blank("pgap"), ...panel.map((row, i) => line(row, `p${i}`))] : []),
    blank("agap"),
    ...(action.length > 0 ? [...action.map((row, i) => line(row, `a${i}`)), blank("igap")] : []),
    ...notice.map((text, i) => h(Text, { key: `n${i}`, wrap: "truncate-end", ...textProps(view.notice!.error ? TONE_STYLE.error : TONE_STYLE.status, palette) }, text)),
    ...(cardLine ? [h(Text, { key: "card", wrap: "truncate-end", ...textProps({ accent: "hint" }, palette) }, cardLine)] : []),
    inputRow(),
  ];
  const headerRow = h(Text, { key: "header", wrap: "truncate-end", dimColor: true }, header);
  const body = size.rows - 1;
  if (layout.mode === "narrow") {
    return h(Box, { flexDirection: "column", width: size.columns, height: size.rows }, headerRow, h(Box, { key: "story", flexDirection: "column", width, height: body }, ...left));
  }
  const roster = view.situation ? situationRows(view.situation, { columns: layout.side!, rows: body }, { folded: view.folded, stale, glyphs: seat.glyphs, pane: true, lit }) : [];
  // The action card stands under the roster, past a blank row, cut to the rows left.
  const cardRoom = body - roster.length - (roster.length > 0 ? 1 : 0);
  const cardShown = card && cardRoom > 1 ? cardRows(card.label, card.cost, card.text, layout.side!).slice(0, cardRoom) : [];
  const side = cardShown.length > 0 ? [...roster, ...(roster.length > 0 ? [[] as Row] : []), ...cardShown] : roster;
  return h(
    Box,
    { flexDirection: "column", width: size.columns, height: size.rows },
    headerRow,
    h(
      Box,
      { key: "frame", flexDirection: "row", height: body },
      h(Box, { key: "story", flexDirection: "column", width, flexShrink: 0 }, ...left),
      h(
        Box,
        { key: "rule", flexDirection: "column", width: RULE_COLUMNS, flexShrink: 0, alignItems: "center" },
        ...Array.from({ length: body }, (_, i) => h(Text, { key: i, ...textProps({ accent: "hint" }, palette) }, "│")),
      ),
      h(Box, { key: "side", flexDirection: "column", width: layout.side, flexShrink: 0 }, ...side.map((row, i) => line(row, `r${i}`))),
    ),
  );
}
