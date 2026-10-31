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
// answered here. Written with `createElement`, not JSX, so the game still runs as plain `.ts`
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
import { paletteFor, type Palette } from "./palette.ts";
import { endsTurn, situationRows, turnRows, type PanelSize, type Row } from "./panel.ts";

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
  /** `/panel` folds the situation block to its bar. */
  folded?: boolean;
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
    if (options.alternateScreen) {
      process.on("uncaughtException", this.crash);
      process.on("unhandledRejection", this.crash);
    }
    return this.instance;
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
        this.update({ options: event });
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
      case "question":
      case "reaction":
      case "end":
        this.release();
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
        this.update({ folded: !this.view.folded });
        this.add([{ tone: "status", text: this.view.folded ? "— panel folded; /panel opens it" : "— panel open" }]);
        return;
      case "help":
        this.add([
          { tone: "prompt", text: `> ${draft.trim()}` },
          { tone: "info", text: "Commands:" },
          ...Object.entries(COMMAND_HELP).map(([name, what]) => ({ tone: "info" as const, text: `  /${name}  ${what}` })),
        ]);
        return;
      case "intent": {
        this.add([{ tone: "prompt", text: `> ${draft.trim()}` }]);
        const answer = this.answer;
        if (answer) {
          this.answer = undefined;
          // Out of combat a pick or words answer the options; in a fight they stay until the turn ends.
          const done = this.view.options && !this.view.options.budget && this.view.prompt?.kind !== "pick" && (typed.intent.kind === "option" || typed.intent.kind === "text");
          this.update({ prompt: undefined, ...(done ? { options: undefined } : {}) });
          answer(typed.intent);
        } else {
          this.queued.push(typed.intent);
          this.update({ notice: { text: "answered at your next prompt", error: false } });
        }
      }
    }
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
  const picked = view.prompt ? previewOption(view.draft, view.options?.lines) : undefined;
  const inputH = view.draft ? rowsFor(`> ${view.draft} ${picked ? `  ${picked.line}` : ""}`, width, 3) : 1;
  const notice = view.notice ? wrapText(view.notice.text, width, 0).split("\n").slice(0, 2) : [];
  const panel =
    view.situation && layout.mode === "narrow"
      ? // The pane's rows, cut to the bar and your own line: out of a fight too, where the inline panel was the bar alone.
        situationRows(view.situation, size, { folded: view.folded, stale: view.stale, glyphs: seat.glyphs, pane: true }).slice(0, NARROW_PANEL_ROWS)
      : [];
  const below = 1 + (panel.length > 0 ? panel.length + 1 : 0) + notice.length + inputH;
  const block = view.options ? turnRows(view.options.lines, view.options.budget, view.options.title, picked?.number) : [];
  const actionRoom = Math.min(Math.floor(size.rows / 2), size.rows - below - MIN_STORY_ROWS - 2);
  const action = actionRows(block, width, actionRoom, picked?.number);
  const storyH = Math.max(1, size.rows - below - action.length - (action.length > 0 ? 2 : 1));
  const story = [...storyRows(view.lines, width, cache), ...(view.preview && !view.prompt && !scroll ? previewRows(view.preview, width) : [])];
  const shown = storyWindow(story, storyH, view.lines.length, scroll);

  useInput((input, key) => {
    if (key.ctrl && input === "c") return seat.interrupt();
    if (key.pageUp) return setScroll(page(scroll, -1, story, storyH, view.lines.length));
    if (key.pageDown) return setScroll(page(scroll, 1, story, storyH, view.lines.length));
    if (key.return) {
      // Anything sent brings the story back to its foot.
      setScroll(undefined);
      return seat.enter();
    }
    if (key.end) setScroll(undefined);
    if (key.ctrl && input === "p") return seat.recall(-1);
    if (key.ctrl && input === "n") return seat.recall(1);
    if (key.upArrow || key.downArrow) return;
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
      const placeholder = view.prompt
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
  const storyLines = shown.rows.map((row, i) => {
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
    inputRow(),
  ];
  const headerRow = h(Text, { key: "header", wrap: "truncate-end", dimColor: true }, header);
  const body = size.rows - 1;
  if (layout.mode === "narrow") {
    return h(Box, { flexDirection: "column", width: size.columns, height: size.rows }, headerRow, h(Box, { key: "story", flexDirection: "column", width, height: body }, ...left));
  }
  const side = view.situation ? situationRows(view.situation, { columns: layout.side!, rows: body }, { folded: view.folded, stale: view.stale, glyphs: seat.glyphs, pane: true }) : [];
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
