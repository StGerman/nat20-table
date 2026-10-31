// The human's input row as a line editor (M10 P6, TASKS.md AGT-48, engine/m6/input-line-design.md):
// a pure reducer over the typed text and the cursor, and the map from Ink's keys to its edits.
// Pure, so the editing is tested without a terminal, like panel.ts.
import { COMMANDS } from "./input.ts";

/** What is typed so far, and where the cursor stands in it (0 = before the first character). */
export interface Draft {
  text: string;
  cursor: number;
}

export const EMPTY: Draft = { text: "", cursor: 0 };

export type Edit =
  | { kind: "insert"; text: string }
  | { kind: "backspace" }
  | { kind: "left" }
  | { kind: "right" }
  | { kind: "home" }
  | { kind: "end" }
  | { kind: "word_left" }
  | { kind: "word_right" }
  /** Ctrl+W: the word before the cursor. */
  | { kind: "kill_word" }
  /** Ctrl+U: everything before the cursor. */
  | { kind: "kill_line" }
  /** Esc: the whole draft. */
  | { kind: "clear" }
  /** Tab: a slash command's name. */
  | { kind: "complete" };

/** The slash commands Tab completes, the seat's own included. */
const COMPLETABLE = ["help", "panel", ...COMMANDS];

export function edit(draft: Draft, change: Edit): Draft {
  const { text, cursor } = draft;
  switch (change.kind) {
    case "insert": {
      const printable = change.text.replace(/[\u0000-\u001f\u007f]/g, "");
      return { text: text.slice(0, cursor) + printable + text.slice(cursor), cursor: cursor + printable.length };
    }
    case "backspace":
      return cursor === 0 ? draft : { text: text.slice(0, cursor - 1) + text.slice(cursor), cursor: cursor - 1 };
    case "left":
      return { text, cursor: Math.max(0, cursor - 1) };
    case "right":
      return { text, cursor: Math.min(text.length, cursor + 1) };
    case "home":
      return { text, cursor: 0 };
    case "end":
      return { text, cursor: text.length };
    case "word_left":
      return { text, cursor: wordStart(text, cursor) };
    case "word_right":
      return { text, cursor: wordEnd(text, cursor) };
    case "kill_word": {
      const start = wordStart(text, cursor);
      return { text: text.slice(0, start) + text.slice(cursor), cursor: start };
    }
    case "kill_line":
      return { text: text.slice(cursor), cursor: 0 };
    case "clear":
      return EMPTY;
    case "complete": {
      const completed = completeCommand(text);
      return completed === text ? draft : { text: completed, cursor: completed.length };
    }
  }
}

/** Where the word before `cursor` starts: back over spaces, then over the word. */
function wordStart(text: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && text[i - 1] === " ") i--;
  while (i > 0 && text[i - 1] !== " ") i--;
  return i;
}

/** Where the word after `cursor` ends: on over spaces, then over the word. */
function wordEnd(text: string, cursor: number): number {
  let i = cursor;
  while (i < text.length && text[i] === " ") i++;
  while (i < text.length && text[i] !== " ") i++;
  return i;
}

/**
 * `/sh` → `/sheet`; with more than one match, as far as the matches agree (`/p` → `/pa`, which
 * `/panel` and `/pause` share). Anything that isn't a bare slash command comes back as it is.
 */
export function completeCommand(text: string): string {
  const match = /^\/(\S*)$/.exec(text);
  if (!match) return text;
  const prefix = match[1].toLowerCase();
  const names = COMPLETABLE.filter((name) => name.startsWith(prefix));
  if (names.length === 0) return text;
  let common = names[0];
  for (const name of names.slice(1)) {
    while (!name.startsWith(common)) common = common.slice(0, -1);
  }
  return common.length > prefix.length ? `/${common}` : text;
}

/** The part of Ink's key report the editor reads. */
export interface KeyPress {
  leftArrow?: boolean;
  rightArrow?: boolean;
  home?: boolean;
  end?: boolean;
  escape?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

/**
 * The edit a key makes, or undefined for a key the editor leaves alone. Backspace and Delete both
 * erase back: most terminals send DEL for Backspace, and Ink reports it as Delete. Word moves are
 * Alt+←/→ or Alt+B/F, as in a shell; Ctrl+A and Ctrl+E go to the ends.
 */
export function editFor(input: string, key: KeyPress): Edit | undefined {
  if (key.backspace || key.delete) return { kind: "backspace" };
  if (key.escape) return { kind: "clear" };
  if (key.tab) return { kind: "complete" };
  if (key.home) return { kind: "home" };
  if (key.end) return { kind: "end" };
  if (key.leftArrow) return { kind: key.meta || key.ctrl ? "word_left" : "left" };
  if (key.rightArrow) return { kind: key.meta || key.ctrl ? "word_right" : "right" };
  if (key.meta && input === "b") return { kind: "word_left" };
  if (key.meta && input === "f") return { kind: "word_right" };
  if (key.ctrl) {
    switch (input) {
      case "a":
        return { kind: "home" };
      case "e":
        return { kind: "end" };
      case "w":
        return { kind: "kill_word" };
      case "u":
        return { kind: "kill_line" };
    }
    return undefined;
  }
  if (key.meta) return undefined;
  return input ? { kind: "insert", text: input } : undefined;
}
