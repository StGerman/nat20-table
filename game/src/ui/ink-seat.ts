// The human's seat in the terminal (M6 spec §3.4, step 11, TASKS.md AGT-7): an Ink app on the
// `Seat` interface. Everything the loop shows scrolls up as it comes, rolls inline with their ids;
// under it, what the table waits for and the line being typed. The loop answers the slash commands
// (`/sheet`, `/where`, `/options`, `/log`, `/pause`, `/quit`); `/help` is answered here. Written
// with `createElement`, not JSX, so the game still runs as plain `.ts` with no build step.
import type { Handle } from "@nat20-table/engine-client";
import { Box, render, Static, Text, useInput, type Instance, type RenderOptions } from "ink";
import { createElement as h, useSyncExternalStore } from "react";
import type { HumanPrompt, PlayerIntent, Seat, TableEvent } from "../table/types.ts";
import { COMMAND_HELP, promptHint, readLine } from "./input.ts";
import { eventLines, TONE_COLOR, type Line } from "./lines.ts";

/** What the screen draws: every line so far, what the table waits for, and the line being typed. */
export interface SeatView {
  lines: Array<Line & { id: number }>;
  prompt: HumanPrompt | undefined;
  draft: string;
}

export interface InkSeatOptions {
  /**
   * Called on the first Ctrl+C: the run command ends the table there, so a run stops between
   * decisions and still writes its report. A second Ctrl+C exits at once.
   */
  onQuit?: () => void;
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
  }

  /** Starts drawing; tests pass their own streams. */
  start(options: RenderOptions = {}): Instance {
    this.instance = render(h(TableScreen, { seat: this }), { exitOnCtrlC: false, ...options });
    return this.instance;
  }

  /** Stops drawing, with the last frame left on the terminal. */
  stop(): void {
    this.instance?.unmount();
    this.instance = undefined;
  }

  show(event: TableEvent): void {
    this.add(eventLines(event));
  }

  ask(prompt: HumanPrompt): Promise<PlayerIntent> {
    const queued = this.queued.shift();
    if (queued) return Promise.resolve(queued);
    if (this.interrupted) return Promise.resolve({ kind: "command", name: "quit" });
    this.update({ prompt });
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
          this.update({ prompt: undefined });
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

/** The screen: the lines so far (each drawn once, then left in the terminal's scrollback), the prompt and the input line. */
export function TableScreen({ seat }: { seat: InkSeat }) {
  const view = useSyncExternalStore(seat.subscribe, seat.getView);
  useInput((input, key) => {
    if (key.ctrl && input === "c") return seat.interrupt();
    if (key.return) return seat.enter();
    if (key.backspace || key.delete) return seat.erase();
    if (key.ctrl || key.meta || key.escape || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    seat.type(input);
  });
  return h(
    Box,
    { flexDirection: "column" },
    h(Static, {
      items: view.lines,
      children: (item: unknown) => {
        const line = item as SeatView["lines"][number];
        return h(Text, { key: line.id, color: TONE_COLOR[line.tone] }, line.text);
      },
    }),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(Text, { color: TONE_COLOR.prompt }, view.prompt ? promptHint(view.prompt, seat.handle) : "The table is playing… (/help for commands)"),
      h(Text, null, h(Text, { color: "green" }, "> "), view.draft, h(Text, { inverse: true }, " ")),
    ),
  );
}
