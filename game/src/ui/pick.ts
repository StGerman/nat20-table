// The pick screen (M7 spec §4.2, TASKS.md AGT-35; full screen, AGT-69 step 3): before the engine
// starts, the human picks the character they play from the pack's party. The list stands left and
// the highlighted character's card right, in the alternate screen the table then takes over
// without a flash of the normal terminal: the same Ink instance is handed to the seat (InkSeat.adopt).
// ↑/↓ or a number move the highlight, Enter plays it; Enter at once plays the pack's default. The
// others become AI players. `--play <handle>` skips the screen.
import type { Handle } from "@nat20-table/engine-client";
import { Box, render, Text, useInput, useWindowSize, type Instance, type RenderOptions } from "ink";
import { createElement as h, useState } from "react";
import type { RosterEntry } from "../play/run.ts";
import { textProps, wrapText } from "./lines.ts";
import { paletteFor, type Palette } from "./palette.ts";
import type { PanelSize } from "./panel.ts";

/** Where the highlight stands, and what a key does to it: move it, or pick. */
export interface PickState {
  at: number;
}

export type PickKey = { kind: "up" } | { kind: "down" } | { kind: "digit"; digit: number } | { kind: "enter" };

/** A key on the pick screen: the new highlight, and the handle once Enter picks. A number past the list is ignored. */
export function pickKey(roster: RosterEntry[], state: PickState, key: PickKey): { state: PickState; picked?: Handle } {
  switch (key.kind) {
    case "up":
      return { state: { at: (state.at - 1 + roster.length) % roster.length } };
    case "down":
      return { state: { at: (state.at + 1) % roster.length } };
    case "digit":
      return key.digit >= 1 && key.digit <= roster.length ? { state: { at: key.digit - 1 } } : { state };
    case "enter":
      return { state, picked: roster[state.at].handle };
  }
}

/** The list's rows: a cursor on the highlighted one, the default marked. */
export function pickRows(roster: RosterEntry[], at: number, fallback: Handle): string[] {
  return roster.map((r, i) => `${i === at ? "❯" : " "} ${i + 1}. ${r.name}  ${[r.species, r.class].filter(Boolean).join(" ")} ${r.level}${r.handle === fallback ? " · default" : ""}`);
}

/** The card's rows at `width`: name, what they are, the card's opening line, and the goal. No sheet numbers. */
export function cardRows(entry: RosterEntry, width: number): string[] {
  const rows = [entry.name, `${[entry.species, entry.class].filter(Boolean).join(" ")}, level ${entry.level}`, ""];
  if (entry.about) rows.push(...wrapText(entry.about, width, 0).split("\n"), "");
  if (entry.goal) rows.push("Goal", ...wrapText(entry.goal, width, 0).split("\n"));
  return rows;
}

/** Below this many columns the card goes under the list instead of beside it. */
const SIDE_BY_SIDE = 80;
const LIST_COLUMNS = 34;

export function PickScreen({ roster, fallback, title, palette, onPick }: { roster: RosterEntry[]; fallback: Handle; title?: string; palette: Palette; onPick: (handle: Handle) => void }) {
  const size: PanelSize = useWindowSize();
  const [state, setState] = useState<PickState>({ at: Math.max(0, roster.findIndex((r) => r.handle === fallback)) });
  const [done, setDone] = useState(false);
  useInput((input, key) => {
    if (done) return;
    if (key.ctrl && input === "c") return onPick("");
    const press: PickKey | undefined = key.upArrow ? { kind: "up" } : key.downArrow ? { kind: "down" } : key.return ? { kind: "enter" } : /^\d$/.test(input) ? { kind: "digit", digit: Number(input) } : undefined;
    if (!press) return;
    const next = pickKey(roster, state, press);
    setState(next.state);
    if (next.picked) {
      setDone(true);
      onPick(next.picked);
    }
  });
  const hint = textProps({ accent: "hint" }, palette);
  const wide = size.columns >= SIDE_BY_SIDE;
  const cardWidth = Math.min(72, wide ? size.columns - LIST_COLUMNS - 3 : size.columns);
  const list = pickRows(roster, state.at, fallback).map((row, i) =>
    h(Text, { key: `l${i}`, wrap: "truncate-end", ...(i === state.at ? textProps({ accent: "rust", bold: true }, palette) : {}) }, row),
  );
  const card = cardRows(roster[state.at], cardWidth).map((row, i) => h(Text, { key: `c${i}`, wrap: "truncate-end", ...(i === 0 ? { bold: true } : row === "Goal" ? hint : {}) }, row || " "));
  return h(
    Box,
    { flexDirection: "column", width: size.columns, height: size.rows },
    h(Text, { key: "header", dimColor: true, wrap: "truncate-end" }, [title, "Who do you play?"].filter(Boolean).join(" · ")),
    h(Text, { key: "gap" }, " "),
    wide
      ? h(
          Box,
          { key: "body", flexDirection: "row", flexGrow: 1 },
          h(Box, { key: "list", flexDirection: "column", width: LIST_COLUMNS, flexShrink: 0 }, ...list),
          h(Box, { key: "rule", width: 3, flexShrink: 0 }),
          h(Box, { key: "card", flexDirection: "column", width: cardWidth, flexShrink: 0 }, ...card),
        )
      : h(Box, { key: "body", flexDirection: "column", flexGrow: 1 }, ...list, h(Text, { key: "cgap" }, " "), ...card),
    h(Text, { key: "keys", wrap: "truncate-end", ...hint }, "↑/↓ or a number, Enter to play · Ctrl+C quits"),
  );
}

/**
 * Shows the pick screen and waits for a pick. Resolves with the handle and the Ink instance, still
 * drawing, for the table to adopt; Ctrl+C gives the terminal back and exits.
 */
export function pickOnScreen(
  roster: RosterEntry[],
  fallback: Handle,
  options: { title?: string; palette?: Palette; render?: RenderOptions } = {},
): Promise<{ handle: Handle; instance: Instance }> {
  return new Promise((resolve) => {
    // A crash before the pick gives the terminal back before its trace prints, as the table does.
    const crash = (error: unknown) => {
      instance.unmount();
      console.error(error);
      process.exit(1);
    };
    const onPick = (handle: Handle) => {
      if (!handle) {
        instance.unmount();
        process.exit(130);
      }
      process.off("uncaughtException", crash);
      process.off("unhandledRejection", crash);
      resolve({ handle, instance });
    };
    const instance = render(h(PickScreen, { roster, fallback, title: options.title, palette: options.palette ?? paletteFor(), onPick }), {
      exitOnCtrlC: false,
      interactive: true,
      alternateScreen: true,
      ...options.render,
    });
    process.on("uncaughtException", crash);
    process.on("unhandledRejection", crash);
  });
}
