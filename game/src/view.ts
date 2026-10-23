// Compact text an agent reads, made from engine responses that were already projected for that
// agent's viewer (Rule 3: projection happens in the engine; this file only formats). Text instead
// of raw JSON keeps every turn's input small, which is most of the latency and cost (M6 spec §7).
import type { ActionOption, CommandResult, Sheet, State } from "@nat20-table/engine-client";

/** The result of `legal_actions`. */
export type LegalActionsResult = Extract<CommandResult, { cmd: "legal_actions" }>;
type Option = ActionOption;

/** One line per option: id, name, cost, and its targets with distance and reach. */
export function formatOptions(result: LegalActionsResult): string {
  const lines = result.options.map((option) => formatOption(option));
  if (result.can_end_turn) lines.push("- end_turn: end your turn");
  return lines.join("\n");
}

function formatOption(option: Option): string {
  const cost = Object.entries(option.cost)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([key, value]) => (key === "movement_ft" ? `${value} ft` : key.replace("_", " ")))
    .join(", ");
  const parts = [`- ${option.option_id}: ${option.name}${cost ? ` (${cost})` : ""}`];
  if (option.targeting === "area" && option.area) {
    parts.push(`area ${option.area.shape} ${option.area.size_ft} ft; aim at a creature or anchor`);
  } else if (option.targets.length > 0) {
    const most = option.max_targets > 1 ? `up to ${option.max_targets}: ` : "";
    const targets = option.targets
      .map((t) => `${t.handle} ${Math.round(t.distance_ft)} ft${t.in_range ? "" : " (walks first)"}`)
      .join(", ");
    parts.push(`targets ${most}${targets}`);
  }
  if (option.variants.length > 0) {
    parts.push(`variant one of ${option.variants.map((v) => v.variant).join(", ")}`);
  }
  return parts.join("; ");
}

/** What the viewer perceives: round, anchors and creatures with distance and health band. */
export function formatState(state: State): string {
  const lines: string[] = [];
  lines.push(`Scene ${state.scene_id ?? "none"}, ${state.mode}${state.round ? `, round ${state.round}` : ""}.`);
  if (state.view === "player" && state.me) {
    lines.push(`You: ${state.me.name} (${state.me.handle}), ${state.me.hp}/${state.me.hp_max} HP, ${state.me.life_state}.`);
  }
  const others = state.view === "player" ? state.others : state.creatures;
  for (const creature of others) {
    const distance = "distance_ft" in creature && typeof creature.distance_ft === "number"
      ? `, ${Math.round(creature.distance_ft)} ft away`
      : "";
    const conditions = creature.conditions.length > 0 ? `, ${creature.conditions.join(", ")}` : "";
    lines.push(`- ${creature.name} (${creature.handle}, ${creature.side}): ${creature.health}${conditions}${distance}`);
  }
  if (state.anchors.length > 0) {
    lines.push(
      `Places: ${state.anchors
        .map((a) => `${a.name} (${a.id}${"distance_ft" in a ? `, ${Math.round(a.distance_ft)} ft` : ""})`)
        .join("; ")}.`,
    );
  }
  return lines.join("\n");
}

/** The parts of a sheet a player decides with. The full sheet stays available as JSON. */
export function formatSheet(sheet: Sheet): string {
  return JSON.stringify(sheet);
}
