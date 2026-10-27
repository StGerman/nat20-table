// The human's seat in the terminal (M6 spec §3.4, step 11, TASKS.md AGT-7): an Ink app on the
// `Seat` interface. Everything the loop shows scrolls up as it comes, rolls inline with their ids;
// under it the situation panel and, while the table waits on the human, the turn block (the budget
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
import { eventLines, textProps, TONE_STYLE, type Line } from "./lines.ts";
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
    if (event.kind === "situation") {
      const situation = event.situation ?? this.view.situation;
      const options = this.view.options?.budget && event.situation && endsTurn(event.situation, this.handle) ? undefined : this.view.options;
      this.update({ situation, stale: !event.situation, options });
      return;
    }
    // Numbered options stay above the prompt instead of scrolling away; `/options` prints them again.
    if (event.kind === "options") {
      this.update({ options: event });
      return;
    }
    this.add(eventLines(event, this.handle));
  }

  readonly palette: Palette;

  ask(prompt: HumanPrompt): Promise<PlayerIntent> {
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

  private add(lines: Line[]): void {
    if (lines.length === 0) return;
    this.update({ lines: [...this.view.lines, ...lines.map((line) => ({ ...line, id: this.nextId++ }))] });
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
        return h(Text, { key: line.id, ...textProps(TONE_STYLE[line.tone], palette) }, line.text);
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
