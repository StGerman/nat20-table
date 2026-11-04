// The slash-command picker (TASKS.md AGT-82): a bare `/` on the input row lists the commands with
// their one-line help, and each letter typed after it narrows the list by the start of the name
// (`/opt` leaves `/options`). The names and words come from `COMMAND_HELP`, the same registry
// `/help` reads, so nothing is said twice. Pure, so the list is tested without a terminal, like
// editor.ts; the seat holds the cursor and draws the rows over the input row.
import { COMMAND_HELP } from "./input.ts";
import type { Row } from "./panel.ts";

/** One command on the list: its name without the slash, and what it does. */
export interface CommandEntry {
  name: string;
  what: string;
}

/** Every command the seat takes, in the registry's order: /options and /sheet first, for a first-time player. */
export const COMMAND_ENTRIES: readonly CommandEntry[] = Object.entries(COMMAND_HELP).map(([name, what]) => ({ name, what }));

/** The most command rows the picker shows at once; the cursor scrolls the rest into view. */
export const PICKER_ROWS = 6;

/** The picker's title row, with its keys. */
export const PICKER_TITLE = "Commands · ↑/↓ move · Enter runs · Tab completes · Esc closes";

/**
 * The commands a draft names, or undefined when the draft isn't a bare slash command being typed
 * (no slash first, or a space after the name): then no picker stands. An empty array means the
 * typed letters start no command. `/?` names `/help`, as `readLine` reads it.
 */
export function commandMatches(draft: string): CommandEntry[] | undefined {
  const match = /^\/(\S*)$/.exec(draft);
  if (!match) return undefined;
  const prefix = match[1].toLowerCase();
  if (prefix === "?") return COMMAND_ENTRIES.filter((entry) => entry.name === "help");
  return COMMAND_ENTRIES.filter((entry) => entry.name.startsWith(prefix));
}

/**
 * The picker's rows: the title, then up to `room` commands as `❯ /name  what it does`, the window
 * kept round the cursor, with how many there are when some are cut. With no match, one dim row
 * says so. The `❯` marks the cursor without colour, for NO_COLOR.
 */
export function pickerRows(draft: string, matches: readonly CommandEntry[], cursor: number, room = PICKER_ROWS): Row[] {
  if (matches.length === 0) return [[{ text: `No command starts with ${draft}. /help lists them all.`, style: { accent: "hint" } }]];
  const shown = Math.max(1, Math.min(room, matches.length));
  const top = Math.min(Math.max(0, cursor - shown + 1), matches.length - shown);
  const pad = Math.max(...COMMAND_ENTRIES.map((entry) => entry.name.length)) + 1;
  const count = shown < matches.length ? ` (${shown} of ${matches.length})` : "";
  return [
    [{ text: `${PICKER_TITLE}${count}`, style: { accent: "hint", bold: true } }],
    ...matches.slice(top, top + shown).map((entry, i): Row => {
      const at = top + i === cursor;
      return [
        { text: `${at ? "❯" : " "} /${entry.name.padEnd(pad)} `, style: at ? { accent: "rust", bold: true } : {} },
        { text: entry.what, style: at ? { bold: true } : { accent: "hint" } },
      ];
    }),
  ];
}
