// The human's numbered decisions (M6 spec §3.3 combat step 2, D5): every number becomes a complete
// command with no model call. Single-target options get one line per hostile target in reach, and a
// follow-up pick for the rest; variants, multi-target and area options open a follow-up pick from
// the option's own list. Built only from the human's own `legal_actions` and state, both already
// projected for the human's viewer.
import type { ActionCost, ActionOption, Aim, Handle, Lodging, MoveTarget, Pace, Side, State, TargetCandidate, WorldPlayer } from "@nat20-table/engine-client";
import type { LegalActionsResult } from "../view.ts";
import type { DecisionInput } from "./tools.ts";

/** What picking a numbered line does. */
export type ChoiceAct =
  | { kind: "submit"; decision: DecisionInput }
  | { kind: "move"; to: MoveTarget }
  /** Dash at this prompt, then walk to `to` on the doubled movement, as far as it goes. */
  | { kind: "dash_move"; to: MoveTarget }
  | { kind: "end_turn" }
  /** Move the caravan on one stretch along its way (AGT-80): the merchant's route, or on along the road. */
  | { kind: "travel"; pace: Pace }
  /** End the day at the inn or in camp (AGT-80). */
  | { kind: "rest_night"; where: Lodging };

export interface Choice {
  number: number;
  label: string;
  /** The command it sends; absent when it opens a follow-up pick. */
  act?: ChoiceAct;
  /** The follow-up pick it opens: the option's targets, variants or aims. */
  next?: Choice[];
  /** The creature it is aimed at, for a seat that picks by rule (the scripted seats). */
  target?: { handle: Handle; side: Side; in_range: boolean };
  /**
   * The option it plays, for the seat's action card (AGT-70): its id, or `move` and `end_turn`,
   * what it costs, and the rule's own `summary` from the engine when it has one.
   */
  about?: { id: string; cost?: ActionCost; summary?: string };
}

type Item = Omit<Choice, "number">;

/**
 * The numbered list for the human's options. In a fight it ends with a move pick (anchors and the
 * creatures the human can see) and End turn; out of combat moving is the DM's call, made in words.
 */
export function buildChoices(result: LegalActionsResult, state: State | undefined, combat: boolean): Choice[] {
  const items = result.options.flatMap((option) => optionItems(option).map((item) => tagged(item, aboutOf(option))));
  if (combat && state) {
    const moves = moveItems(state, reachOf(result, state));
    const dash = result.options.find((o) => o.option_id === "dash");
    if (moves.length > 0) items.push(tagged({ label: "Move…", next: numbered(moves) }, { id: "move" }, dash ? aboutOf(dash) : { id: "dash" }));
  }
  if (combat && result.can_end_turn) items.push({ label: "End turn", act: { kind: "end_turn" }, about: { id: "end_turn" } });
  return numbered(items);
}

function aboutOf(option: ActionOption): NonNullable<Choice["about"]> {
  return { id: option.option_id, cost: option.cost, ...(option.summary ? { summary: option.summary } : {}) };
}

/** An item and the follow-up picks under it, marked with the option they play. A Dash-and-move line plays Dash. */
function tagged<T extends Item | Choice>(item: T, about: NonNullable<Choice["about"]>, dash: NonNullable<Choice["about"]> = { id: "dash" }): T {
  const own = item.act?.kind === "dash_move" ? dash : about;
  return { ...item, about: own, ...(item.next ? { next: item.next.map((c) => tagged(c, about, dash)) } : {}) };
}

/**
 * The road's own lines after the human's options (AGT-80), when the human may drive the caravan
 * and no card waits: move on, make camp, and take rooms where there is an inn. Numbered from
 * `first`. Moving on goes the caravan's own way; a road or place to pick is for the merchant's
 * seat, later.
 */
export function roadChoices(world: WorldPlayer, first: number): Choice[] {
  if (!world.drives || world.card) return [];
  const here = world.at.kind === "at" ? world.places.find((p) => p.id === (world.at as { place: string }).place) : undefined;
  const items: Item[] = [
    { label: "Move on with the caravan", act: { kind: "travel", pace: "normal" }, about: { id: "travel" } },
    { label: "Make camp for the night", act: { kind: "rest_night", where: "camp" }, about: { id: "rest_night" } },
    ...(typeof here?.inn_cp === "number" ? [{ label: `Take rooms at the inn for the night`, act: { kind: "rest_night", where: "inn" } as ChoiceAct, about: { id: "rest_night" } }] : []),
  ];
  return items.map((item, i) => ({ number: first + i, ...item }));
}

/**
 * A road card as the human's numbered choices (AGT-80): one per choice, and `preset` the one Enter
 * takes, the choice most of the others gave (the first of them on a tie), or the first choice.
 */
export function cardChoices(card: { choices: Array<{ id: string; text: string }>; said: Array<{ actor: Handle; choice: string }> }): { choices: Choice[]; preset: number } {
  const count = new Map<string, number>();
  for (const s of card.said) count.set(s.choice, (count.get(s.choice) ?? 0) + 1);
  let top: string | undefined;
  for (const s of card.said) if (top === undefined || (count.get(s.choice) ?? 0) > (count.get(top) ?? 0)) top = s.choice;
  const choices = card.choices.map((c, i) => ({ number: i + 1, label: c.id === top ? `${c.text} (the others' choice)` : c.text, about: { id: c.id } }));
  return { choices, preset: (card.choices.findIndex((c) => c.id === top) + 1) || 1 };
}

/** One line per choice, as the human reads them. */
export function choiceLines(choices: Choice[]): string[] {
  return choices.map((c) => `${c.number}. ${c.label}`);
}

function numbered(items: Item[]): Choice[] {
  return items.map((item, i) => ({ number: i + 1, ...item }));
}

function submit(option: ActionOption, targets: Handle[] = [], variant?: string, aim?: Aim): ChoiceAct {
  return {
    kind: "submit",
    decision: {
      option_id: option.option_id,
      ...(targets.length > 0 ? { targets } : {}),
      ...(variant ? { variant } : {}),
      ...(aim ? { aim } : {}),
    },
  };
}

function byDistance(targets: TargetCandidate[]): TargetCandidate[] {
  return [...targets].sort((a, b) => a.distance_ft - b.distance_ft || a.handle.localeCompare(b.handle));
}

/**
 * A target as an option names it (AGT-47 C3): its handle, and `(walk)` when the human walks to it
 * first. The side and the feet are the panel's, said once there.
 */
function targetLabel(t: TargetCandidate): string {
  return `${t.handle}${t.in_range ? "" : " (walk)"}`;
}

function targetItems(option: ActionOption, targets: TargetCandidate[], variant?: string): Item[] {
  return targets.map((t) => ({
    label: `${option.name} → ${targetLabel(t)}`,
    act: submit(option, [t.handle], variant),
    target: { handle: t.handle, side: t.side, in_range: t.in_range },
  }));
}

function optionItems(option: ActionOption): Item[] {
  const name = option.name;
  const targets = byDistance(option.targets);
  switch (option.targeting) {
    case "none":
    case "self":
      return option.variants.length > 0
        ? option.variants.map((v) => ({ label: `${name}: ${v.name}`, act: submit(option, [], v.variant) }))
        : [{ label: name, act: submit(option) }];
    case "single": {
      if (targets.length === 0) return [];
      if (option.variants.length > 0) {
        const variants = option.variants.map((v) => ({
          label: `${name}: ${v.name}…`,
          next: numbered(targetItems(option, targets, v.variant)),
        }));
        return [{ label: `${name}…`, next: numbered(variants) }];
      }
      // An attack (or Help with one) whose only targets this turn are the party is left out:
      // picking it opened a list of friends when no foe was in reach (TASKS.md AGT-28). Words to
      // the DM still reach it. Options meant for friends, such as Help Stabilize, stay.
      if (/attack/.test(option.option_id) && targets.every((t) => t.side === "party")) return [];
      // Hostile targets in reach get their own lines; with none in reach, the nearest hostile does.
      // A potion is for a friend, so it lists the creatures on no hostile side instead (you first).
      const wanted = targets.filter((t) => (option.item ? t.side !== "hostile" : t.side === "hostile"));
      const inReach = wanted.filter((t) => t.in_range);
      const quick = inReach.length > 0 ? inReach : wanted.slice(0, 1);
      const rest = targets.filter((t) => !quick.includes(t));
      const lines = targetItems(option, quick);
      if (rest.length > 0) lines.push({ label: `${name}${quick.length > 0 ? ", another target" : ""}…`, next: numbered(targetItems(option, rest)) });
      return lines;
    }
    case "multiple": {
      if (targets.length === 0) return [];
      const spread = targets.filter((t) => t.in_range).slice(0, option.max_targets);
      const lines: Item[] = [];
      if (spread.length > 1) {
        lines.push({ label: `${name} → ${spread.map((t) => t.handle).join(", ")}`, act: submit(option, spread.map((t) => t.handle)) });
      }
      lines.push(...targetItems(option, targets));
      return [{ label: `${name}…`, next: numbered(lines) }];
    }
    case "area": {
      const aims = option.area?.aims ?? [];
      if (aims.length === 0) return [];
      const lines = aims.map((a) => ({ label: `${name} at ${aimLabel(a.aim)}: catches ${a.catches.join(", ")}`, act: submit(option, [], undefined, a.aim) }));
      return [{ label: `${name}…`, next: numbered(lines) }];
    }
    case "point":
      // No option aims at a bare point yet (protocol §4.4); the DM maps one from words.
      return [];
  }
}

function aimLabel(aim: Aim): string {
  switch (aim.kind) {
    case "creature":
      return aim.handle;
    case "anchor":
      return aim.anchor;
    case "point":
      return `(${Math.round(aim.point.x_ft)}, ${Math.round(aim.point.y_ft)})`;
  }
}

/** How far the human can walk this turn, and how much farther a Dash at this prompt would take them. */
interface Reach {
  movement_ft: number;
  dash_ft?: number;
}

function reachOf(result: LegalActionsResult, state: State): Reach | undefined {
  const budget = result.budget;
  if (!budget || state.view !== "player") return undefined;
  // A Dash adds the creature's Speed again (SRD 5.2.1, Dash), and each Dash this turn adds it once
  // more (core counts every Dash instance), so `me.speed_ft` is the Speed times one plus the Dashes.
  const dashes = state.me.effects.filter((e) => e.id === "dash").length;
  const dash = result.options.some((o) => o.option_id === "dash");
  const speed = Math.round(state.me.speed_ft / (1 + dashes));
  return { movement_ft: budget.movement_ft, ...(dash ? { dash_ft: speed } : {}) };
}

/**
 * Where the human can walk: next to a creature it can see (hostile first), or to a place. A
 * destination farther than this turn's movement says so, since the walk stops short, and when a
 * Dash would get there a line to Dash and walk follows it. Distances are straight lines and "next
 * to" means 5 ft away, so a crooked route can still stop short; the engine walks it as far as it goes.
 */
function moveItems(state: State, reach: Reach | undefined): Item[] {
  if (state.view !== "player") return [];
  const sides: Side[] = ["hostile", "neutral", "party"];
  const creatures = state.others
    .filter((c) => c.health !== "down")
    .sort((a, b) => sides.indexOf(a.side) - sides.indexOf(b.side) || a.distance_ft - b.distance_ft || a.handle.localeCompare(b.handle))
    .flatMap((c) =>
      walkItems(`next to ${c.handle}`, `${c.side}, ${Math.round(c.distance_ft)} ft`, Math.max(0, c.distance_ft - 5), { kind: "creature", handle: c.handle }, reach, {
        handle: c.handle,
        side: c.side,
        in_range: false,
      }),
    );
  const places = [...state.anchors]
    .sort((a, b) => a.distance_ft - b.distance_ft || a.id.localeCompare(b.id))
    .flatMap((a) => walkItems(`to ${a.name}`, `${Math.round(a.distance_ft)} ft`, a.distance_ft, { kind: "anchor", anchor: a.id }, reach));
  return [...creatures, ...places];
}

/** The line to walk somewhere, and the line to Dash and walk there when only a Dash reaches it. */
function walkItems(where: string, about: string, need_ft: number, to: MoveTarget, reach: Reach | undefined, target?: Choice["target"]): Item[] {
  const short = reach !== undefined && need_ft > reach.movement_ft;
  const move: Item = {
    label: `Move ${where} (${about}${short ? `; ${reach.movement_ft} ft this turn, stops short` : ""})`,
    act: { kind: "move", to },
    ...(target ? { target } : {}),
  };
  if (!short || reach.dash_ft === undefined || need_ft > reach.movement_ft + reach.dash_ft) return [move];
  return [move, { label: `Dash, then move ${where} (${about})`, act: { kind: "dash_move", to } }];
}
