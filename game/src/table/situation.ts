// The situation panel's data (AGT-35, engine/m6/situation-panels-design.md): what the human's
// character perceives, made from the human's own `get_state` and `legal_actions`, both projected
// for the human's viewer (Rule 3). Nothing here comes from the DM's view or the scenario, so the
// panel can't show anything `/where`, `/options` and `/sheet` don't.
import type { Condition, Handle, HealthBand, LifeState, Side, State } from "@nat20-table/engine-client";
import type { LegalActionsResult } from "../view.ts";

/** Another creature as the panel lists it. */
export interface SituationCreature {
  handle: Handle;
  name: string;
  side: Side;
  health: HealthBand;
  conditions: Condition[];
  distance_ft: number;
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
}

const SIDE_ORDER: Record<Side, number> = { hostile: 0, party: 1, neutral: 2 };

/**
 * The panel's data from the human's player-view state. `turn` is whose action prompt is open (the
 * loop's `awaiting`); `options`, the human's own listing on their turn, marks who is in reach.
 */
export function situationOf(state: State, turn: Handle | undefined, options?: LegalActionsResult): Situation | undefined {
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
  return {
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
  };
}
