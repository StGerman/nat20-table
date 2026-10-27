// The human's seat in the terminal (M6 spec §3.4, step 11, TASKS.md AGT-7): an Ink app on the
// `Seat` interface. What the loop shows scrolls up as messages, one speaker label each (AGT-37);
// other characters' engine lines wait for the DM's narration of them and are left out of the
// scrollback, or folded under it with `verbose`; the human's own, and any before a decision, show
// at once. Under it the situation panel and, while the table waits on the human, the turn block (the budget
// and the numbered options, AGT-36), then what the table waits for (while no prompt is open, a
// braille spinner with who is thinking) and the line being typed. The loop answers the slash
// commands (`/sheet`, `/where`, `/options`, `/log`, `/pause`, `/quit`); `/help` and `/panel` are
// answered here. Written with `createElement`, not JSX, so the game still
// runs as plain `.ts` with no build step.
import type { Handle } from "@nat20-table/engine-client";
import { Box, render, Static, Text, useInput, useWindowSize, type Instance, type RenderOptions } from "ink";
import { createElement as h, useEffect, useState, useSyncExternalStore } from "react";
import type { Situation } from "../table/situation.ts";
import type { HumanPrompt, PlayerIntent, Seat, TableEvent } from "../table/types.ts";
import { COMMAND_HELP, promptHint, readLine } from "./input.ts";
import { eventLines, speakerOf, textProps, TONE_STYLE, wrapText, type Line } from "./lines.ts";
import { paletteFor, type Palette } from "./palette.ts";
import { endsTurn, situationRows, turnRows, type PanelSize, type Row } from "./panel.ts";

/** The numbered options held above the prompt while they are the human's to pick from. */
export type PinnedOptions = Extract<TableEvent, { kind: "options" }>;

/** What the screen draws: every line so far, the panel, what the table waits for, and the line being typed. */
export interface SeatView {
  lines: Array<Line & { id: number }>;
  prompt: HumanPrompt | undefined;
  draft: string;
  /** The last situation the loop sent; `stale` once a refresh failed. */
  situation?: Situation;
  stale?: boolean;
  /** `/panel` folds the situation block to its bar. */
  folded?: boolean;
  options?: PinnedOptions;
  /** Who the table waits on while it isn't asking the human, and since when (ms). */
  busy?: { on: string; since: number };
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
}

export class InkSeat implements Seat {
  readonly handle: Handle;
  private readonly options: InkSeatOptions;
  private view: SeatView = { lines: [], prompt: undefined, draft: "" };
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

  busy(on: string | undefined): void {
    if (on === this.view.busy?.on) return;
    this.update({ busy: on ? { on, since: this.now() } : undefined });
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
      const printable = part.replace(/[\u0000-\u001f\u007f]/g, "");
      if (printable) this.update({ draft: this.view.draft + printable });
    });
  }

  erase(): void {
    if (this.view.draft) this.update({ draft: this.view.draft.slice(0, -1) });
  }

  enter(): void {
    const draft = this.view.draft;
    const typed = readLine(draft, this.view.prompt);
    this.update({ draft: "" });
    switch (typed.kind) {
      case "empty":
        return;
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
      case "error":
        this.add([
          { tone: "prompt", text: `> ${draft.trim()}` },
          { tone: "error", text: typed.text },
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
          this.add([{ tone: "status", text: "— answered at your next prompt" }]);
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

/** The braille dots spinner (6/braille-pattern-cli-loading-indicator), one frame per 80 ms. */
export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** What the table waits on: "⠹ The DM is thinking · 4s" spinning, or "waiting... The DM is thinking" still. */
export function waitText(on: string | undefined, seconds: number, frame: number | undefined): string {
  const who = on ?? "The table is playing";
  if (frame === undefined) return `waiting... ${who} (/help for commands)`;
  return `${SPINNER[frame % SPINNER.length]} ${who}${seconds >= 1 ? ` · ${seconds}s` : ""} (/help for commands)`;
}

/** The wait line under the panel while no prompt is open; it re-draws itself only while spinning. */
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

/** The screen: the lines so far (each drawn once, then left in the terminal's scrollback), the panel, the prompt and the input line. */
export function TableScreen({ seat }: { seat: InkSeat }) {
  const view = useSyncExternalStore(seat.subscribe, seat.getView);
  const size: PanelSize = useWindowSize();
  useInput((input, key) => {
    if (key.ctrl && input === "c") return seat.interrupt();
    if (key.return) return seat.enter();
    if (key.backspace || key.delete) return seat.erase();
    if (key.ctrl || key.meta || key.escape || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    seat.type(input);
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
  return h(
    Box,
    { flexDirection: "column" },
    h(Static, {
      items: view.lines,
      children: (item: unknown) => {
        const line = item as SeatView["lines"][number];
        // Wrapped here, at the width it is drawn at: a blank line still takes a row.
        return h(Text, { key: line.id, ...textProps(TONE_STYLE[line.tone], palette) }, wrapText(line.text, size.columns, line.tone === "engine" ? 2 : 0) || " ");
      },
    }),
    ...(view.situation ? [block(situationRows(view.situation, size, { folded: view.folded, stale: view.stale }), "situation")] : []),
    ...(view.options ? [block(turnRows(view.options.lines, size, view.options.budget, view.options.title), "turn")] : []),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      view.prompt ? h(Text, textProps(prompt, palette), promptHint(view.prompt, seat.handle)) : h(Waiting, { seat, busy: view.busy }),
      h(Text, null, h(Text, textProps({ accent: "rust" }, palette), "> "), view.draft, h(Text, { inverse: true }, " ")),
    ),
  );
}
