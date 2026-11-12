// `/sheet`, `/where` and `/map` at a Russian seat (AGT-98, design §4): rendered from the same
// fields as their English forms in view.ts, which stay byte for byte as they were.
import type { Sheet, State, WorldPlayer } from "@nat20-table/engine-client";
import { titled } from "../view.ts";
import { plural } from "./plural.ts";
import { ABILITY_RU, purseRu, type SeatNames, WATCH_RU } from "./seat-lines.ts";
import { CONDITION_NAMES_RU, SEAT_WORDS, SKILLS_RU, UI_WORDS } from "./words.ts";

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

const HEALTH_RU = UI_WORDS.ru.panel.health;
const SIDE_RU = SEAT_WORDS.ru.side;
const LIFE_RU: Record<Sheet["life_state"], string> = { conscious: "в сознании", unconscious: "без сознания", stable: "без сознания, но вне опасности", dead: "погиб" };
const RECHARGE_RU: Record<string, string> = { turn: "каждый ход", short_rest: "после короткого привала", long_rest: "после ночного отдыха", never: "не возвращается" };
const CLASSES_RU: Record<string, string> = { fighter: "воин", cleric: "жрец", wizard: "волшебник", barbarian: "варвар", rogue: "плут" };
const SPECIES_RU: Record<string, string> = { human: "человек", dwarf: "дварф", elf: "эльф", halfling: "полурослик", dragonborn: "драконорождённый" };

/** The human's own sheet for `/sheet`, in Russian, from the fields `formatSheet` reads. */
export function sheetRu(sheet: Sheet, names: SeatNames): string {
  const cls = sheet.class ? (CLASSES_RU[sheet.class.split(".").at(-1)!] ?? sheet.class) : "";
  const species = SPECIES_RU[sheet.species.toLowerCase()] ?? sheet.species;
  const lines = [
    `${names.person(sheet.handle)}: ${[species, cls].filter(Boolean).join(", ")}${sheet.level ? `, уровень ${sheet.level}` : ""}`,
    `Здоровье ${sheet.hp} из ${sheet.hp_max}${sheet.temp_hp > 0 ? `, и ещё ${sheet.temp_hp} сверху` : ""} · Защита ${sheet.ac} · Шаг за ход ${plural(sheet.speed_ft, "фут", "фута", "футов")} · Порядок в бою ${signed(sheet.initiative_bonus)} · Мастерство ${signed(sheet.proficiency_bonus)} · Внимательность без броска ${sheet.passive_perception}`,
  ];
  if (sheet.xp) {
    lines.push(
      sheet.xp.can_level_up
        ? `Опыт: ${sheet.xp.points}. Хватает на новый уровень.`
        : `Опыт: ${sheet.xp.points}${typeof sheet.xp.next_level === "number" ? `, следующий уровень на ${sheet.xp.next_level}` : ""}.`,
    );
  }
  const purse = purseRu(sheet.purse.coins);
  lines.push(purse ? `Кошелёк: ${purse}.` : "Кошелёк пуст.");
  if (sheet.life_state !== "conscious") {
    lines.push(`Вы ${LIFE_RU[sheet.life_state]}. Борьба со смертью: удач ${sheet.death_saves.successes}, неудач ${sheet.death_saves.failures}.`);
  }
  const status = [
    ...(sheet.conditions.length > 0 ? [`Состояние: ${sheet.conditions.map((c) => CONDITION_NAMES_RU[c]).join(", ")}`] : []),
    ...(sheet.exhaustion > 0 ? [`Усталость: ${sheet.exhaustion}`] : []),
    ...(sheet.concentration ? [`Удерживаете заклинание: ${names.thing(sheet.concentration.spell, titled(sheet.concentration.spell))}`] : []),
    ...(sheet.effects.length > 0 ? [`Действует: ${sheet.effects.map((e) => `${names.thing(e.id, e.name)} (от: ${names.who(e.source)})`).join(", ")}`] : []),
  ];
  if (status.length > 0) lines.push(status.join(" · "));
  lines.push(`Качества: ${sheet.abilities.map((a) => `${ABILITY_RU[a.ability]} ${a.score} (${signed(a.modifier)}; устоять ${signed(a.save_bonus)}${a.save_proficient ? ", обучены" : ""})`).join(" · ")}`);
  const skill = (s: Sheet["skills"][number]) => `${SKILLS_RU[s.skill]} ${signed(s.bonus)}${s.proficiency === "expertise" ? " (мастер)" : ""}`;
  const trained = sheet.skills.filter((s) => s.proficiency !== "none");
  if (trained.length > 0) lines.push(`Чему обучены: ${trained.map(skill).join(", ")}`);
  lines.push(`Остальные навыки: ${sheet.skills.filter((s) => s.proficiency === "none").map(skill).join(", ")}`);
  for (const line of sheet.spellcasting) lines.push(`Колдовство (${ABILITY_RU[line.ability]}): удар заклинанием ${signed(line.attack_bonus)}, устоять против ваших чар ${line.save_dc}`);
  if (sheet.spell_slots.length > 0) lines.push(`Ячейки заклинаний: ${sheet.spell_slots.map((s) => `круг ${s.level}: ${s.remaining} из ${s.max}`).join(", ")}`);
  const cantrips = sheet.spells.filter((s) => s.level === 0);
  const levelled = sheet.spells.filter((s) => s.level > 0);
  if (cantrips.length > 0) lines.push(`Простые заклинания: ${cantrips.map((s) => names.thing(s.id, s.name)).join(", ")}`);
  if (levelled.length > 0) lines.push(`Заклинания: ${levelled.map((s) => `${names.thing(s.id, s.name)} (круг ${s.level}${s.concentration ? ", удерживать" : ""})`).join(", ")}`);
  if (sheet.resources.length > 0) {
    lines.push(
      `Ограниченные силы: ${sheet.resources
        .map((r) => `${names.thing(r.id, r.name)} ${r.remaining} из ${r.max} (${RECHARGE_RU[r.recharge] ?? r.recharge}${r.short_rest_regain ? `; короткий привал возвращает ${r.short_rest_regain}` : ""})`)
        .join(", ")}`,
    );
  }
  if (sheet.hit_dice.length > 0) lines.push(`Кости здоровья для привала: ${sheet.hit_dice.map((d) => `${d.remaining} из ${d.max}`).join(", ")}`);
  if (sheet.equipment.length > 0) {
    lines.push(`Снаряжение: ${sheet.equipment.map((i) => `${names.thing(i.id, i.name)}${i.quantity > 1 ? ` ×${i.quantity}` : ""}${i.equipped ? " (в руках или на себе)" : ""}`).join(", ")}`);
  }
  if (sheet.features.length > 0) lines.push(`Умения: ${sheet.features.map((f) => names.thing(f.id, f.name)).join(", ")}`);
  return lines.join("\n");
}

/** `/where` in Russian: who is around, how they are, how far, and the places of the scene. */
export function stateRu(state: State, names: SeatNames): string {
  const lines: string[] = [];
  if (state.round) lines.push(`Бой, раунд ${state.round}.`);
  if (state.view === "player" && state.me) lines.push(`Вы: ${names.person(state.me.handle)}, здоровье ${state.me.hp} из ${state.me.hp_max}.`);
  const others = state.view === "player" ? state.others : state.creatures;
  for (const c of others) {
    const distance = "distance_ft" in c && typeof c.distance_ft === "number" ? `, ${plural(Math.round(c.distance_ft), "фут", "фута", "футов")} от вас` : "";
    const conditions = c.conditions.length > 0 ? `, ${c.conditions.map((x) => CONDITION_NAMES_RU[x]).join(", ")}` : "";
    lines.push(`- ${names.person(c.handle)} (${SIDE_RU[c.side]}): ${HEALTH_RU[c.health]}${conditions}${distance}`);
  }
  if (state.anchors.length > 0) {
    lines.push(`Места: ${state.anchors.map((a) => `${names.anchor(a.id, a.name)}${"distance_ft" in a ? ` (${plural(Math.round(a.distance_ft), "фут", "фута", "футов")})` : ""}`).join("; ")}.`);
  }
  if (state.view === "player" && state.world) lines.push("", ...mapLinesRu(state.world, names));
  return lines.join("\n");
}

/** Time on the move in Russian words: «меньше получаса», «около часа», «около 5 часов». Never minutes. */
function travelTimeRu(minutes: number): string {
  if (minutes < 30) return "меньше получаса";
  if (minutes < 60) return "меньше часа";
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "около часа" : `около ${plural(hours, "часа", "часов", "часов")}`;
}

function arrivalRu(arrives: { day: number; watch: WorldPlayer["clock"]["watch"] }, today: number): string {
  const watch = WATCH_RU[arrives.watch];
  if (arrives.day === today) return watch;
  return arrives.day === today + 1 ? `завтра, ${watch}` : `день ${arrives.day}, ${watch}`;
}

/** `/map` in Russian: the way ahead in travel order, as `mapLines` gives it in English. */
export function mapLinesRu(world: WorldPlayer, names: SeatNames): string[] {
  const name = (id: string) => names.place(id);
  const today = world.clock.day;
  const row = (left: string, right: string, width = 26) => (right ? `${left.padEnd(width)} ${right}` : left);
  const escort = world.escort && !world.escort.done ? world.escort : undefined;
  const lines = [[`День ${today}`, WATCH_RU[world.clock.watch], ...(escort ? [`путь: ${name(escort.destination)}`] : [])].join(" · "), ""];
  const here = world.at.kind === "at" ? world.at.place : undefined;
  const miles = (n: number) => plural(n, "миля", "мили", "миль");
  const legTime = (minutes: number, nights: number) => (nights === 0 ? travelTimeRu(minutes) : `${travelTimeRu(minutes)}, ${nights === 1 ? "одна ночь" : plural(nights, "ночь", "ночи", "ночей")} в пути`);
  if (here) lines.push(row(`▶ ${name(here)}`, "вы здесь"));
  else if (world.at.kind === "on_road") lines.push(`▶ в пути, до конца дороги ${miles(world.at.miles_left)}`);
  const trip = world.trip ?? undefined;
  const onRoute = new Set<string>(here ? [here] : []);
  const legs = trip?.legs ?? [];
  for (const [i, leg] of legs.entries()) {
    const last = i === legs.length - 1;
    lines.push(row(`│ ${miles(leg.miles)}`, legTime(leg.minutes, leg.nights), 38));
    lines.push(row(`${last && trip!.complete ? "◎" : "●"} ${name(leg.to)}`, `прибытие: ${arrivalRu(leg.arrives, today)}${last && trip!.complete ? " · подряд кончается" : ""}`));
    onRoute.add(leg.to);
  }
  if (trip && !trip.complete) lines.push("│ … а дальше дорогами, которых вы ещё не знаете");
  if (legs.length > 0) {
    const total = legs.reduce((n, l) => n + l.miles, 0);
    const nights = legs.reduce((n, l) => n + l.nights, 0);
    const lastLeg = legs[legs.length - 1]!;
    const when = nights === 0 && lastLeg.arrives.day === today ? "там к ночи" : `${nights === 1 ? "одна ночь" : plural(nights, "ночь", "ночи", "ночей")} в пути, прибытие: ${arrivalRu(lastLeg.arrives, today)}`;
    lines.push("", `осталось ${miles(total)} · ${travelTimeRu(legs.reduce((n, l) => n + l.minutes, 0))} в дороге`, trip!.complete ? when : "дальше путь вам незнаком");
  }
  const taken = new Set(legs.map((l) => l.road));
  const off: Array<{ label: string; miles: number; right: string }> = [];
  const from = (place: string) => (place === here ? "отсюда" : `от: ${name(place)}`);
  for (const r of world.roads) {
    if (taken.has(r.id)) continue;
    for (const [a, b] of [[r.from, r.to], [r.to, r.from]] as const) {
      if (!onRoute.has(a) || (onRoute.has(b) && a === r.to)) continue;
      const time = r.reach ? legTime(r.reach.minutes, r.reach.nights) : "";
      off.push({ label: name(b), miles: r.miles, right: `${miles(r.miles)} ${from(a)}${time ? `   ${time}` : ""}` });
    }
  }
  for (const r of world.unexplored) {
    if (!onRoute.has(r.from)) continue;
    const time = r.reach ? legTime(r.reach.minutes, r.reach.nights) : "";
    off.push({ label: "? незнакомая дорога", miles: r.miles, right: `${miles(r.miles)} ${from(r.from)}${time ? `   ${time}` : ""}` });
  }
  if (off.length > 0) {
    lines.push("", legs.length > 0 ? "В СТОРОНЕ ОТ ПУТИ" : "ДОРОГИ ОТСЮДА");
    for (const o of off.sort((x, y) => x.miles - y.miles)) lines.push(row(`  ${o.label}`, o.right));
  }
  return lines;
}

