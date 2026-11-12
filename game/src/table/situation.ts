// The situation panel's data (AGT-36, engine/m6/situation-panels-design.md): what the human's
// character perceives, made from the human's own `get_state` and `legal_actions`, both projected
// for the human's viewer (Rule 3). Nothing here comes from the DM's view or the scenario, so the
// panel can't show anything `/where`, `/options` and `/sheet` don't.
import type { Condition, Handle, HealthBand, LifeState, Side, State, WorldPlayer } from "@nat20-table/engine-client";
import { caravanAt, dayLine, mapLines, type LegalActionsResult } from "../view.ts";
import { plural } from "./plural.ts";
import { type SeatNames, WATCH_RU } from "./seat-lines.ts";
import { mapLinesRu } from "./seat-views.ts";

/** Another creature as the panel lists it. */
export interface SituationCreature {
  handle: Handle;
  name: string;
  side: Side;
  health: HealthBand;
  conditions: Condition[];
  distance_ft: number;
  /** The engine's English name, kept for the turn-order glyphs when `name` is the seat's (AGT-98). */
  kind?: string;
  /** One of the human's options can reach it without walking first (the human's turn only). */
  in_reach: boolean;
}

export interface Situation {
  mode: "explore" | "combat";
  round?: number;
  /** Whose turn it is in a fight. */
  turn?: Handle;
  /** The creatures after `turn` in initiative order, without the fallen. */
  next: Handle[];
  /** How many turns until the human's, in a fight while someone else acts. */
  up_in?: number;
  /** The human's own creature (owner view). */
  me: {
    handle: Handle;
    name: string;
    hp: number;
    hp_max: number;
    temp_hp: number;
    conditions: Condition[];
    life_state: LifeState;
    concentration?: string;
    effects: string[];
  };
  /** Every other creature the human perceives that is still standing or is a fallen ally. */
  creatures: SituationCreature[];
  /** Foes and others who are down: listed by handle only. */
  down: Handle[];
  /** In the living world (AGT-79): the day and where the caravan is, for the bar, and the `/map` sketch for the side pane. */
  road?: { where: string; day: string; map: string[]; scout?: string };
  /** At a Russian seat (AGT-98): each creature's name as the panel shows it, by handle («волк 1»). */
  shown?: Record<Handle, string>;
  /** At a Russian seat: the concentration spell's name. */
  concentrationName?: string;
}

const SIDE_ORDER: Record<Side, number> = { hostile: 0, party: 1, neutral: 2 };

/**
 * The panel's data from the human's player-view state. `turn` is whose action prompt is open (the
 * loop's `awaiting`); `options`, the human's own listing on their turn, marks who is in reach.
 */
export function situationOf(state: State, turn: Handle | undefined, options?: LegalActionsResult, names?: SeatNames): Situation | undefined {
  if (state.view !== "player") return undefined;
  const listed = turn === state.me.handle ? options : undefined;
  const reach = new Set(listed?.options.flatMap((o) => o.targets.filter((t) => t.in_range).map((t) => t.handle)) ?? []);
  // A foe or a bystander at 0 Hit Points is out of the fight; a fallen ally is still the party's
  // business (death saves, a potion), so it keeps its row.
  const fallen = (side: Side, health: HealthBand) => health === "down" && side !== "party";
  const creatures = state.others
    .filter((c) => !fallen(c.side, c.health))
    .map((c) => ({
      handle: c.handle,
      name: c.name,
      side: c.side,
      health: c.health,
      conditions: c.conditions,
      distance_ft: Math.round(c.distance_ft),
      in_reach: reach.has(c.handle),
    }))
    .sort((a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side] || a.distance_ft - b.distance_ft || a.handle.localeCompare(b.handle));
  const down = state.others.filter((c) => fallen(c.side, c.health)).map((c) => c.handle);
  const combat = state.mode === "combat";
  const out = new Set(down);
  const order = state.initiative.filter((h) => !out.has(h));
  const at = turn ? order.indexOf(turn) : -1;
  const after = at < 0 ? [] : [...order.slice(at + 1), ...order.slice(0, at)];
  const mine = after.indexOf(state.me.handle);
  const me = state.me;
  const situation: Situation = {
    mode: combat ? "combat" : "explore",
    ...(typeof state.round === "number" && combat ? { round: state.round } : {}),
    ...(combat && turn ? { turn } : {}),
    next: combat ? after : [],
    ...(combat && turn && turn !== me.handle && mine >= 0 ? { up_in: mine + 1 } : {}),
    me: {
      handle: me.handle,
      name: me.name,
      hp: me.hp,
      hp_max: me.hp_max,
      temp_hp: me.temp_hp,
      conditions: me.conditions,
      life_state: me.life_state,
      ...(me.concentration ? { concentration: me.concentration.spell } : {}),
      effects: me.effects.map((e) => e.name),
    },
    creatures,
    down,
    ...(state.world ? { road: roadOf(state.world, me, creatures) } : {}),
  };
  return names?.language === "ru" ? russian(situation, state, names) : situation;
}

/**
 * The same situation at a Russian seat (AGT-98): names as the seat says them, effects and the
 * concentration spell in Russian, and the road's day and place in Russian words.
 */
function russian(situation: Situation, state: Extract<State, { view: "player" }>, names: SeatNames): Situation {
  const handles = [situation.me.handle, ...situation.creatures.map((c) => c.handle), ...situation.down, ...state.initiative];
  const shown = Object.fromEntries(handles.map((h) => [h, names.person(h)]));
  const me = state.me;
  const world = state.world;
  const scout = world?.scout ? (world.scout === me.handle ? "вы идёте впереди" : `${names.person(world.scout)} идёт впереди`) : undefined;
  const day = world ? `День ${world.clock.day}, ${WATCH_RU[world.clock.watch]}` : undefined;
  const at = world ? (world.at.kind === "at" ? names.place(world.at.place) : `в пути, до конца дороги ${plural(world.at.miles_left, "миля", "мили", "миль")}`) : undefined;
  return {
    ...situation,
    shown,
    me: { ...situation.me, name: shown[me.handle]!, effects: me.effects.map((e) => names.thing(e.id, e.name)) },
    creatures: situation.creatures.map((c) => ({ ...c, name: shown[c.handle]!, kind: c.name })),
    ...(me.concentration ? { concentrationName: names.thing(me.concentration.spell, me.concentration.spell) } : {}),
    ...(world && situation.road ? { road: { ...situation.road, where: `${day} · ${at}${scout ? ` · ${scout}` : ""}`, day: day!, map: mapLinesRu(world, names) } } : {}),
  };
}

/**
 * The bar's road: the day, where the caravan is, and who walks ahead as the scout (AGT-90), in
 * English like every panel line: "Day 1, morning · Vale Town · Maren walks ahead".
 */
function roadOf(world: WorldPlayer, me: { handle: Handle }, creatures: SituationCreature[]): NonNullable<Situation["road"]> {
  const scout = world.scout ? (world.scout === me.handle ? "you" : (creatures.find((c) => c.handle === world.scout)?.name ?? world.scout)) : undefined;
  const ahead = scout === undefined ? "" : scout === "you" ? " · you walk ahead" : ` · ${scout} walks ahead`;
  return { where: `${dayLine(world)} · ${caravanAt(world)}${ahead}`, day: dayLine(world), map: mapLines(world, "pane"), ...(scout === undefined ? {} : { scout }) };
}
