// The human's seat in the terminal (M6 spec §3.4, step 11, TASKS.md AGT-7): an Ink app on the
// `Seat` interface. What the loop shows scrolls up as messages, one speaker label each (AGT-37);
// other characters' engine lines wait for the DM's narration of them and are left out of the
// scrollback, or folded under it with `verbose`; the human's own, and any before a decision, show
// at once. Under it the situation panel and, while the table waits on the human, the turn block (the budget
// and the numbered options, AGT-36), then the input row: a line editor (editor.ts, AGT-48) whose
// placeholder is the prompt's hint, or while no prompt is open a braille spinner with who is
// thinking; mistakes show on the row, not in the scrollback. The loop answers the slash
// commands (`/sheet`, `/where`, `/options`, `/log`, `/usage`, `/pause`, `/quit`); `/help` and `/panel` are
// answered here. Text keeps to a 72-column measure, and from 124 columns the situation panel
// stands right of it (M10 P5, panel.ts `screenLayout`). Written with `createElement`, not JSX, so the game still
// runs as plain `.ts` with no build step.
import type { Handle } from "@nat20-table/engine-client";
import { Box, render, Static, Text, useInput, useWindowSize, type Instance, type RenderOptions } from "ink";
import { createElement as h, useEffect, useState, useSyncExternalStore } from "react";
import type { Situation } from "../table/situation.ts";
import type { HumanPrompt, PlayerIntent, Seat, TableEvent } from "../table/types.ts";
import { edit, editFor, EMPTY, type Edit } from "./editor.ts";
import { COMMAND_HELP, promptHint, readLine } from "./input.ts";
import { eventLines, speakerOf, textProps, TONE_STYLE, wrapText, type Line } from "./lines.ts";
import { paletteFor, type Palette } from "./palette.ts";
import { endsTurn, screenLayout, situationRows, turnRows, type PanelSize, type Row } from "./panel.ts";

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
   * until the next key, never in the scrollback (AGT-48).
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
  /** The DM's narration as it is written (M10 S4), dim under the wait line until the finished line comes. */
  preview?: string;
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
   * scrollback, and `/log` prints them (AGT-37).
   */
  verbose?: boolean;
  /** Glyphs for the panel's turn-order line, by handle or creature kind (AGT-67); none by default. */
  glyphs?: Record<string, string>;
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

  busy(on: string | undefined): void {
    if (on === this.view.busy?.on) return;
    this.update({ busy: on ? { on, since: this.now() } : undefined });
  }

  preview(text: string | undefined): void {
    if (text === this.view.preview) return;
    this.update({ preview: text });
  }

  /** Starts drawing; tests pass their own streams. */
  start(options: RenderOptions = {}): Instance {
    this.instance = render(h(TableScreen, { seat: this }), { exitOnCtrlC: false, incrementalRendering: true, ...options });
    return this.instance;
  }

  /** Stops drawing, with the last frame left on the terminal. */
  stop(): void {
    this.instance?.unmount();
    this.instance = undefined;
  }

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

  /** Adds lines to the scrollback, after a blank line when `gap` (and the scrollback has lines). */
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

/** The screen: the lines so far (each drawn once, then left in the terminal's scrollback), the panel, the prompt and the input line. */
export function TableScreen({ seat }: { seat: InkSeat }) {
  const view = useSyncExternalStore(seat.subscribe, seat.getView);
  const size: PanelSize = useWindowSize();
  useInput((input, key) => {
    if (key.ctrl && input === "c") return seat.interrupt();
    if (key.return) return seat.enter();
    if (key.ctrl && input === "p") return seat.recall(-1);
    if (key.ctrl && input === "n") return seat.recall(1);
    if (key.upArrow || key.downArrow) return;
    const change = editFor(input, key);
    if (!change) return;
    // A paste arrives as one chunk and can hold line breaks.
    if (change.kind === "insert") return seat.type(input);
    seat.edit(change);
  });
  const palette = seat.palette;
  const block = (rows: Row[], key: string) =>
    h(
      Box,
      { key, flexDirection: "column", marginTop: 1 },
      ...rows.map((row, i) =>
        h(Text, { key: i, wrap: "truncate-end" }, ...row.map((span, j) => h(Text, { key: j, ...textProps(span.style ?? {}, palette) }, span.text))),
      ),
    );
  const prompt = TONE_STYLE.prompt;
  // A typed number names an option: it is lit in the turn block and named after the cursor.
  const picked = view.prompt ? previewOption(view.draft, view.options?.lines) : undefined;
  // The row: "> " and the line with its cursor, or, while nothing is typed, the hint or the wait as its placeholder (AGT-48).
  const inputRow = () => {
    const mark = h(Text, { key: "mark", ...textProps({ accent: "rust" }, palette) }, "> ");
    if (!view.draft) {
      const placeholder = view.prompt ? h(Text, { key: "hint", ...textProps(prompt, palette) }, promptHint(view.prompt, seat.handle)) : h(Waiting, { key: "wait", seat, busy: view.busy });
      return h(Box, { key: "row" }, mark, h(Text, { key: "cursor", inverse: true }, " "), placeholder);
    }
    const at = view.cursor;
    const under = view.draft.slice(at, at + 1) || " ";
    return h(
      Text,
      { key: "row" },
      mark,
      view.draft.slice(0, at),
      h(Text, { inverse: true }, under),
      view.draft.slice(at + 1),
      ...(picked ? [h(Text, { key: "preview", ...textProps({ accent: "hint" }, palette) }, `  ${picked.line.slice(String(picked.number).length + 2)}`)] : []),
    );
  };
  // Text keeps to the reading measure; from 124 columns the situation pane stands to its right (M10 P5).
  const layout = screenLayout(size);
  const textSize: PanelSize = { columns: layout.text, rows: size.rows };
  const situation = view.situation
    ? block(situationRows(view.situation, layout.side ? { columns: layout.side, rows: size.rows } : size, { folded: view.folded, stale: view.stale, glyphs: seat.glyphs }), "situation")
    : undefined;
  const live = [
    ...(view.options ? [block(turnRows(view.options.lines, textSize, view.options.budget, view.options.title, picked?.number), "turn")] : []),
    ...(view.preview && !view.prompt ? [h(Box, { key: "preview", marginTop: 1 }, h(Text, { dimColor: true, italic: true }, wrapText(view.preview, layout.text, 0)))] : []),
    h(
      Box,
      { key: "input", flexDirection: "column", marginTop: 1 },
      ...(view.notice ? [h(Text, { key: "notice", ...textProps(view.notice.error ? TONE_STYLE.error : TONE_STYLE.status, palette) }, wrapText(view.notice.text, layout.text, 0))] : []),
      inputRow(),
    ),
  ];
  return h(
    Box,
    { flexDirection: "column" },
    h(Static, {
      items: view.lines,
      children: (item: unknown) => {
        const line = item as SeatView["lines"][number];
        // Wrapped here, at the text column's width: a blank line still takes a row.
        return h(Text, { key: line.id, ...textProps(TONE_STYLE[line.tone], palette) }, wrapText(line.text, layout.text, line.tone === "engine" ? 2 : 0) || " ");
      },
    }),
    ...(layout.side
      ? [
          h(
            Box,
            { key: "frame", flexDirection: "row", columnGap: size.columns - layout.text - layout.side },
            h(Box, { key: "text", flexDirection: "column", width: layout.text, flexShrink: 0 }, ...live),
            h(Box, { key: "side", flexDirection: "column", width: layout.side, flexShrink: 0 }, ...(situation ? [situation] : [])),
          ),
        ]
      : [
          ...(situation ? [situation] : []),
          // The same measure as the wide frame: a long draft or option row wraps at the text column.
          h(Box, { key: "text", flexDirection: "column", width: layout.text, flexShrink: 0 }, ...live),
        ]),
  );
}
