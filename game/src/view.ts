// Compact text an agent reads, made from engine responses that were already projected for that
// agent's viewer (Rule 3: projection happens in the engine; this file only formats). Text instead
// of raw JSON keeps every turn's input small, which is most of the latency and cost (M6 spec §7).
import type { ActionOption, CommandResult, Event, Handle, Sheet, State, TurnBudget, WorldDm, WorldPlayer } from "@nat20-table/engine-client";

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
  if (state.view === "player" && state.world) lines.push("", ...worldLines(state.world));
  return lines.join("\n");
}

/** Copper as coins a reader counts: 300 is "3 gp", 250 is "2 gp 5 sp", 7 is "7 cp". */
export function coinWords(copper: number): string {
  const gp = Math.floor(copper / 100);
  const sp = Math.floor((copper % 100) / 10);
  const cp = copper % 10;
  const parts = [gp ? `${gp} gp` : "", sp ? `${sp} sp` : "", cp ? `${cp} cp` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "0 cp";
}

/**
 * The living world as one player knows it (M9, AGT-80): the day and hour, where the caravan is,
 * the places and roads the party knows, the caravan, a road card waiting for its decision, the
 * escort contract, and the townsfolk met. Only what the player view carries.
 */
export function worldLines(world: WorldPlayer): string[] {
  const placeName = new Map(world.places.map((p) => [p.id, p.name]));
  const named = (id: string) => (placeName.has(id) ? `${placeName.get(id)} (${id})` : id);
  const clock = world.clock;
  const time = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  const where =
    world.at.kind === "at"
      ? `The caravan is at ${named(world.at.place)}.`
      : `The caravan is on the road ${world.at.road}, out from ${named(world.at.came_from)}, ${world.at.miles_left} miles from its end.`;
  const lines = [`Day ${clock.day}, ${clock.watch.replace(/_/g, " ")} (${time}). ${where}`];
  lines.push(`Travel left today: ${world.today.fast} miles at a fast pace, ${world.today.normal} normal, ${world.today.slow} slow.`);
  if (world.drives) lines.push("You may move the caravan on (travel) and end the day (rest_night).");
  lines.push(
    `Known places: ${world.places
      .map((p) => `${p.name} (${p.id}, ${p.kind}${p.market ? ", market" : ""}${typeof p.inn_cp === "number" ? `, inn ${coinWords(p.inn_cp)} a night each` : ""})`)
      .join("; ")}.`,
  );
  if (world.roads.length > 0) {
    lines.push(`Roads: ${world.roads.map((r) => `${r.id}: ${named(r.from)} to ${named(r.to)}, ${r.miles} miles of ${r.terrain}${r.good_road ? " on a good road" : ""}, ${r.max_pace} pace at most`).join("; ")}.`);
  }
  if (world.unexplored.length > 0) {
    lines.push(`Roads to places you don't know yet: ${world.unexplored.map((r) => `${r.id} from ${named(r.from)}, ${r.miles} miles`).join("; ")}.`);
  }
  const cargo = world.caravan.wagons.flatMap((w) => w.cargo.map((c) => `${c.quantity} ${c.name}`));
  lines.push(`The caravan (${world.caravan.owner}'s): ${world.caravan.wagons.length} wagon${world.caravan.wagons.length === 1 ? "" : "s"}${cargo.length > 0 ? `, carrying ${cargo.join(", ")}` : ""}.`);
  if (world.card) {
    const card = world.card;
    lines.push(`A road card waits (${card.target === "caravan" ? "the caravan's call" : "the Blades decide"}): ${card.text}`);
    lines.push(`Choices: ${card.choices.map((c) => `${c.id}: ${c.text}`).join(" | ")}`);
    if (card.said.length > 0) lines.push(`Said so far: ${card.said.map((s) => `${s.actor} ${s.choice}`).join(", ")}.`);
    if (card.waiting_for.length > 0) lines.push(`Waiting for: ${card.waiting_for.join(", ")}.`);
  }
  if (world.escort) {
    const e = world.escort;
    lines.push(
      `Escort contract: to ${named(e.destination)} for ${coinWords(e.wage_cp)} a day each${e.done ? ", done" : ""}. ${e.blades
        .map((b) => `${b.handle}: ${b.served} day${b.served === 1 ? "" : "s"} served, ${coinWords(b.paid_cp)} paid`)
        .join("; ")}.`,
    );
  }
  const met = world.npcs ?? [];
  if (met.length > 0) lines.push(`People you have met: ${met.map((n) => `${n.name} of ${named(n.place)}${n.alive ? "" : " (dead)"}`).join("; ")}.`);
  return lines;
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
  // Experience (AGT-80): whether the next level is due, which the road's level_up tool needs.
  if (sheet.xp) {
    lines.push(
      sheet.xp.can_level_up
        ? `Experience: ${sheet.xp.points} XP. You can level up now: out of a fight, call level_up.`
        : `Experience: ${sheet.xp.points} XP${typeof sheet.xp.next_level === "number" ? `, the next level at ${sheet.xp.next_level}` : ""}.`,
    );
  }
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
  if (state.world) lines.push(...dmWorldLines(state.world));
  return lines.join("\n");
}

/** The world as the DM reads it (AGT-80): the player's lines plus the card's id and zone, the route, the merchant's purse and every place NPC. */
export function dmWorldLines(world: WorldDm): string[] {
  const placeName = new Map(world.places.map((p) => [p.id, p.name]));
  const named = (id: string) => (placeName.has(id) ? `${placeName.get(id)} (${id})` : id);
  const clock = world.clock;
  const where = world.at.kind === "at" ? `at ${named(world.at.place)}` : `on the road ${world.at.road} out from ${named(world.at.came_from)}, ${world.at.miles_left} miles from its end`;
  const lines = [`World: day ${clock.day}, ${clock.watch.replace(/_/g, " ")} (${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}); the caravan is ${where}.`];
  lines.push(`Places: ${world.places.map((p) => `${p.name} (${p.id}, ${p.kind}, scene ${p.scene}${p.discovered ? "" : ", undiscovered"})`).join("; ")}.`);
  if (world.route.length > 0) lines.push(`The merchant's route: ${world.route.map(named).join(", ")}.`);
  const cargo = world.caravan.wagons.flatMap((w) => w.cargo.map((c) => `${c.quantity} ${c.name}`));
  lines.push(`Caravan (${world.caravan.owner}): ${world.caravan.wagons.length} wagon${world.caravan.wagons.length === 1 ? "" : "s"}${cargo.length > 0 ? `, ${cargo.join(", ")}` : ""}.`);
  if (world.card) {
    const c = world.card;
    lines.push(`Road card ${c.id} (${c.zone}, ${c.target}): ${c.text} Choices: ${c.choices.map((x) => `${x.id}: ${x.text}`).join(" | ")}.${c.waiting_for.length > 0 ? ` Waiting for ${c.waiting_for.join(", ")}.` : ""}`);
  }
  if (world.escort) {
    const e = world.escort;
    lines.push(`Escort to ${named(e.contract.destination)}${e.contract.done ? ", done" : ""}; the merchant's purse holds ${coinWords(e.purse_cp)}.`);
  }
  const npcs = world.npcs ?? [];
  if (npcs.length > 0) {
    lines.push(`Place NPCs: ${npcs.map((n) => `${n.name} (${n.id}, ${n.monster}, ${n.attitude}) of ${named(n.place)}${n.alive ? "" : ", dead"}${n.met ? ", met" : ""}`).join("; ")}.`);
  }
  return lines;
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
