// The full-screen frame of the human's seat (AGT-69, decision 0054, Claude Doc «Экраны терминала»):
// after the pick the seat owns the terminal's alternate screen and draws one frame in five zones,
// a header row, the story at the 72-column measure with its own scroll, the side panel for the
// rest of the width, the action zone under the story, and the input row. Pure, so the layout is
// tested without Ink: these functions say what goes on each row; ink-seat.ts only draws the rows.
import { wrapText, TONE_STYLE, type Line, type Style } from "./lines.ts";
import { FOLD_COLUMNS, FOLD_ROWS, SIDE_PANE_COLUMNS, TEXT_COLUMNS, type PanelSize, type Row } from "./panel.ts";

/**
 * How the frame is laid out at a terminal size: `wide` puts the side panel right of the story at
 * full height (from 124 columns), `narrow` stacks one column with the panel folded to two rows
 * above the action zone, and `tiny` (under 40 columns or 16 rows) draws one line asking for a
 * bigger window, with the input row still working.
 */
export type FrameMode = "wide" | "narrow" | "tiny";

export interface FrameLayout {
  mode: FrameMode;
  /** The story's width: the reading measure, or the terminal's width when that is narrower. */
  story: number;
  /** The side panel's width, in the wide frame only. */
  side?: number;
}

/** Columns between the story and the side panel: a space, the thin rule, a space. */
export const RULE_COLUMNS = 3;
/** Rows the narrow frame gives the folded panel: its bar and your own line. */
export const NARROW_PANEL_ROWS = 2;
/** The story always keeps at least this many rows; the action zone gives way first. */
export const MIN_STORY_ROWS = 3;

export function frameLayout(size: PanelSize): FrameLayout {
  if (size.columns < FOLD_COLUMNS || size.rows < FOLD_ROWS) return { mode: "tiny", story: size.columns };
  const story = Math.min(size.columns, TEXT_COLUMNS);
  if (size.columns < SIDE_PANE_COLUMNS) return { mode: "narrow", story };
  return { mode: "wide", story, side: size.columns - story - RULE_COLUMNS };
}

/** One row of the story as drawn: its text, its look, and the line it belongs to (`-1` for the preview). */
export interface StoryRow {
  text: string;
  style: Style;
  line: number;
}

/**
 * Every line of the story wrapped to `width`, one row each; engine lines hang two columns under
 * their indent, and a blank line still takes a row. `cache` keeps each line's rows by its id and
 * width, so a long game isn't re-wrapped on every frame.
 */
export function storyRows(lines: Array<Line & { id: number }>, width: number, cache?: Map<number, { width: number; rows: string[] }>): StoryRow[] {
  const out: StoryRow[] = [];
  lines.forEach((line, index) => {
    let held = cache?.get(line.id);
    if (!held || held.width !== width) {
      held = { width, rows: wrapText(line.text, width, line.tone === "engine" ? 2 : 0).split("\n") };
      cache?.set(line.id, held);
    }
    for (const text of held.rows) out.push({ text, style: TONE_STYLE[line.tone], line: index });
  });
  return out;
}

/** The DM's narration as it is written (M10 S4): dim and italic at the foot of the story, until the finished line replaces it. */
export function previewRows(text: string, width: number): StoryRow[] {
  return wrapText(text, width, 0)
    .split("\n")
    .map((row) => ({ text: row, style: { dim: true, italic: true }, line: -1 }));
}

/**
 * Where the reader stands when they scrolled the story up: `offset` rows above the foot of the
 * first `seen` lines. Lines that arrive after `seen` don't move the text; they count as new.
 * Undefined: the story is pinned to its foot and follows the game.
 */
export interface Scroll {
  offset: number;
  seen: number;
}

export interface StoryWindow {
  /** Exactly `height` rows: the story pinned to the foot, blank rows above it while it is short. */
  rows: Array<StoryRow | undefined>;
  /** Lines (not rows) that arrived below what is shown while scrolled up; 0 when pinned. */
  fresh: number;
}

/**
 * The rows the story shows in `height` rows. While scrolled up, the last row is the «↓ N new»
 * marker (`fresh` says how many), so the window holds one row less of text.
 */
export function storyWindow(rows: StoryRow[], height: number, lineCount: number, scroll?: Scroll): StoryWindow {
  if (height <= 0) return { rows: [], fresh: 0 };
  if (!scroll) return { rows: padTop(rows.slice(Math.max(0, rows.length - height)), height), fresh: 0 };
  const room = Math.max(1, height - 1);
  const foot = footOf(rows, scroll.seen);
  const bottom = Math.max(Math.min(room, foot), foot - scroll.offset);
  const shown = rows.slice(Math.max(0, bottom - room), bottom);
  const fresh = countLines(rows, scroll.seen, lineCount);
  return { rows: [...padTop(shown, room), undefined], fresh };
}

/** How far up the story can scroll, in rows from the foot of the first `seen` lines. */
export function maxOffset(rows: StoryRow[], height: number, seen: number): number {
  return Math.max(0, footOf(rows, seen) - Math.max(1, height - 1));
}

/**
 * A page up or down (PgUp is `-1`): about a window's height, keeping one row of context. Back at
 * the foot, the scroll ends and the story follows the game again.
 */
export function page(scroll: Scroll | undefined, direction: -1 | 1, rows: StoryRow[], height: number, lineCount: number): Scroll | undefined {
  const step = Math.max(1, height - 2);
  if (direction === 1) {
    if (!scroll) return undefined;
    const offset = scroll.offset - step;
    return offset <= 0 ? undefined : { ...scroll, offset };
  }
  const seen = scroll?.seen ?? lineCount;
  const offset = Math.min(maxOffset(rows, height, seen), (scroll?.offset ?? 0) + step);
  return offset <= 0 ? scroll : { seen, offset };
}

/** The row after the last row of the first `seen` lines. */
function footOf(rows: StoryRow[], seen: number): number {
  let foot = rows.length;
  while (foot > 0 && rows[foot - 1].line >= seen) foot--;
  return foot;
}

/** Lines from `seen` on that carry text (a blank separator isn't news). */
function countLines(rows: StoryRow[], seen: number, lineCount: number): number {
  if (lineCount <= seen) return 0;
  const lines = new Set(rows.filter((r) => r.line >= seen && r.text.trim() !== "").map((r) => r.line));
  return lines.size;
}

function padTop<T>(rows: T[], height: number): Array<T | undefined> {
  return [...Array.from({ length: Math.max(0, height - rows.length) }, () => undefined), ...rows];
}

/** The marker in place of the story's last row while scrolled up. */
export function freshText(fresh: number): string {
  return fresh > 0 ? `↓ ${fresh} new · End to follow` : "↓ End to follow";
}

/** What the header says: the adventure, which scene of how many, the mode, the party's time, and /help. */
export interface HeaderInfo {
  title?: string;
  scene?: { number: number; of: number };
  /** "Explore", "Round 5", or "Paused". */
  mode?: string;
  minutes?: number;
}

/** The header row, dim, cut to the terminal's width. No scene names (C9): a number of the total. */
export function headerText(info: HeaderInfo): string {
  const parts = [
    info.title,
    info.scene ? `Scene ${info.scene.number} of ${info.scene.of}` : undefined,
    info.mode,
    info.minutes !== undefined ? `${info.minutes} min` : undefined,
    "/help",
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

/**
 * The action zone's rows for `height` at most: the turn block's header rows stay, and options
 * that don't fit scroll so the lit one stays in view, with «↑ N more» and «↓ N more» rows where
 * the list is cut. An option row wraps at `width`, hanging under its text.
 */
export function actionRows(block: Row[], width: number, height: number, lit?: number): Row[] {
  if (height <= 0 || block.length === 0) return [];
  // Header rows (the budget, a sub-list's title) are spans; options are one span starting "N. ".
  const isOption = (row: Row) => row.length === 1 && /^\d+\. /.test(row[0].text);
  const head = block.filter((row) => !isOption(row));
  const options = block.filter(isOption).map((row) => ({ number: Number(/^(\d+)\./.exec(row[0].text)![1]), rows: wrapOption(row, width) }));
  const flat = options.flatMap((o) => o.rows.map((row) => ({ number: o.number, row })));
  const room = height - head.length;
  if (flat.length <= room) return [...head, ...flat.map((f) => f.row)];
  if (room < 3) return [...head, ...flat.map((f) => f.row)].slice(0, height);
  // Two rows go to the markers; the window starts where the lit option ends up shown.
  const window = room - 2;
  const litAt = lit === undefined ? -1 : flat.findIndex((f) => f.number === lit);
  const litEnd = litAt < 0 ? -1 : flat.length - 1 - [...flat].reverse().findIndex((f) => f.number === lit);
  const start = litAt < 0 ? 0 : Math.max(0, Math.min(litAt, litEnd - window + 1, flat.length - window));
  const shown = flat.slice(start, start + window);
  const above = new Set(flat.slice(0, start).map((f) => f.number)).size;
  const below = new Set(flat.slice(start + window).map((f) => f.number)).size;
  const marker = (text: string): Row => [{ text, style: { accent: "hint" } }];
  return [...head, marker(above > 0 ? `↑ ${above} more` : ""), ...shown.map((f) => f.row), marker(below > 0 ? `↓ ${below} more` : "")];
}

function wrapOption(row: Row, width: number): Row[] {
  const span = row[0];
  const hang = (/^\d+\. /.exec(span.text)?.[0].length ?? 0) - leading(span.text);
  return wrapText(span.text, width, Math.max(0, hang))
    .split("\n")
    .map((text) => [{ ...span, text }]);
}

const leading = (text: string) => text.length - text.trimStart().length;

/** How many rows a line of `text` takes at `width`, up to `cap`. */
export function rowsFor(text: string, width: number, cap: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.min(cap, Math.ceil([...text].length / width)));
}
