// Compact text an agent reads, made from engine responses that were already projected for that
// agent's viewer (Rule 3: projection happens in the engine; this file only formats). Text instead
// of raw JSON keeps every turn's input small, which is most of the latency and cost (M6 spec §7).
import type { ActionOption, CommandResult, Event, Handle, Sheet, State, TurnBudget } from "@nat20-table/engine-client";

/** The result of `legal_actions`. */
export type LegalActionsResult = Extract<CommandResult, { cmd: "legal_actions" }>;
type Option = ActionOption;

/** One line per option: id, name, cost, and its targets with distance and reach; in a fight, what is left of the turn first. */
/**
 * The options as an agent reads them. With `described`, an option's `summary` (the rule's own text
 * from the engine) follows its line the first time its action shows up, and the action joins the
 * set: the agent's session keeps what it read, so later listings stay short. Without it, no summaries.
 */
export function formatOptions(result: LegalActionsResult, described?: Set<string>): string {
  const lines = result.options.map((option) => {
    const line = formatOption(option);
    if (!described || !option.summary || described.has(option.action)) return line;
    described.add(option.action);
    return `${line}\n  ${option.summary}`;
  });
  if (result.budget) lines.unshift(`Left this turn: ${formatBudget(result.budget)}`);
  if (result.can_end_turn) lines.push("- end_turn: end your turn");
  return lines.join("\n");
}

/** What is left of a turn: "Action used · Bonus Action free · Reaction free · 4 of 60 ft left". */
export function formatBudget(budget: TurnBudget): string {
  const use = (name: string, n: number) => `${name} ${n === 0 ? "used" : n === 1 ? "free" : `${n} left`}`;
  return [
    use("Action", budget.action),
    use("Bonus Action", budget.bonus_action),
    use("Reaction", budget.reaction),
    `${budget.movement_ft} of ${budget.speed_ft} ft left`,
  ].join(" · ");
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

/** A signed bonus: `+3`, `-1`, `+0`. */
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

/** An id as the human reads it: `animal_handling` is "Animal Handling", `fighter` is "Fighter". */
const titled = (id: string) =>
  id
    .split(/[_.]/)
    .map((w, i) => (i > 0 && w === "of" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const RECHARGE: Record<string, string> = { turn: "each turn", short_rest: "short rest", long_rest: "long rest", never: "doesn't recharge" };

/**
 * The human's own sheet for `/sheet` (owner view), as lines a first-time player can read (scope
 * §6.6). It says "Armor Class" and "save difficulty" in words: the leak scan reads "AC 15" and
 * "DC 12" in the human's stream as a leaked target number, whoever's it is. AI players read the
 * sheet as JSON through `my_sheet`.
 */
export function formatSheet(sheet: Sheet): string {
  const who = sheet.level ? `level ${sheet.level} ${sheet.species} ${sheet.class ?? ""}`.trim() : sheet.species;
  const lines = [
    `${sheet.name}, ${who}${sheet.subclass ? ` (${titled(sheet.subclass)})` : ""}`,
    `Hit Points ${sheet.hp} of ${sheet.hp_max}${sheet.temp_hp > 0 ? `, plus ${sheet.temp_hp} temporary` : ""} · Armor Class ${sheet.ac} · Speed ${sheet.speed_ft} ft · Initiative ${signed(sheet.initiative_bonus)} · Proficiency Bonus ${signed(sheet.proficiency_bonus)} · Passive Perception ${sheet.passive_perception}`,
  ];
  if (sheet.life_state !== "conscious") {
    lines.push(`You are ${sheet.life_state}. Death saving throws: ${sheet.death_saves.successes} successes, ${sheet.death_saves.failures} failures.`);
  }
  const status = [
    ...(sheet.conditions.length > 0 ? [`Conditions: ${sheet.conditions.join(", ")}`] : []),
    ...(sheet.exhaustion > 0 ? [`Exhaustion level ${sheet.exhaustion}`] : []),
    ...(sheet.concentration ? [`Concentrating on ${sheet.concentration.spell}`] : []),
    ...(sheet.effects.length > 0 ? [`Effects: ${sheet.effects.map((e) => `${e.name} (from ${e.source})`).join(", ")}`] : []),
  ];
  if (status.length > 0) lines.push(status.join(" · "));
  lines.push(
    `Abilities: ${sheet.abilities
      .map((a) => `${a.ability.slice(0, 3).toUpperCase()} ${a.score} (${signed(a.modifier)}; save ${signed(a.save_bonus)}${a.save_proficient ? ", proficient" : ""})`)
      .join(" · ")}`,
  );
  const skill = (s: Sheet["skills"][number]) => `${titled(s.skill)} ${signed(s.bonus)}${s.proficiency === "expertise" ? " (expertise)" : ""}`;
  const trained = sheet.skills.filter((s) => s.proficiency !== "none");
  if (trained.length > 0) lines.push(`Skills you are trained in: ${trained.map(skill).join(", ")}`);
  lines.push(`Other skills: ${sheet.skills.filter((s) => s.proficiency === "none").map(skill).join(", ")}`);
  for (const line of sheet.spellcasting) {
    lines.push(`Spellcasting (${titled(line.class)}, ${titled(line.ability)}): spell attack ${signed(line.attack_bonus)}, spell save difficulty ${line.save_dc}`);
  }
  if (sheet.spell_slots.length > 0) lines.push(`Spell slots: ${sheet.spell_slots.map((s) => `level ${s.level}: ${s.remaining} of ${s.max}`).join(", ")}`);
  const cantrips = sheet.spells.filter((s) => s.level === 0);
  const levelled = sheet.spells.filter((s) => s.level > 0);
  if (cantrips.length > 0) lines.push(`Cantrips: ${cantrips.map((s) => s.name).join(", ")}`);
  if (levelled.length > 0) {
    lines.push(`Spells: ${levelled.map((s) => `${s.name} (level ${s.level}${s.concentration ? ", concentration" : ""})`).join(", ")}`);
  }
  if (sheet.resources.length > 0) {
    lines.push(
      `Limited uses: ${sheet.resources
        .map((r) => `${r.name} ${r.remaining} of ${r.max} (${RECHARGE[r.recharge] ?? r.recharge}${r.short_rest_regain ? `; a short rest gives back ${r.short_rest_regain}` : ""})`)
        .join(", ")}`,
    );
  }
  if (sheet.hit_dice.length > 0) lines.push(`Hit Point Dice: ${sheet.hit_dice.map((d) => `d${d.die} ${d.remaining} of ${d.max}`).join(", ")}`);
  if (sheet.equipment.length > 0) {
    lines.push(`Equipment: ${sheet.equipment.map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ""}${i.equipped ? " (equipped)" : ""}`).join(", ")}`);
  }
  if (sheet.features.length > 0) lines.push(`Features: ${sheet.features.map((f) => f.name).join(", ")}`);
  return lines.join("\n");
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
    lines.push(`Encounters: ${state.encounters.map((e) => `${e.id}${e.running ? " (running)" : ""}${e.surrender_available ? ` (surrender available: ${(e.surrendering ?? []).join(", ")})` : ""}`).join("; ")}.`);
  }
  if (state.spawns.length > 0) {
    lines.push(`Spawns: ${state.spawns.map((s) => `${s.id} (${s.when.kind}${s.placed ? ", placed" : ""})`).join("; ")}.`);
  }
  if (state.flags.length > 0) lines.push(`Flags: ${state.flags.join(", ")}.`);
  return lines.join("\n");
}

/** An event as one line: its own text, after its roll id when it is a roll (`[r12] bren rolls …`). */
/** The creature a reaction answers, from the engine's trigger sentence ("bren may react to torva."). */
export function reactingTo(summary: string): Handle | undefined {
  return /may react to ([\w-]+)\.$/m.exec(summary)?.[1];
}

export function eventLine(event: Event): string {
  return event.kind === "roll" ? `[${event.roll.id}] ${event.text}` : event.text;
}

/**
 * Each creature's deaths and every scene load, by `seq`, as the table has read them so far. A
 * creature is dead from its death until the next scene load, which may place a new creature
 * under the same handle.
 */
export interface Deaths {
  readonly died: Map<Handle, number[]>;
  readonly loads: number[];
}

/** An empty record of deaths, for a table that has read nothing yet. */
export function noDeaths(): Deaths {
  return { died: new Map(), loads: [] };
}

/**
 * Events a seat is told about. The session's own start line is bookkeeping, not fiction, and so
 * is the empty turn the engine still gives a dead creature that keeps its place in the
 * initiative order. The deaths and scene loads in `events` are added to `deaths`, so one record
 * serves every reader, in any order.
 */
export function tellable(events: Event[], deaths: Deaths): Event[] {
  const note = (list: number[], seq: number) => {
    if (!list.includes(seq)) list.push(seq);
  };
  for (const e of events) {
    if (e.kind === "life_state" && e.state === "dead") {
      const list = deaths.died.get(e.target) ?? [];
      note(list, e.seq);
      deaths.died.set(e.target, list);
    }
    if (e.kind === "scene_loaded") note(deaths.loads, e.seq);
  }
  const dead = (handle: Handle, seq: number) => {
    const before = (deaths.died.get(handle) ?? []).filter((d) => d < seq);
    if (before.length === 0) return false;
    const died = Math.max(...before);
    return !deaths.loads.some((l) => l > died && l < seq);
  };
  return events.filter((e) => {
    if (e.kind === "session_started") return false;
    if (e.kind !== "turn_start" && e.kind !== "turn_end") return true;
    return !dead(e.actor, e.seq);
  });
}
