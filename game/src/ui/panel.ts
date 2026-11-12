// The situation panel and the turn block (AGT-36, engine/m6/situation-panels-design.md), laid out
// as rows of styled spans for a terminal size. Pure, so the layout is tested without Ink. Checked
// against the tui-design skill (github.com/gfargo/tui-design-skill): no borders, one accent and
// one word per state, the side said once per group, distance in feet only, `in reach` only where
// it holds, and a fixed fold at small sizes.
import type { Handle, TurnBudget } from "@nat20-table/engine-client";
import type { Situation, SituationCreature } from "../table/situation.ts";
import { wrapText, type Style } from "./lines.ts";
import { THEME } from "./palette.ts";
import { UI_WORDS, type UiWords } from "../table/words.ts";

export interface Span {
  text: string;
  style?: Style;
}
export type Row = Span[];

export interface PanelSize {
  columns: number;
  rows: number;
}

/** Below this many terminal rows, or this many columns, the panel is its bar alone, and the full-screen frame is too small (frame.ts). */
export const FOLD_ROWS = 16;
export const FOLD_COLUMNS = 40;
/**
 * The width rule («Раскладка терминала», option B; M10 P5, design §3.8): narration, options and the
 * input line keep to a reading measure of at most this many columns however wide the terminal is.
 */
export const TEXT_COLUMNS = 72;
/** From this many columns the side panel stands right of the story instead of folding above the action zone (frame.ts). */
export const SIDE_PANE_COLUMNS = 124;
/**
 * The turn-order glyphs to draw (M10 P7, AGT-67): the pack's, unless NO_COLOR asks for plain text
 * or the locale doesn't say UTF-8, where an emoji could come out as a box or a wrong width.
 */
export function glyphsFor(env: NodeJS.ProcessEnv, glyphs: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!glyphs || Object.keys(glyphs).length === 0 || env.NO_COLOR) return undefined;
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  return /utf-?8/i.test(locale) ? glyphs : undefined;
}

/** Below this many columns, creature rows drop the display name. */
const NARROW_COLUMNS = 70;

const muted: Style = { accent: "hint" };
const danger: Style = { accent: "rust" };
const magic: Style = { accent: "violet" };

const titled = (handle: string) => handle.charAt(0).toUpperCase() + handle.slice(1);
const words = (id: string) => titled(id.replace(/[_.]/g, " "));

/**
 * The situation block: a bar, then (in a fight, room permitting) your line, the creatures you
 * perceive grouped by side, and the fallen. It takes at most a third of the terminal's rows.
 */
export function situationRows(
  situation: Situation,
  size: PanelSize,
  options: { folded?: boolean; stale?: boolean; glyphs?: Record<string, string>; pane?: boolean; lit?: Handle; ui?: UiWords } = {},
): Row[] {
  const ui = options.ui ?? UI_WORDS.en;
  const rows = [bar(situation, options.stale, options.glyphs, ui)];
  // The full-screen side pane (AGT-69) has the whole height: out of a fight it shows you and the
  // party too, and nothing caps it at a third of the rows.
  const pane = options.pane === true;
  const fold = options.folded || size.rows < FOLD_ROWS || size.columns < FOLD_COLUMNS || (situation.mode === "explore" && !pane);
  if (fold) return rows;
  rows.push(meRow(situation, ui));
  const cap = pane ? size.rows : Math.max(3, Math.floor(size.rows / 3));
  // Out of a fight the fallen foes aren't news (the doc's «Конец боя»): only a fight lists them.
  const downRow = situation.down.length > 0 && situation.mode === "combat" ? 1 : 0;
  const room = cap - rows.length - downRow;
  const narrow = size.columns < NARROW_COLUMNS;
  const shown = situation.creatures.length > room ? situation.creatures.slice(0, Math.max(0, room - 1)) : situation.creatures;
  const widths = {
    handle: Math.max(0, ...shown.map((c) => shownName(situation, c.handle).length)),
    name: narrow ? 0 : Math.max(0, ...shown.filter((c) => hasOwnName(situation, c)).map((c) => c.name.length)),
  };
  let side: string | undefined;
  for (const creature of shown) {
    const label = creature.side === side ? "" : ui.panel.sides[creature.side];
    side = creature.side;
    rows.push(creatureRow(situation, creature, label, widths, situation.mode === "combat", creature.handle === options.lit, ui));
  }
  const hidden = situation.creatures.length - shown.length;
  if (hidden > 0) rows.push([{ text: `       ${ui.panel.more(hidden)}`, style: muted }]);
  // The foes out of the fight (AGT-47 C5): `Fallen`, so `down` keeps one meaning, a dying ally.
  if (downRow) rows.push([{ text: ui.panel.fallen(situation.down.map((h) => shownName(situation, h)).join(", ")), style: muted }]);
  // The side pane out of a fight has room for the trip planner (AGT-83), as far as the rows go:
  // its own header line and the blank under it are the bar's day already.
  if (pane && situation.mode === "explore" && situation.road) {
    const left = size.rows - rows.length - 1;
    if (left > 1) rows.push([], ...situation.road.map.slice(2, 2 + left).map((line): Row => [{ text: line, style: muted }]));
  }
  return rows;
}


/**
 * The narrow frame's folded panel (AGT-47 C1, AGT-69): the bar and your own line, where a fallen
 * ally, a foe in reach and the lit option's target, which must not go out of sight, follow your Hit
 * Points. They come before your own conditions and effects, and a fallen ally comes first, so a
 * narrow terminal cuts your effects, then a foe, before it cuts a dying ally. An ally in reach of a
 * heal is not urgent.
 */
export function foldedRows(situation: Situation, options: { stale?: boolean; glyphs?: Record<string, string>; lit?: Handle; ui?: UiWords } = {}): Row[] {
  const ui = options.ui ?? UI_WORDS.en;
  const me = meRow(situation, ui);
  // Your name, Hit Points, temporary ones and life state stay first; conditions and effects go last.
  const core = 2 + (situation.me.temp_hp > 0 ? 1 : 0) + (situation.me.life_state !== "conscious" ? 2 : 0);
  // Out of a fight the fold is the bar and your line: the bar already names the party with its health.
  const fight = situation.mode === "combat" ? situation.creatures : [];
  const fallen = fight.filter((c) => c.side === "party" && c.health === "down");
  const near = fight.filter((c) => c.side === "hostile" && c.in_reach);
  const target = fight.filter((c) => c.handle === options.lit && !fallen.includes(c) && !near.includes(c));
  const urgent: Row = [];
  for (const c of [...fallen, ...near, ...target]) {
    const lit = c.handle === options.lit ? { accent: "rust" as const, bold: true } : undefined;
    urgent.push({ text: " · " }, { text: shownName(situation, c.handle), ...(lit ? { style: lit } : {}) });
    if (c.side === "party") urgent.push({ ...health(c.health, 0, ui), text: ` ${ui.panel.health[c.health]}` });
    else if (c.in_reach) urgent.push({ text: ` ${ui.panel.inReach}`, style: { bold: true } });
  }
  return [bar(situation, options.stale, options.glyphs, ui), [...me.slice(0, core), ...urgent, ...me.slice(core)]];
}

/** A party member's name is its handle; a monster's is its kind ("Goblin Warrior"). */
const hasOwnName = (s: Situation, c: SituationCreature) => c.name.toLowerCase() !== shownName(s, c.handle).toLowerCase();

/** A creature as the panel names it: its handle, or its name at a Russian seat («волк 1»). */
const shownName = (s: Situation, handle: Handle) => s.shown?.[handle] ?? handle;

function bar(s: Situation, stale = false, glyphs: Record<string, string> | undefined, ui: UiWords): Row {
  const p = ui.panel;
  const row: Row = [];
  // A creature's glyph, by its handle or else its kind, in front of the handle on the turn-order line only (AGT-67).
  const kindOf = (handle: string) => {
    if (handle === s.me.handle) return s.me.kind ?? s.me.name;
    const c = s.creatures.find((x) => x.handle === handle);
    return c?.kind ?? c?.name;
  };
  const marked = (handle: string) => {
    const kind = kindOf(handle);
    const glyph = glyphs?.[handle] ?? (kind ? glyphs?.[kind] : undefined);
    return glyph ? `${glyph} ${shownName(s, handle)}` : shownName(s, handle);
  };
  if (s.mode === "explore") {
    const party = s.creatures.filter((c) => c.side === "party");
    // In the living world the bar says the day and where the caravan is (AGT-79).
    row.push({ text: s.road ? s.road.where : p.explore });
    if (party.length > 0) row.push({ text: p.party }, ...join(party.map((c) => [{ text: `${shownName(s, c.handle)} ` }, health(c.health, 0, ui)])));
  } else {
    row.push({ text: p.round(s.round ?? 1) });
    const mine = glyphs?.[s.me.handle] ?? glyphs?.[s.me.kind ?? s.me.name];
    if (s.turn === s.me.handle) row.push({ text: " · " }, { text: `▶ ${mine ? `${mine} ` : ""}${p.yourTurn}`, style: { accent: "rust", bold: true } });
    else if (s.turn) row.push({ text: ` · ${p.turnOf(marked(s.turn))}` });
    if (s.up_in !== undefined) row.push({ text: p.upIn(s.up_in) });
    else if (s.next.length > 0) row.push({ text: p.next(s.next.slice(0, 3).map(marked).join(", ")), style: muted });
  }
  if (stale) row.push({ text: p.stale, style: muted });
  return row;
}

function meRow(s: Situation, ui: UiWords): Row {
  const me = s.me;
  const p = ui.panel;
  const hurt = me.hp * 2 <= me.hp_max;
  const row: Row = [
    { text: `${me.name} `, style: { bold: true } },
    { text: p.hp(me.hp, me.hp_max), ...(hurt ? { style: danger } : {}) },
  ];
  if (me.temp_hp > 0) row.push({ text: p.temp(me.temp_hp) });
  if (me.life_state !== "conscious") row.push({ text: " · " }, { text: p.life(me.life_state), style: danger });
  for (const condition of me.conditions) row.push({ text: " · " }, { text: p.condition(condition), style: magic });
  const spell = me.concentration ? (s.concentrationName ?? words(me.concentration)) : undefined;
  if (spell) row.push({ text: " · " }, { text: p.concentrating(spell), style: magic });
  for (const effect of me.effects.filter((e) => !spell || e.toLowerCase() !== spell.toLowerCase())) {
    row.push({ text: " · " }, { text: effect, style: magic });
  }
  return row;
}

function creatureRow(s: Situation, c: SituationCreature, label: string, widths: { handle: number; name: number }, fight: boolean, lit: boolean, ui: UiWords): Row {
  const p = ui.panel;
  // The target of the option under the cursor is lit in the panel too (screen 5).
  const row: Row = [{ text: label.padEnd(7), style: muted }, { text: shownName(s, c.handle).padEnd(widths.handle + 2), ...(lit ? { style: { accent: "rust", bold: true } } : {}) }];
  if (widths.name > 0) row.push({ text: (hasOwnName(s, c) ? c.name : "").padEnd(widths.name + 2), style: muted });
  row.push(health(c.health, fight ? 9 : 0, ui));
  // Distance keeps its column, in a fight only; conditions go last, where a narrow terminal cuts
  // them first. `down` already says unconscious.
  if (fight) row.push({ text: p.feet(c.distance_ft) });
  if (c.in_reach) row.push({ text: `  ${p.inReach}`, style: { bold: true } });
  const conditions = c.health === "down" ? c.conditions.filter((condition) => condition !== "unconscious") : c.conditions;
  conditions.forEach((condition, i) => row.push({ text: i === 0 ? "  " : " · " }, { text: p.condition(condition), style: magic }));
  return row;
}

function health(band: SituationCreature["health"], width = 0, ui: UiWords = UI_WORDS.en): Span {
  // The band's accent from the theme's states (M10 U2); a band the theme doesn't list is danger.
  const accent = band in THEME.states ? THEME.states[band].accent : "rust";
  return { text: ui.panel.health[band].padEnd(width), ...(accent ? { style: { accent } } : {}) };
}

function join(groups: Span[][]): Span[] {
  return groups.flatMap((group, i) => (i === 0 ? group : [{ text: " · " }, ...group]));
}

/**
 * The turn block: what is left of the turn as the header, then the numbered options, one to a
 * row (the full-screen action zone, AGT-69, scrolls them when they don't fit: frame.ts).
 */
export function turnRows(lines: string[], budget?: TurnBudget, title?: string, lit?: number, ui: UiWords = UI_WORDS.en): Row[] {
  const rows: Row[] = [];
  if (budget) rows.push(budgetRow(budget, ui));
  if (title) rows.push([{ text: `${title}:`, style: { bold: true } }]);
  // The option a typed number names is lit (M10 P6, AGT-48).
  const span = (text: string): Span => (lit !== undefined && text.startsWith(`${lit}. `) ? { text, style: { accent: "rust", bold: true } } : { text });
  return [...rows, ...lines.map((text) => [span(text)])];
}

function budgetRow(b: TurnBudget, ui: UiWords): Row {
  const p = ui.panel;
  const use = (name: string, n: number): Span[] => [{ text: `${name} ` }, n === 0 ? { text: p.used, style: muted } : { text: n === 1 ? p.free : p.left(n) }];
  return [
    ...use(p.action, b.action),
    { text: " · " },
    ...use(p.bonusAction, b.bonus_action),
    { text: " · " },
    ...use(p.reactionWord, b.reaction),
    { text: " · " },
    { text: p.movementLeft(b.movement_ft, b.speed_ft), ...(b.movement_ft === 0 ? { style: muted } : {}) },
  ];
}

/**
 * The action card (AGT-70): the lit option's name and what it costs, then what it does wrapped to
 * `width`. Only words: no odds, no numbers the engine hasn't shown (Rule 4).
 */
export function cardRows(label: string, cost: string | undefined, text: string, width: number): Row[] {
  const head: Row = [{ text: label, style: { bold: true } }, ...(cost ? [{ text: ` · ${cost}`, style: muted }] : [])];
  return [head, ...wrapText(text, width, 0).split("\n").map((row) => [{ text: row }])];
}

/** A row as plain text, for tests and the screen-reader view. */
export function rowText(row: Row): string {
  return row.map((span) => span.text).join("").trimEnd();
}

/** Whether a fresh situation ends the human's turn, so a pinned turn block goes. */
export function endsTurn(situation: Situation, human: Handle): boolean {
  return situation.mode !== "combat" || situation.turn !== human;
}
