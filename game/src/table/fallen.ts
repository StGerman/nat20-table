// Fallen allies in a fight, for the run report (hands-and-check spec A3-M, TASKS.md AGT-57). Pure
// functions: whether an AI player's combat turn began with a fallen ally it could lift, and whether
// it did. The report counts the chances and names every one missed; nothing here steers play.
import type { ActionOption, Event, Handle, LifeState, TurnBudget } from "@nat20-table/engine-client";

/** The pregens' spells that heal the creature they target. Spare the Dying only stabilises. */
const HEALING_SPELLS = new Set(["cure_wounds", "healing_word"]);

/** Whether an option heals the creature it targets: a Potion of Healing, Divine Spark's heal, or a healing spell. */
export function lifts(option: ActionOption): boolean {
  if (option.option_id.startsWith("use/potion_of_healing")) return true;
  if (option.option_id === "cleric/divine_spark") return option.variants.some((v) => v.variant === "divine_spark/heal");
  return option.spell !== undefined && option.spell !== null && HEALING_SPELLS.has(option.spell.id);
}

/** A lift an AI player could take on its turn: an option aimed at a fallen ally. */
export interface Lift {
  ally: Handle;
  option_id: string;
  distance_ft: number;
}

/** An AI player's combat turn that began with a fallen ally it could lift (spec A3-M). */
export interface LiftChance {
  handle: Handle;
  /** When the turn began. */
  at: string;
  /** The scene being played. */
  scene: string;
  /** Its allies at 0 Hit Points and not dead when the turn began. */
  fallen: Handle[];
  /** Every lift it could reach this turn. */
  lifts: Lift[];
  /** The fallen allies it healed in the turn. */
  lifted: Handle[];
  /** What it did in the turn, from the engine's `action` events: the option names with their targets. */
  did: string[];
}

/** An ally at 0 Hit Points who isn't dead: unconscious, or stable. */
export function isFallen(life: LifeState): boolean {
  return life === "unconscious" || life === "stable";
}

/**
 * The lifts in `options` aimed at a creature in `fallen` that the actor can reach this turn: in range
 * now, or after a straight walk with the movement it has left. A target out of range with no
 * `range_ft` counts as touch, 5 ft.
 */
export function liftsOn(options: readonly ActionOption[], fallen: readonly Handle[], budget?: TurnBudget | null): Lift[] {
  const walk = budget?.movement_ft ?? 0;
  return options.filter(lifts).flatMap((option) =>
    option.targets
      .filter((t) => fallen.includes(t.handle) && (t.in_range || t.distance_ft - (option.range_ft ?? 5) <= walk))
      .map((t) => ({ ally: t.handle, option_id: option.option_id, distance_ft: Math.round(t.distance_ft) })),
  );
}

/**
 * What `handle` did with a lift chance in its turn's `events`, read up to its own `turn_end`: the
 * fallen allies healed, and its actions. Only the actor acts in its own turn, so a `healed` event
 * on a fallen ally there is its lift.
 */
export function turnOutcome(events: readonly Event[], handle: Handle, fallen: readonly Handle[]): Pick<LiftChance, "lifted" | "did"> {
  const lifted: Handle[] = [];
  const did: string[] = [];
  for (const event of events) {
    if (event.kind === "turn_end" && event.actor === handle) break;
    if (event.kind === "healed" && fallen.includes(event.target) && !lifted.includes(event.target)) lifted.push(event.target);
    if (event.kind === "action" && event.actor === handle) did.push(event.targets.length > 0 ? `${event.name} on ${event.targets.join(", ")}` : event.name);
  }
  return { lifted, did };
}
