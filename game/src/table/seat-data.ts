// The data beside the seat's formatted text (AGT-140, Glass Table design §4.3): what a window draws
// roll tokens, the roll stage, the lenses, the sheet and the card from. Every field is copied from a
// view the engine's projection already made for the human's viewer (Rule 3): this module never
// builds a view and never reads the DM's. Names are resolved here, as the seat shows them, so a
// window composes no sentence of its own.
import type { CardPlayer, Event, Handle, PointFt, Sheet, State, WorldPlayer } from "@nat20-table/engine-client";
import type { LegalActionsResult } from "../view.ts";
import type { SeatNames } from "./seat-lines.ts";
import type { TableEvent } from "./types.ts";
import { refusedRu } from "./words.ts";

/** The keys whose values name creatures or ledger holders in an engine event. */
const HANDLE_KEYS = new Set(["actor", "roller", "target", "targets", "participants", "by", "attacker", "creature", "handle", "reactor", "mover", "scout", "waiting_for", "provoked"]);

/** Values under those keys that name no creature: a road card's `target` (who decides). */
const NOT_CREATURES = new Set(["caravan", "blades"]);

/** The seat's name for every creature an event names (its handles under the keys above), by handle. */
export function eventNames(event: Event, names: SeatNames): Record<string, string> {
  const shown: Record<string, string> = {};
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === "string") {
      if (key && HANDLE_KEYS.has(key) && !NOT_CREATURES.has(value)) shown[value] = names.person(value);
    } else if (Array.isArray(value)) {
      for (const v of value) walk(v, key);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(event);
  // A ledger entry's ends are holders (a character, an NPC, a wagon, a market, the world), named as the seat names them.
  if (event.kind === "ledger") for (const holder of [event.from, event.to]) shown[holder] = names.who(holder);
  return shown;
}

/** An option the engine lists as not open now, with why, as the seat says it. */
export interface SeatUnavailable {
  option: string;
  name: string;
  message: string;
}

/** The engine's `unavailable` options of a listing, in the seat's words. */
export function unavailableOf(listed: LegalActionsResult, names: SeatNames): SeatUnavailable[] {
  return (listed.unavailable ?? []).map((u) => ({
    option: u.option_id,
    name: names.option(u.option_id, u.name),
    message: names.language === "en" ? u.message : refusedRu(undefined, u.reason),
  }));
}

/** A limited use on the human's sheet: what is left of it. */
export interface SeatUse {
  id: string;
  name: string;
  remaining: number;
  max: number;
}

/** The human's limited uses and spell slots, from their own sheet. */
export function usesOf(sheet: Sheet, names: SeatNames): SeatUse[] {
  return [
    ...sheet.resources.map((r) => ({ id: r.id, name: names.thing(r.id, r.name), remaining: r.remaining, max: r.max })),
    ...sheet.spell_slots.map((s) => ({ id: `spell_slot_${s.level}`, name: names.language === "en" ? `Level ${s.level} spell slot` : `ячейка круга ${s.level}`, remaining: s.remaining, max: s.max })),
  ];
}

/** The human's own sheet as data (owner view), with the seat's name for each id in it. */
export interface SeatSheet {
  sheet: Sheet;
  shown: Record<string, string>;
}

export function sheetData(sheet: Sheet, names: SeatNames): SeatSheet {
  const shown: Record<string, string> = { [sheet.handle]: names.person(sheet.handle) };
  for (const x of [...sheet.equipment, ...sheet.features, ...sheet.spells, ...sheet.resources, ...sheet.effects]) shown[x.id] = names.thing(x.id, x.name);
  if (sheet.concentration) shown[sheet.concentration.spell] ??= names.thing(sheet.concentration.spell, sheet.concentration.spell);
  return { sheet, shown };
}

/** A road card as the human's own world view has it, in the seat's words. */
export interface SeatCard {
  text: string;
  /** Who decides: the merchant, or the Blades together. */
  target: CardPlayer["target"];
  /** The line that says who decides, as the seat shows it. */
  decides: string;
  choices: Array<{ id: string; text: string }>;
  /** Who said what, in order. */
  said: Array<{ who: Handle; name: string; choice: string; text: string }>;
  /** The own move on the card, when one was made: whose and its words. */
  own_move?: { who: Handle; name: string; words?: string };
  /** Whose word the card still waits for. */
  waiting_for: Array<{ who: Handle; name: string }>;
  /** The line a move that fell left, when one did. */
  fell?: string;
}

/** The card the seat read, in the run's language: its text and each choice's words by id. */
export interface CardWords {
  text?: string;
  choices?: ReadonlyMap<string, string>;
  ownMove?: string;
}

export function cardData(card: CardPlayer, decides: string, names: SeatNames, words: CardWords = {}, fell?: string): SeatCard {
  const choiceText = (id: string) => words.choices?.get(id) ?? card.choices.find((c) => c.id === id)?.text ?? id;
  return {
    text: words.text ?? card.text,
    target: card.target,
    decides,
    choices: card.choices.map((c) => ({ id: c.id, text: choiceText(c.id) })),
    said: card.said.map((s) => ({ who: s.actor, name: names.person(s.actor), choice: s.choice, text: choiceText(s.choice) })),
    ...(card.own_move ? { own_move: { who: card.own_move.actor, name: names.person(card.own_move.actor), ...(words.ownMove ? { words: words.ownMove } : {}) } } : {}),
    waiting_for: card.waiting_for.map((h) => ({ who: h, name: names.person(h) })),
    ...(fell ? { fell } : {}),
  };
}

/** The road as data (the human's world view): where the caravan is, the trip's legs, the roads and places discovered, the contract. */
export interface SeatRoad {
  at: WorldPlayer["at"];
  trip?: NonNullable<WorldPlayer["trip"]>;
  roads: WorldPlayer["roads"];
  places: Array<{ id: string; name: string; kind: string; market: boolean }>;
  /** The escort contract's terms, with the merchant's and the destination's names. */
  contract?: NonNullable<WorldPlayer["escort"]> & { merchant_name: string; destination_name: string; blade_names: Record<Handle, string> };
}

export function roadData(world: WorldPlayer, names: SeatNames): SeatRoad {
  const escort = world.escort ?? undefined;
  return {
    at: world.at,
    ...(world.trip ? { trip: world.trip } : {}),
    roads: world.roads,
    places: world.places.map((p) => ({ id: p.id, name: names.place(p.id, p.name), kind: p.kind, market: p.market })),
    ...(escort
      ? {
          contract: {
            ...escort,
            merchant_name: names.person(escort.merchant),
            destination_name: names.place(escort.destination, world.places.find((p) => p.id === escort.destination)?.name),
            blade_names: Object.fromEntries(escort.blades.map((b) => [b.handle, names.person(b.handle)])),
          },
        }
      : {}),
  };
}

/** Where the human and every creature they perceive stand, and the scene's anchors, from their own state. */
export interface SeatPositions {
  me: PointFt;
  creatures: Record<Handle, PointFt>;
  anchors: Array<{ id: string; name: string; position_ft: PointFt }>;
}

export function positionsOf(state: Extract<State, { view: "player" }>, names: SeatNames): SeatPositions {
  return {
    me: state.me.position_ft,
    creatures: Object.fromEntries(state.others.map((c) => [c.handle, c.position_ft])),
    anchors: state.anchors.map((a) => ({ id: a.id, name: names.anchor(a.id, a.name), position_ft: a.position_ft })),
  };
}

/** The data fields an event carries beside its text (AGT-140), which the human's input record leaves out. */
const DATA_KEYS = ["event", "names", "rolls", "unavailable", "uses", "card", "sheet", "positions", "road", "death_saves"] as const;

/** The event as a terminal reads it: its text, with no data beside it. */
export function textOnly(event: TableEvent): TableEvent {
  if (!DATA_KEYS.some((k) => k in event)) return event;
  const copy: Record<string, unknown> = { ...event };
  for (const k of DATA_KEYS) delete copy[k];
  return copy as TableEvent;
}
