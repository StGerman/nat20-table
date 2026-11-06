// The pick screen (M7 spec §4.2, TASKS.md AGT-35; full screen, AGT-69 step 3): before the engine
// starts, the human picks the character they play from the pack's party. The list stands left and
// the highlighted character's card right, in the alternate screen the table then takes over
// without a flash of the normal terminal: the same Ink instance is handed to the seat (InkSeat.adopt).
// ↑/↓ or a number move the highlight, Enter plays it; Enter at once plays the pack's default. The
// others become AI players. `--play <handle>` skips the screen.
//
// With a saved party (API-45, `--roster`), the screen first asks whether to go on with it or start a
// new one; Enter at once goes on. Going on, the list shows each character at their saved level.
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

/**
 * The rows of the first question when a party is saved: go on with it, or start a new one; with
 * `again`, also play the last journey again from where it began (API-51).
 */
export function partyRows(saved: string, at: number, again = false): string[] {
  const rows = [`Continue with your party: ${saved}`, "Start a new party (it replaces the saved one when this game ends)"];
  if (again) rows.push("Play the last journey again from where it began, with the party as it was then");
  return rows.map((row, i) => `${i === at ? "❯" : " "} ${i + 1}. ${row}`);
}

/** The list's rows: a cursor on the highlighted one, the names padded so what they are lines up, the default marked. */
export function pickRows(roster: RosterEntry[], at: number, fallback: Handle): string[] {
  const names = Math.max(...roster.map((r) => [...r.name].length));
  return roster.map(
    (r, i) => `${i === at ? "❯" : " "} ${i + 1}. ${r.name.padEnd(names)}  ${[r.species, r.class].filter(Boolean).join(" ")} ${r.level}${r.handle === fallback ? " · default" : ""}`,
  );
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
/** The card beside the list keeps at least this many columns. */
const CARD_MIN = 36;
/** The list is as wide as its longest row, so nothing is cut, as long as the card keeps its room. */
const listColumns = (rows: string[], columns: number) => Math.min(Math.max(...rows.map((row) => [...row].length)), columns - 3 - CARD_MIN);

export function PickScreen({ roster, fallback, title, palette, onPick }: { roster: RosterEntry[]; fallback: Handle; title?: string; palette: Palette; onPick: (handle: Handle) => void }) {
  const size: PanelSize = useWindowSize();
  const [state, setState] = useState<PickState>({ at: Math.max(0, roster.findIndex((r) => r.handle === fallback)) });
  const [done, setDone] = useState(false);
  useInput((input, key) => {
    if (done) return;
    if (key.ctrl && input === "c") return onPick("");
    const press = keyOf(input, key);
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
  const rows = pickRows(roster, state.at, fallback);
  const listWidth = listColumns(rows, size.columns);
  const cardWidth = Math.min(72, wide ? size.columns - listWidth - 3 : size.columns);
  const list = rows.map((row, i) =>
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
          h(Box, { key: "list", flexDirection: "column", width: listWidth, flexShrink: 0 }, ...list),
          h(Box, { key: "rule", width: 3, flexShrink: 0 }),
          h(Box, { key: "card", flexDirection: "column", width: cardWidth, flexShrink: 0 }, ...card),
        )
      : h(Box, { key: "body", flexDirection: "column", flexGrow: 1 }, ...list, h(Text, { key: "cgap" }, " "), ...card),
    h(Text, { key: "keys", wrap: "truncate-end", ...hint }, "↑/↓ or a number, Enter to play · Ctrl+C quits"),
  );
}

/** A key on the party question: the new highlight, and the answer once Enter picks. */
export function partyKey(state: PickState, key: PickKey, again = false): { state: PickState; party?: Party } {
  const rows = again ? 3 : 2;
  switch (key.kind) {
    case "up":
      return { state: { at: (state.at + rows - 1) % rows } };
    case "down":
      return { state: { at: (state.at + 1) % rows } };
    case "digit":
      return key.digit >= 1 && key.digit <= rows ? { state: { at: key.digit - 1 } } : { state };
    case "enter":
      return { state, party: (["continue", "new", "again"] as const)[state.at] };
  }
}

/** Whether the run goes on with the saved party, starts a new one, or plays the last journey again (API-51). */
export type Party = "continue" | "new" | "again";

const keyOf = (input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean }): PickKey | undefined =>
  key.upArrow ? { kind: "up" } : key.downArrow ? { kind: "down" } : key.return ? { kind: "enter" } : /^\d$/.test(input) ? { kind: "digit", digit: Number(input) } : undefined;

function PartyScreen({ saved, again, title, palette, onParty }: { saved: string; again: boolean; title?: string; palette: Palette; onParty: (party: Party | "") => void }) {
  const size: PanelSize = useWindowSize();
  const [state, setState] = useState<PickState>({ at: 0 });
  useInput((input, key) => {
    if (key.ctrl && input === "c") return onParty("");
    const press = keyOf(input, key);
    if (!press) return;
    const next = partyKey(state, press, again);
    setState(next.state);
    if (next.party) onParty(next.party);
  });
  const hint = textProps({ accent: "hint" }, palette);
  return h(
    Box,
    { flexDirection: "column", width: size.columns, height: size.rows },
    h(Text, { key: "header", dimColor: true, wrap: "truncate-end" }, [title, "Your party"].filter(Boolean).join(" · ")),
    h(Text, { key: "gap" }, " "),
    h(
      Box,
      { key: "body", flexDirection: "column", flexGrow: 1 },
      ...partyRows(saved, state.at, again).map((row, i) => h(Text, { key: `p${i}`, wrap: "wrap", ...(i === state.at ? textProps({ accent: "rust", bold: true }, palette) : {}) }, row)),
    ),
    h(Text, { key: "keys", wrap: "truncate-end", ...hint }, "↑/↓ or a number, Enter to choose · Ctrl+C quits"),
  );
}

/** A saved party on the start screen: its line, its levels, and the levels its last journey began at when it can be played again (API-51). */
export interface SavedParty {
  line: string;
  levels: ReadonlyMap<Handle, number>;
  startLevels?: ReadonlyMap<Handle, number>;
}

/** The party question when a party is saved, then the pick list. */
function StartScreen({ roster, fallback, title, palette, saved, onStart }: { roster: RosterEntry[]; fallback: Handle; title?: string; palette: Palette; saved: SavedParty; onStart: (party: Party | "", handle: Handle) => void }) {
  const [party, setParty] = useState<Party | undefined>(undefined);
  if (!party) return h(PartyScreen, { saved: saved.line, again: saved.startLevels !== undefined, title, palette, onParty: (p: Party | "") => (p ? setParty(p) : onStart("", "")) });
  const levels = party === "continue" ? saved.levels : party === "again" ? saved.startLevels : undefined;
  const shown = levels ? roster.map((r) => ({ ...r, level: levels.get(r.handle) ?? r.level })) : roster;
  return h(PickScreen, { roster: shown, fallback, title, palette, onPick: (handle: Handle) => onStart(party, handle) });
}

/**
 * Shows the pick screen and waits for a pick. Resolves with the handle and the Ink instance, still
 * drawing, for the table to adopt; Ctrl+C gives the terminal back and exits. With `saved`, the
 * screen asks about the saved party first and resolves with the answer too.
 */
export function pickOnScreen(
  roster: RosterEntry[],
  fallback: Handle,
  options: { title?: string; palette?: Palette; render?: RenderOptions; saved?: SavedParty } = {},
): Promise<{ handle: Handle; instance: Instance; party?: Party }> {
  return new Promise((resolve) => {
    // A crash before the pick gives the terminal back before its trace prints, as the table does.
    const crash = (error: unknown) => {
      instance.unmount();
      console.error(error);
      process.exit(1);
    };
    const onStart = (party: Party | "" | undefined, handle: Handle) => {
      if (!handle || party === "") {
        instance.unmount();
        process.exit(130);
      }
      process.off("uncaughtException", crash);
      process.off("unhandledRejection", crash);
      resolve({ handle, instance, ...(party ? { party } : {}) });
    };
    const palette = options.palette ?? paletteFor();
    const screen = options.saved
      ? h(StartScreen, { roster, fallback, title: options.title, palette, saved: options.saved, onStart })
      : h(PickScreen, { roster, fallback, title: options.title, palette, onPick: (handle: Handle) => onStart(undefined, handle) });
    const instance = render(screen, {
      exitOnCtrlC: false,
      interactive: true,
      alternateScreen: true,
      ...options.render,
    });
    process.on("uncaughtException", crash);
    process.on("unhandledRejection", crash);
  });
}
