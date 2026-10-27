// The human's numbered decisions (M6 spec §3.3 combat step 2, D5): every number becomes a complete
// command with no model call. Single-target options get one line per hostile target in reach, and a
// follow-up pick for the rest; variants, multi-target and area options open a follow-up pick from
// the option's own list. Built only from the human's own `legal_actions` and state, both already
// projected for the human's viewer.
import type { ActionOption, Aim, Handle, MoveTarget, Side, State, TargetCandidate } from "@nat20-table/engine-client";
import type { LegalActionsResult } from "../view.ts";
import type { DecisionInput } from "./tools.ts";

/** What picking a numbered line does. */
export type ChoiceAct =
  | { kind: "submit"; decision: DecisionInput }
  | { kind: "move"; to: MoveTarget }
  | { kind: "end_turn" };

export interface Choice {
  number: number;
  label: string;
  /** The command it sends; absent when it opens a follow-up pick. */
  act?: ChoiceAct;
  /** The follow-up pick it opens: the option's targets, variants or aims. */
  next?: Choice[];
  /** The creature it is aimed at, for a seat that picks by rule (the scripted seats). */
  target?: { handle: Handle; side: Side; in_range: boolean };
}

type Item = Omit<Choice, "number">;

/**
 * The numbered list for the human's options. In a fight it ends with a move pick (anchors and the
 * creatures the human can see) and End turn; out of combat moving is the DM's call, made in words.
 */
export function buildChoices(result: LegalActionsResult, state: State | undefined, combat: boolean): Choice[] {
  const items = result.options.flatMap(optionItems);
  if (combat && state) {
    const moves = moveItems(state);
    if (moves.length > 0) items.push({ label: "Move…", next: numbered(moves) });
  }
  if (combat && result.can_end_turn) items.push({ label: "End turn", act: { kind: "end_turn" } });
  return numbered(items);
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

function targetLabel(t: TargetCandidate): string {
  return `${t.handle} (${t.side}, ${Math.round(t.distance_ft)} ft${t.in_range ? "" : ", walks first"})`;
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
      // Hostile targets in reach get their own lines; with none in reach, the nearest hostile does.
      const hostile = targets.filter((t) => t.side === "hostile");
      const inReach = hostile.filter((t) => t.in_range);
      const quick = inReach.length > 0 ? inReach : hostile.slice(0, 1);
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

/** Where the human can walk: next to a creature it can see (hostile first), or to a place. */
function moveItems(state: State): Item[] {
  if (state.view !== "player") return [];
  const sides: Side[] = ["hostile", "neutral", "party"];
  const creatures = state.others
    .filter((c) => c.health !== "down")
    .sort((a, b) => sides.indexOf(a.side) - sides.indexOf(b.side) || a.distance_ft - b.distance_ft || a.handle.localeCompare(b.handle))
    .map((c) => ({
      label: `Move next to ${c.handle} (${c.side}, ${Math.round(c.distance_ft)} ft)`,
      act: { kind: "move", to: { kind: "creature", handle: c.handle } } as ChoiceAct,
      target: { handle: c.handle, side: c.side, in_range: false },
    }));
  const places = [...state.anchors]
    .sort((a, b) => a.distance_ft - b.distance_ft || a.id.localeCompare(b.id))
    .map((a) => ({ label: `Move to ${a.name} (${Math.round(a.distance_ft)} ft)`, act: { kind: "move", to: { kind: "anchor", anchor: a.id } } as ChoiceAct }));
  return [...creatures, ...places];
}
