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

/** The DM's view: every creature with its numbers, the scene's checks, encounters, spawns, flags. */
export function formatDmState(state: State): string {
  if (state.view !== "dm") return formatState(state);
  const lines: string[] = [];
  lines.push(`Scene ${state.scene_id ?? "none"}, ${state.mode}${state.round ? `, round ${state.round}` : ""}.`);
  if (state.initiative.length > 0) lines.push(`Initiative: ${state.initiative.join(", ")}.`);
  for (const c of state.creatures) {
    const conditions = c.conditions.length > 0 ? `, ${c.conditions.join(", ")}` : "";
    const at = `(${Math.round(c.position_ft.x_ft)}, ${Math.round(c.position_ft.y_ft)})`;
    lines.push(`- ${c.name} (${c.handle}, ${c.side}): ${c.hp}/${c.hp_max} HP, AC ${c.ac}, ${c.life_state}${conditions}, at ${at}`);
  }
  if (state.anchors.length > 0) {
    lines.push(`Anchors: ${state.anchors.map((a) => `${a.id} "${a.name}" (${Math.round(a.position_ft.x_ft)}, ${Math.round(a.position_ft.y_ft)})`).join("; ")}.`);
  }
  if (state.checks.length > 0) {
    lines.push(`Checks: ${state.checks.map((c) => `${c.id} (${"skill" in c.test ? c.test.skill : c.test.ability} DC ${c.dc}${c.rolled ? ", rolled" : ""})`).join("; ")}.`);
  }
  if (state.encounters.length > 0) {
    lines.push(`Encounters: ${state.encounters.map((e) => `${e.id}${e.running ? " (running)" : ""}${e.surrender_available ? " (surrender available)" : ""}`).join("; ")}.`);
  }
  if (state.spawns.length > 0) {
    lines.push(`Spawns: ${state.spawns.map((s) => `${s.id} (${s.when.kind}${s.placed ? ", placed" : ""})`).join("; ")}.`);
  }
  if (state.flags.length > 0) lines.push(`Flags: ${state.flags.join(", ")}.`);
  return lines.join("\n");
}
