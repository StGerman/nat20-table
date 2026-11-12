// The human's numbered decisions (M6 spec §3.3 combat step 2, D5): every number becomes a complete
// command with no model call. Single-target options get one line per hostile target in reach, and a
// follow-up pick for the rest; variants, multi-target and area options open a follow-up pick from
// the option's own list. Built only from the human's own `legal_actions` and state, both already
// projected for the human's viewer.
import type { ActionCost, ActionOption, Aim, Handle, LevelUpChoice, Lodging, MoveTarget, Pace, Side, Skill, State, TargetCandidate, WorldPlayer } from "@nat20-table/engine-client";
import type { LegalActionsResult } from "../view.ts";
import type { DecisionInput } from "./tools.ts";
import { SeatNames } from "./seat-lines.ts";
import { SEAT_WORDS, type SeatWords } from "./words.ts";

/** How the seat words its lines (AGT-98): its strings and its names, in the run's language. */
export interface SeatTalk {
  words: SeatWords;
  names: SeatNames;
}

const ENGLISH: SeatTalk = { words: SEAT_WORDS.en, names: new SeatNames() };

/** What picking a numbered line does. */
export type ChoiceAct =
  | { kind: "submit"; decision: DecisionInput }
  | { kind: "move"; to: MoveTarget }
  /** Dash at this prompt, then walk to `to` on the doubled movement, as far as it goes. */
  | { kind: "dash_move"; to: MoveTarget }
  | { kind: "end_turn" }
  /** Move the caravan on one stretch along its way (AGT-80): the merchant's route, or on along the road. */
  | { kind: "travel"; pace: Pace; to?: string }
  /** End the day at the inn or in camp (AGT-80). */
  | { kind: "rest_night"; where: Lodging }
  /** Walk ahead of the caravan as the scout, for every leg until another Blade does (AGT-90). */
  | { kind: "scout" }
  /** Start the next level, which the sheet says is due (AGT-80). */
  | { kind: "level_up" };

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
export function buildChoices(result: LegalActionsResult, state: State | undefined, combat: boolean, talk: SeatTalk = ENGLISH): Choice[] {
  const about = (option: ActionOption) => aboutOf(option, talk.names);
  const items = result.options.flatMap((option) => optionItems(option, talk).map((item) => tagged(item, about(option))));
  if (combat && state) {
    const moves = moveItems(state, reachOf(result, state), talk);
    const dash = result.options.find((o) => o.option_id === "dash");
    if (moves.length > 0) items.push(tagged({ label: talk.words.moveMenu, next: numbered(moves) }, { id: "move" }, dash ? about(dash) : { id: "dash" }));
  }
  if (combat && result.can_end_turn) items.push({ label: talk.words.endTurn, act: { kind: "end_turn" }, about: { id: "end_turn" } });
  return numbered(items);
}

function aboutOf(option: ActionOption, names: SeatNames): NonNullable<Choice["about"]> {
  // A rule summary the dictionary lacks stays off a Russian seat rather than read in English.
  const summary = names.summary(option.option_id, names.language === "ru" ? undefined : (option.summary ?? undefined));
  return { id: option.option_id, cost: option.cost, ...(summary ? { summary } : {}) };
}

/** An item and the follow-up picks under it, marked with the option they play. A Dash-and-move line plays Dash. */
function tagged<T extends Item | Choice>(item: T, about: NonNullable<Choice["about"]>, dash: NonNullable<Choice["about"]> = { id: "dash" }): T {
  const own = item.act?.kind === "dash_move" ? dash : about;
  return { ...item, about: own, ...(item.next ? { next: item.next.map((c) => tagged(c, about, dash)) } : {}) };
}

/**
 * The road's own lines after the human's options (AGT-80), when the human may drive the caravan
 * and no card waits: move on, make camp, and take rooms where there is an inn. Numbered from
 * `first`. With an NPC owner, or on the road, moving on goes the caravan's own way; a human who
 * owns the caravan picks a road out of the place it is in, one line per road.
 *
 * The engine's miles left today decide which paces show: no line moves on once the day's travel is
 * spent (the caravan goes on after the night), and while some is left a fast line joins the normal
 * one when the next stop is out of reach today at a normal pace but within it at a fast one, on a
 * road that allows it.
 */
export function roadChoices(world: WorldPlayer, first: number, human?: Handle, talk: SeatTalk = ENGLISH): Choice[] {
  const w = talk.words;
  // Once the contract is done the journey is over: the caravan goes nowhere more this run (B7).
  if (!world.drives || world.card || world.escort?.done) return [];
  // A Hired Blade may walk ahead as the scout (AGT-90): one line for the road, not one per leg,
  // gone once the human is the scout.
  const scouts = human !== undefined && world.scout !== human && (world.escort?.blades.some((b) => b.handle === human) ?? false);
  const at = world.at.kind === "at" ? world.at.place : undefined;
  const here = at === undefined ? undefined : world.places.find((p) => p.id === at);
  const placeName = new Map(world.places.map((p) => [p.id, talk.names.language === "en" ? p.name : talk.names.place(p.id)]));
  const owns = !world.caravan.owner.includes(":");
  // Absent only in a hand-built view; the engine always sends it.
  const today = world.today as WorldPlayer["today"] | undefined;
  const normal = today === undefined || today.normal > 0;
  const fastToday = (miles: number, maxPace: string | undefined): boolean =>
    today !== undefined && today.normal > 0 && maxPace === "fast" && miles > today.normal && miles <= today.fast;
  const allRoads: Array<{ id: string; max_pace?: string }> = [...world.roads, ...world.unexplored];
  const paceOf = (road: string) => allRoads.find((r) => r.id === road)?.max_pace;
  const otherEnd = (road: string, from: string): string | undefined => {
    const r = world.roads.find((r) => r.id === road);
    return r === undefined ? undefined : r.from === from ? r.to : r.from;
  };
  const travel = (pace: Pace, to?: string): ChoiceAct => ({ kind: "travel", pace, ...(to === undefined ? {} : { to }) });
  const moves: Item[] = [];
  if (owns && at !== undefined) {
    for (const r of world.roads.filter((r) => r.from === at || r.to === at)) {
      const end = placeName.get(r.from === at ? r.to : r.from) ?? (r.from === at ? r.to : r.from);
      if (normal) moves.push({ label: w.takeRoad(end, r.miles), act: travel("normal", r.id), about: { id: "travel" } });
      if (fastToday(r.miles, r.max_pace)) moves.push({ label: w.takeRoadFast(end, r.miles), act: travel("fast", r.id), about: { id: "travel" } });
    }
    for (const r of world.unexplored.filter((r) => r.from === at)) {
      if (normal) moves.push({ label: w.unexplored(r.miles), act: travel("normal", r.id), about: { id: "travel" } });
      if (fastToday(r.miles, r.max_pace)) moves.push({ label: w.unexploredFast(r.miles), act: travel("fast", r.id), about: { id: "travel" } });
    }
  } else {
    if (normal) moves.push({ label: w.moveOn, act: travel("normal"), about: { id: "travel" } });
    // The next stretch: the rest of this road, or the merchant's next leg.
    const next =
      world.at.kind === "on_road"
        ? { miles: world.at.miles_left, road: world.at.road, to: otherEnd(world.at.road, world.at.came_from) }
        : world.trip?.legs[0] && { miles: world.trip.legs[0].miles, road: world.trip.legs[0].road, to: world.trip.legs[0].to };
    if (next && fastToday(next.miles, paceOf(next.road))) {
      const where = next.to === undefined ? undefined : placeName.get(next.to);
      moves.push({ label: w.pushOn(where), act: travel("fast"), about: { id: "travel" } });
    }
  }
  const items: Item[] = [
    ...moves,
    { label: w.makeCamp, act: { kind: "rest_night", where: "camp" }, about: { id: "rest_night" } },
    ...(typeof here?.inn_cp === "number" ? [{ label: w.takeRooms, act: { kind: "rest_night", where: "inn" } as ChoiceAct, about: { id: "rest_night" } }] : []),
    ...(scouts ? [{ label: w.scout, act: { kind: "scout" } as ChoiceAct, about: { id: "scout" } }] : []),
  ];
  return items.map((item, i) => ({ number: first + i, ...item }));
}

/** A road card as `cardChoices` reads it: the player's own view or the DM's. */
export interface CardSeen {
  choices: Array<{ id: string; text: string }>;
  said: Array<{ actor: Handle; choice: string }>;
  own_move?: { actor: Handle; skill: Skill } | null;
}

/**
 * A road card as the human's numbered choices (AGT-80): one per choice, an own move (API-56) in the
 * words its player said, with its skill. `preset` is the choice most of the others gave (the first
 * of them on a tie), or the first choice: the loop's fallbacks go with it. The human's card takes
 * no Enter (AGT-101, Stas 2026-11-11): the others' choice is named, never preset.
 */
export function cardChoices(card: CardSeen, words: SeatWords = SEAT_WORDS.en, me?: Handle, names: SeatNames = ENGLISH.names): { choices: Choice[]; preset: number } {
  const count = new Map<string, number>();
  for (const s of card.said) count.set(s.choice, (count.get(s.choice) ?? 0) + 1);
  let top: string | undefined;
  for (const s of card.said) if (top === undefined || (count.get(s.choice) ?? 0) > (count.get(top) ?? 0)) top = s.choice;
  const move = card.own_move ?? undefined;
  const text = (c: { id: string; text: string }) =>
    c.id === OWN_MOVE && move ? words.ownMoveChoice(move.actor === me, names.language === "en" ? capitalized(move.actor) : names.person(move.actor), c.text, move.skill) : c.text;
  const choices = card.choices.map((c, i) => ({ number: i + 1, label: c.id === top ? `${text(c)} ${words.othersChoice}` : text(c), about: { id: c.id } }));
  const at = card.choices.findIndex((c) => c.id === top) + 1;
  return { choices, preset: at || 1 };
}

/** The choice id an own move takes on a card (API-56). */
export const OWN_MOVE = "own_move";

function capitalized(handle: Handle): string {
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

/**
 * A level-up choice as the human's numbered lines (AGT-80, design: level-up in plain words): first
 * the recommended pick in one line, which Enter takes, then each option with its plain summary.
 * `picked` are the ids already chosen when the choice wants more than one.
 */
export function levelUpChoices(choice: LevelUpChoice, picked: readonly string[] = [], talk: SeatTalk = ENGLISH): Choice[] {
  const name = new Map(choice.options.map((o) => [o.id, talk.names.thing(o.id, o.name)]));
  // A level-up rule summary the dictionary lacks stays off a Russian seat rather than read in English.
  const summary = (id: string, english: string | null | undefined) => (talk.names.language === "ru" ? talk.names.summary(id, undefined) : (english ?? undefined));
  const recommended = choice.recommended.map((id) => name.get(id) ?? id).join(", ");
  return [
    { number: 1, label: talk.words.recommended(recommended), about: { id: "recommended" } },
    ...choice.options
      .filter((o) => !picked.includes(o.id))
      .map((o, i) => ({ number: i + 2, label: `${name.get(o.id)}${summary(o.id, o.summary) ? `: ${summary(o.id, o.summary)}` : ""}`, about: { id: o.id } })),
  ];
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
function targetLabel(t: TargetCandidate, talk: SeatTalk): string {
  return `${talk.names.who(t.handle)}${t.in_range ? "" : talk.words.walk}`;
}

function targetItems(option: ActionOption, targets: TargetCandidate[], talk: SeatTalk, variant?: string, name = talk.names.option(option.option_id, option.name)): Item[] {
  return targets.map((t) => ({
    label: `${name} → ${targetLabel(t, talk)}`,
    act: submit(option, [t.handle], variant),
    target: { handle: t.handle, side: t.side, in_range: t.in_range },
  }));
}

function optionItems(option: ActionOption, talk: SeatTalk): Item[] {
  const name = talk.names.option(option.option_id, option.name);
  const variantName = (v: { variant: string; name: string }) => talk.names.variant(v.variant, v.name);
  const targets = byDistance(option.targets);
  switch (option.targeting) {
    case "none":
    case "self":
      return option.variants.length > 0
        ? option.variants.map((v) => ({ label: `${name}: ${variantName(v)}`, act: submit(option, [], v.variant) }))
        : [{ label: name, act: submit(option) }];
    case "single": {
      if (targets.length === 0) return [];
      if (option.variants.length > 0) {
        const variants = option.variants.map((v) => ({
          label: `${name}: ${variantName(v)}…`,
          next: numbered(targetItems(option, targets, talk, v.variant)),
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
      const lines = targetItems(option, quick, talk);
      if (rest.length > 0) lines.push({ label: `${name}${quick.length > 0 ? talk.words.anotherTarget : ""}…`, next: numbered(targetItems(option, rest, talk)) });
      return lines;
    }
    case "multiple": {
      if (targets.length === 0) return [];
      const spread = targets.filter((t) => t.in_range).slice(0, option.max_targets);
      const lines: Item[] = [];
      if (spread.length > 1) {
        lines.push({ label: `${name} → ${talk.names.list(spread.map((t) => t.handle))}`, act: submit(option, spread.map((t) => t.handle)) });
      }
      lines.push(...targetItems(option, targets, talk));
      return [{ label: `${name}…`, next: numbered(lines) }];
    }
    case "area": {
      const aims = option.area?.aims ?? [];
      if (aims.length === 0) return [];
      const lines = aims.map((a) => ({ label: talk.words.aimAt(name, aimLabel(a.aim, talk.names), talk.names.list(a.catches)), act: submit(option, [], undefined, a.aim) }));
      return [{ label: `${name}…`, next: numbered(lines) }];
    }
    case "point":
      // No option aims at a bare point yet (protocol §4.4); the DM maps one from words.
      return [];
  }
}

function aimLabel(aim: Aim, names: SeatNames): string {
  switch (aim.kind) {
    case "creature":
      return names.who(aim.handle);
    case "anchor":
      return names.anchor(aim.anchor, aim.anchor);
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
function moveItems(state: State, reach: Reach | undefined, talk: SeatTalk): Item[] {
  const w = talk.words;
  if (state.view !== "player") return [];
  const sides: Side[] = ["hostile", "neutral", "party"];
  const creatures = state.others
    .filter((c) => c.health !== "down")
    .sort((a, b) => sides.indexOf(a.side) - sides.indexOf(b.side) || a.distance_ft - b.distance_ft || a.handle.localeCompare(b.handle))
    .flatMap((c) =>
      walkItems(w.nextTo(talk.names.who(c.handle)), `${w.side[c.side]}, ${w.feet(Math.round(c.distance_ft))}`, Math.max(0, c.distance_ft - 5), { kind: "creature", handle: c.handle }, reach, w, {
        handle: c.handle,
        side: c.side,
        in_range: false,
      }),
    );
  const places = [...state.anchors]
    .sort((a, b) => a.distance_ft - b.distance_ft || a.id.localeCompare(b.id))
    .flatMap((a) => walkItems(w.toPlace(talk.names.anchor(a.id, a.name)), w.feet(Math.round(a.distance_ft)), a.distance_ft, { kind: "anchor", anchor: a.id }, reach, w));
  return [...creatures, ...places];
}

/** The line to walk somewhere, and the line to Dash and walk there when only a Dash reaches it. */
function walkItems(where: string, about: string, need_ft: number, to: MoveTarget, reach: Reach | undefined, words: SeatWords, target?: Choice["target"]): Item[] {
  const short = reach !== undefined && need_ft > reach.movement_ft;
  const move: Item = {
    label: words.move(where, `${about}${short ? words.stopsShort(reach.movement_ft) : ""}`),
    act: { kind: "move", to },
    ...(target ? { target } : {}),
  };
  if (!short || reach.dash_ft === undefined || need_ft > reach.movement_ft + reach.dash_ft) return [move];
  return [move, { label: words.dashMove(where, about), act: { kind: "dash_move", to } }];
}
