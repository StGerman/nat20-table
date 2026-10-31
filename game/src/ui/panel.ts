// The situation panel and the turn block (AGT-36, engine/m6/situation-panels-design.md), laid out
// as rows of styled spans for a terminal size. Pure, so the layout is tested without Ink. Checked
// against the tui-design skill (github.com/gfargo/tui-design-skill): no borders, one accent and
// one word per state, the side said once per group, distance in feet only, `in reach` only where
// it holds, and a fixed fold at small sizes.
import type { Handle, TurnBudget } from "@nat20-table/engine-client";
import type { Situation, SituationCreature } from "../table/situation.ts";
import type { Style } from "./lines.ts";
import { THEME } from "./palette.ts";

export interface Span {
  text: string;
  style?: Style;
}
export type Row = Span[];

export interface PanelSize {
  columns: number;
  rows: number;
}

/** Below this many terminal rows, or this many columns, the panel is its bar alone. */
export const FOLD_ROWS = 16;
export const FOLD_COLUMNS = 40;
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
export function situationRows(situation: Situation, size: PanelSize, options: { folded?: boolean; stale?: boolean } = {}): Row[] {
  const rows = [bar(situation, options.stale)];
  const fold = options.folded || size.rows < FOLD_ROWS || size.columns < FOLD_COLUMNS || situation.mode === "explore";
  if (fold) return rows;
  rows.push(meRow(situation));
  const cap = Math.max(3, Math.floor(size.rows / 3));
  const downRow = situation.down.length > 0 ? 1 : 0;
  const room = cap - rows.length - downRow;
  const narrow = size.columns < NARROW_COLUMNS;
  const shown = situation.creatures.length > room ? situation.creatures.slice(0, Math.max(0, room - 1)) : situation.creatures;
  const widths = {
    handle: Math.max(0, ...shown.map((c) => c.handle.length)),
    name: narrow ? 0 : Math.max(0, ...shown.filter(hasOwnName).map((c) => c.name.length)),
  };
  let side: string | undefined;
  for (const creature of shown) {
    const label = creature.side === side ? "" : SIDE_LABEL[creature.side];
    side = creature.side;
    rows.push(creatureRow(creature, label, widths));
  }
  const hidden = situation.creatures.length - shown.length;
  if (hidden > 0) rows.push([{ text: `       +${hidden} more · /where`, style: muted }]);
  if (downRow) rows.push([{ text: `Down   ${situation.down.join(", ")}`, style: muted }]);
  return rows;
}

const SIDE_LABEL: Record<SituationCreature["side"], string> = { hostile: "Foes", party: "Party", neutral: "Others" };

/** A party member's name is its handle; a monster's is its kind ("Goblin Warrior"). */
const hasOwnName = (c: SituationCreature) => c.name.toLowerCase() !== c.handle.toLowerCase();

function bar(s: Situation, stale = false): Row {
  const row: Row = [];
  if (s.mode === "explore") {
    const party = s.creatures.filter((c) => c.side === "party");
    row.push({ text: "Explore" });
    if (party.length > 0) row.push({ text: " · party: " }, ...join(party.map((c) => [{ text: `${c.handle} ` }, health(c.health)])));
  } else {
    row.push({ text: `Round ${s.round ?? 1}` });
    if (s.turn === s.me.handle) row.push({ text: " · " }, { text: "▶ your turn", style: { accent: "rust", bold: true } });
    else if (s.turn) row.push({ text: ` · ${s.turn}'s turn` });
    if (s.up_in !== undefined) row.push({ text: ` · you are up in ${s.up_in}` });
    else if (s.next.length > 0) row.push({ text: ` · next ${s.next.slice(0, 3).join(", ")}`, style: muted });
  }
  if (stale) row.push({ text: " · stale", style: muted });
  return row;
}

function meRow(s: Situation): Row {
  const me = s.me;
  const hurt = me.hp * 2 <= me.hp_max;
  const row: Row = [
    { text: `${me.name} `, style: { bold: true } },
    { text: `${me.hp}/${me.hp_max} HP`, ...(hurt ? { style: danger } : {}) },
  ];
  if (me.temp_hp > 0) row.push({ text: ` +${me.temp_hp} temp` });
  if (me.life_state !== "conscious") row.push({ text: " · " }, { text: me.life_state, style: danger });
  for (const condition of me.conditions) row.push({ text: " · " }, { text: condition, style: magic });
  if (me.concentration) row.push({ text: " · " }, { text: `concentrating on ${words(me.concentration)}`, style: magic });
  for (const effect of me.effects.filter((e) => !me.concentration || e.toLowerCase() !== words(me.concentration).toLowerCase())) {
    row.push({ text: " · " }, { text: effect, style: magic });
  }
  return row;
}

function creatureRow(c: SituationCreature, label: string, widths: { handle: number; name: number }): Row {
  const row: Row = [{ text: label.padEnd(7), style: muted }, { text: c.handle.padEnd(widths.handle + 2) }];
  if (widths.name > 0) row.push({ text: (hasOwnName(c) ? c.name : "").padEnd(widths.name + 2), style: muted });
  row.push(health(c.health, 9));
  // Distance keeps its column; conditions go last, where a narrow terminal cuts them first. `down`
  // already says unconscious.
  row.push({ text: `${String(c.distance_ft).padStart(3)} ft` });
  if (c.in_reach) row.push({ text: "  in reach", style: { bold: true } });
  const conditions = c.health === "down" ? c.conditions.filter((condition) => condition !== "unconscious") : c.conditions;
  conditions.forEach((condition, i) => row.push({ text: i === 0 ? "  " : " · " }, { text: condition, style: magic }));
  return row;
}

function health(band: SituationCreature["health"], width = 0): Span {
  // The band's accent from the theme's states (M10 U2); a band the theme doesn't list is danger.
  const accent = band in THEME.states ? THEME.states[band].accent : "rust";
  return { text: band.padEnd(width), ...(accent ? { style: { accent } } : {}) };
}

function join(groups: Span[][]): Span[] {
  return groups.flatMap((group, i) => (i === 0 ? group : [{ text: " · " }, ...group]));
}

/**
 * The turn block: what is left of the turn as the header, then the numbered options, in two
 * columns when they fit.
 */
export function turnRows(lines: string[], size: PanelSize, budget?: TurnBudget, title?: string): Row[] {
  const rows: Row[] = [];
  if (budget) rows.push(budgetRow(budget));
  if (title) rows.push([{ text: `${title}:`, style: { bold: true } }]);
  const half = Math.floor((size.columns - 2) / 2);
  const twoColumns = lines.length > 3 && lines.every((line) => line.length < half - 1);
  if (!twoColumns) return [...rows, ...lines.map((text) => [{ text }])];
  const down = Math.ceil(lines.length / 2);
  for (let i = 0; i < down; i++) {
    const right = lines[i + down];
    rows.push([{ text: right ? lines[i].padEnd(half) : lines[i] }, ...(right ? [{ text: right }] : [])]);
  }
  return rows;
}

function budgetRow(b: TurnBudget): Row {
  const use = (name: string, n: number): Span[] => [{ text: `${name} ` }, n === 0 ? { text: "used", style: muted } : { text: n === 1 ? "free" : `${n} left` }];
  return [
    ...use("Action", b.action),
    { text: " · " },
    ...use("Bonus Action", b.bonus_action),
    { text: " · " },
    ...use("Reaction", b.reaction),
    { text: " · " },
    { text: `${b.movement_ft} of ${b.speed_ft} ft left`, ...(b.movement_ft === 0 ? { style: muted } : {}) },
  ];
}

/** A row as plain text, for tests and the screen-reader view. */
export function rowText(row: Row): string {
  return row.map((span) => span.text).join("").trimEnd();
}

/** Whether a fresh situation ends the human's turn, so a pinned turn block goes. */
export function endsTurn(situation: Situation, human: Handle): boolean {
  return situation.mode !== "combat" || situation.turn !== human;
}
