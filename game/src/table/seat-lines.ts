// An engine event as the human's seat reads it, in the run's language (Milestone 12, AGT-98,
// design §4, decision 0067). The wire stays English: the transcript, the logs and every prompt keep
// the engine's own `text`. English returns what the seat showed before, except the lines AGT-98
// changes (design §4's table); Russian renders every event kind from its fields, so a new kind
// without a case fails `tsc` and no English line reaches a Russian seat unnoticed.
import { readFileSync } from "node:fs";
import type { Ability, CardTarget, Condition, DamageType, Event, Handle, RollView, Skill, Watch } from "@nat20-table/engine-client";
import type { Language } from "../agents/language.ts";
import { coinPhrase, eventLine, titled, yourLine } from "../view.ts";
import { plural } from "./plural.ts";
import { SKILLS_RU } from "./words.ts";

/** The table's Russian words for engine ids (`ru/options.json`). */
export interface RuDictionary {
  /** Option ids (`melee_attack/longsword`) to the option's name. */
  options: Record<string, string>;
  /** Variant ids (`divine_spark/heal`) to the variant's name, beyond the skills. */
  variants: Record<string, string>;
  /** Option ids to the rule's summary on the action card. */
  summaries: Record<string, string>;
  /** Spells, items, features, resources and effects by id. */
  things: Record<string, string>;
  /** Creature kinds by the handle's stem (`wolf` for `wolf_2`) or the stat block's id. */
  creatures: Record<string, string>;
}

let dictionary: RuDictionary | undefined;

/** The table's Russian words, read once. */
export function ruDictionary(): RuDictionary {
  dictionary ??= JSON.parse(readFileSync(new URL("./ru/options.json", import.meta.url), "utf8")) as RuDictionary;
  return dictionary;
}

/**
 * A road card as the seat reads it: the card an event belongs to (design §4: the card named by the
 * latest `card_shown` at or before the event, not the card on the table now), with its choices'
 * words in the run's language and the own move's words, so advice names a choice, not its id.
 */
export interface CardOnSeat {
  /** The card's id, from the DM's `card_shown`, when the seat saw it. */
  id?: string;
  target: CardTarget;
  /** The card's words in the run's language. */
  text: string;
  /** Each choice's words by id, in the run's language. */
  choices: ReadonlyMap<string, string>;
  /** The own move's words, when a player made one (`card_own_move`). */
  ownMove?: string;
}

/** How the seat names things in one run: Russian names by id from the pack and the world. */
export class SeatNames {
  readonly language: Language;
  /** Russian names by id: party handles, `npc:<id>`, places, goods and anchors (`anchor:<id>`). */
  private readonly ru: ReadonlyMap<string, string>;

  constructor(language: Language = "en", ru: ReadonlyMap<string, string> = new Map()) {
    this.language = language;
    this.ru = ru;
  }

  /**
   * A creature or a ledger holder: the party's names, an NPC's, a monster's kind and number
   * («волк 2»). English names a character as the engine does, by handle, and an NPC by its name.
   */
  who(id: string): string {
    if (this.language === "en") return id.startsWith("npc:") ? titled(id.slice(4)) : id;
    const named = this.ru.get(id);
    if (named) return named;
    if (id === "world") return "мир";
    if (id.startsWith("wagon:")) return "обоз";
    if (id.startsWith("market:")) return `рынок, ${this.place(id.slice(7))}`;
    if (id.startsWith("npc:")) return titled(id.slice(4));
    const stem = /^(.*?)(?:_(\d+))?$/.exec(id)!;
    const kind = ruDictionary().creatures[stem[1]!];
    return kind ? `${kind}${stem[2] ? ` ${stem[2]}` : ""}` : id;
  }

  /** A party member as the seat's sentences start with it: "Bren", «Брен». */
  person(id: string): string {
    const name = this.who(id);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /** A list of creatures. */
  list(ids: readonly string[]): string {
    return ids.map((id) => this.who(id)).join(", ");
  }

  /** A place on the map. */
  place(id: string): string {
    return (this.language === "ru" ? this.ru.get(id) : undefined) ?? id.replace(/_/g, " ");
  }

  /** A good the caravan carries. */
  good(id: string): string {
    return (this.language === "ru" ? this.ru.get(`good:${id}`) : undefined) ?? id.replace(/_/g, " ");
  }

  /** A scene anchor by id, or by its English name when there is no Russian one. */
  anchor(id: string, name: string): string {
    return (this.language === "ru" ? this.ru.get(`anchor:${id}`) : undefined) ?? name;
  }

  /** A spell, item, feature, resource or effect by id; `name` is the engine's English name. */
  thing(id: string, name: string): string {
    return this.language === "ru" ? (ruDictionary().things[id] ?? name) : name;
  }

  /** An option by id; `name` is the engine's English name. */
  option(id: string, name: string): string {
    return this.language === "ru" ? (ruDictionary().options[id] ?? name) : name;
  }

  /** A variant of an option: a skill (`help/athletics`), or the dictionary's word. */
  variant(id: string, name: string): string {
    if (this.language === "en") return name;
    const skill = id.split("/").at(-1) as Skill;
    return ruDictionary().variants[id] ?? SKILLS_RU[skill] ?? name;
  }

  /** An option's rule summary for the action card. */
  summary(id: string, summary: string | undefined): string | undefined {
    return this.language === "ru" ? (ruDictionary().summaries[id] ?? summary) : summary;
  }
}

/** Where a line goes: the seat's story, or `/log`. */
export type SeatSite = "seat" | "log";

export interface SeatContext {
  names: SeatNames;
  /** The human's character, for their own coin and experience lines (B4). */
  human?: Handle;
  site: SeatSite;
  /** The whole party, so a rest everyone took names the party, not each of them. */
  party?: readonly Handle[];
  /** The card the event belongs to, for advice, votes and outcomes. */
  card?: CardOnSeat;
}

/** The line the seat shows for `event`, or `null` to show nothing. */
export function seatLine(event: Event, ctx: SeatContext): string | null {
  return ctx.names.language === "ru" ? ruLine(event, ctx) : enLine(event, ctx);
}

/** The roll id a line carries, which the seat writes last and dim (Rule 4). */
export function rollOf(event: Event): string | undefined {
  return event.kind === "roll" ? event.roll.id : undefined;
}

function enLine(event: Event, ctx: SeatContext): string | null {
  const mine = ctx.human ? yourLine(event, ctx.human) : undefined;
  if (mine) return mine;
  const n = ctx.names;
  switch (event.kind) {
    case "scene_loaded":
      // The DM's opening says where (design §4); `/log` keeps the line.
      return ctx.site === "seat" ? null : eventLine(event);
    case "ledger":
      if (event.reason === "wage" && event.what.kind === "coins") return `${n.person(event.from)} pays ${n.person(event.to)} ${coinPhrase(event.what.copper)} in wages.`;
      break;
    case "rest":
      if (event.rest === "long") return `${everyone(event.participants, ctx) ? "The party" : event.participants.map((h) => n.person(h)).join(", ")} rest${everyone(event.participants, ctx) || event.participants.length > 1 ? "" : "s"} through the night until morning.`;
      break;
    case "card_advice":
      if (ctx.card) return `${n.person(event.actor)} ${ctx.card.target === "blades" ? "votes" : "advises"}: ${choiceWords(event.choice, ctx.card)}.`;
      break;
    case "card_resolved":
      if (ctx.card) return `The card is decided: ${choiceWords(event.choice, ctx.card)}.`;
      break;
    case "time_lost":
      return `The party loses ${durationEn(event.minutes)}.`;
    case "roll":
      if (ctx.site === "seat" && (event.roll.kind === "skill_check" || event.roll.kind === "ability_check")) return checkEn(event.roll, n);
      break;
  }
  // `/log` keeps the roll id first, as it read before AGT-98; the seat writes it last.
  return ctx.site === "log" ? eventLine(event) : event.text;
}

function ruLine(event: Event, ctx: SeatContext): string | null {
  const n = ctx.names;
  const who = (h: string) => n.person(h);
  const human = ctx.human;
  const you = (h: string) => h === human;
  switch (event.kind) {
    case "session_started":
    case "scene_loaded":
      return null;
    // The DM's own lines never reach a seat; a view that sends one shows nothing.
    case "check_resolved":
    case "flag_set":
    case "hazard_triggered":
    case "spawned":
    case "creature_placed":
    case "cards_offered":
    case "card_picked":
    case "card_shown":
    case "deed_remembered":
    case "own_move_set":
      return null;
    case "combat_started":
      return `Бой! Порядок ходов: ${n.list(event.participants)}.`;
    case "surrendered":
      return `Сдаются: ${n.list(event.handles)}.`;
    case "fled":
      return `Бегут с поля боя: ${n.list(event.handles)}.`;
    case "combat_over":
      switch (event.reason) {
        case "surrender":
          return "Бой окончен: враг сдался.";
        case "fled":
          return "Бой окончен: враг бежал.";
        case "scenario":
          return "Бой окончен.";
        case "side_down":
          return event.winner === "party" ? "Бой окончен: отряд победил." : event.winner === "hostile" ? "Бой окончен: победа за врагом." : "Бой окончен.";
      }
      return "Бой окончен.";
    case "round":
      return `Раунд ${event.number}.`;
    case "turn_start":
      return you(event.actor) ? "Ваш ход." : `Ходит ${n.who(event.actor)}.`;
    case "turn_end":
      return you(event.actor) ? "Ваш ход окончен." : `${who(event.actor)} заканчивает ход.`;
    case "action":
      return `${who(event.actor)}: ${lower(n.option(event.option_id, event.name))}${event.targets.length > 0 && !(event.targets.length === 1 && event.targets[0] === event.actor) ? `, цель: ${n.list(event.targets)}` : ""}.`;
    case "action_dropped":
      return `${who(event.actor)} идёт, но не успевает: ${lower(n.option(event.option_id, event.name))}.`;
    case "roll":
      return rollRu(event.roll, n, human);
    case "damage_taken":
      return `${who(event.target)} получает урон: ${event.amount} (${DAMAGE_RU[event.damage_type]}).`;
    case "healed":
      return `${who(event.target)}: здоровье +${event.amount}.`;
    case "hit_points":
      return `${you(event.target) ? "Ваше здоровье" : `${who(event.target)}, здоровье`}: ${event.hp} из ${event.hp_max}${event.temp_hp > 0 ? `, и ещё ${event.temp_hp} сверху` : ""}.`;
    case "condition_added":
      return `${who(event.target)} ${CONDITIONS_RU[event.condition].on}.`;
    case "condition_removed":
      return `${who(event.target)} ${CONDITIONS_RU[event.condition].off}.`;
    case "concentration_started":
      return `${who(event.actor)} удерживает заклинание: ${n.thing(event.spell, titled(event.spell))}.`;
    case "concentration_ended":
      return `${who(event.actor)} больше не удерживает заклинание ${n.thing(event.spell, titled(event.spell))}${CONCENTRATION_RU[event.reason]}.`;
    case "effect_started":
      return `${who(event.target)}: действует ${lower(n.thing(event.effect, event.name))}.`;
    case "effect_ended":
      return `${who(event.target)}: больше не действует ${lower(n.thing(event.effect, event.name))}.`;
    case "item_used":
      return event.target === event.actor
        ? `${who(event.actor)} выпивает: ${n.thing(event.item, titled(event.item))}.`
        : `${who(event.actor)} даёт ${n.thing(event.item, titled(event.item))}; берёт ${n.who(event.target)}.`;
    case "ledger":
      return ledgerRu(event, n, human);
    case "theft_noticed":
      return `${who(event.target)} замечает кражу: это ${n.who(event.thief)}.`;
    case "life_state":
      switch (event.state) {
        case "conscious":
          return `${who(event.target)} приходит в себя.`;
        case "unconscious":
          return `${who(event.target)} падает без сознания.`;
        case "stable":
          return `${who(event.target)}: кровь остановлена, смерть отступила.`;
        case "dead":
          return `${who(event.target)} гибнет.`;
      }
      return null;
    case "moved":
      return event.anchor ? `${who(event.actor)} теперь здесь: ${n.anchor(event.anchor, event.anchor.replace(/_/g, " "))}.` : `${who(event.actor)} перемещается.`;
    case "rest":
      return event.rest === "long"
        ? `${everyone(event.participants, ctx) ? "Отряд" : n.list(event.participants)}: отдых всю ночь, до утра.`
        : `${everyone(event.participants, ctx) ? "Отряд" : n.list(event.participants)}: короткий привал.`;
    case "traveled":
      return event.leg.arrived
        ? `Обоз проходит ${miles(event.leg.miles)} и прибывает${event.leg.at.kind === "at" ? `: ${n.place(event.leg.at.place)}` : ""}.`
        : `Обоз проходит ${miles(event.leg.miles)}; на сегодня дорога кончена, ночь застанет в пути.`;
    case "place_discovered":
      return `Отряд находит новое место: ${n.place(event.place)}.`;
    case "night": {
      const night = event.night;
      const rested = night.rested.length > 0 ? ` Отдохнули: ${n.list(night.rested)}.` : " Никто не отдохнул.";
      const notRested = night.not_rested.length > 0 && night.rested.length > 0 ? ` Не отдохнули: ${n.list(night.not_rested)}.` : "";
      const hungry = night.hungry.length > 0 ? ` Голодны: ${n.list(night.hungry)}.` : "";
      return `Ночь ${night.lodging === "inn" ? "на постоялом дворе" : "в лагере"}.${rested}${notRested}${hungry}`;
    }
    case "card_drawn":
      return ctx.card ? `На дороге: ${ctx.card.text}` : `На дороге: ${event.card_text}`;
    case "card_advice":
      return `${who(event.actor)} ${ctx.card?.target === "blades" ? "голосует" : "советует"}: ${quoted(choiceWords(event.choice, ctx.card))}.`;
    case "card_resolved":
      return `Решено: ${quoted(choiceWords(event.choice, ctx.card))}.`;
    case "card_own_move":
      return `${who(event.actor)} предлагает своё: «${event.words}» (${SKILLS_RU[event.skill]}).`;
    case "own_move_ran":
      return event.roll ? `Своё дело ведёт к выбору: ${choiceWords(event.choice, ctx.card)}.` : `Предложивший без сознания, и без броска выходит: ${choiceWords(event.choice, ctx.card)}.`;
    case "cargo_changed":
      return event.change >= 0 ? `Обоз получает: ${n.good(event.good)}, ${event.change}.` : `Обоз теряет: ${n.good(event.good)}, ${-event.change}.`;
    case "xp_awarded":
      return you(event.actor)
        ? `Вы получаете ${event.xp} опыта, всего ${event.total}${event.can_level_up ? ": хватает на следующий уровень" : ""}.`
        : `${who(event.actor)} получает ${event.xp} опыта.`;
    case "leveled_up":
      return `${who(event.actor)} достигает ${event.level}-го уровня.`;
    case "time_lost":
      return `Отряд теряет ${durationRu(event.minutes, "accusative")}.`;
    case "time_passed":
      return `Проходит ${durationRu(event.minutes, "nominative")}. День ${event.clock.day}, ${WATCH_RU[event.clock.watch]}.`;
    case "trip_to_start":
      return event.days === 0
        ? `Новый подряд начинается там, где кончился прошлый: ${n.place(event.from)}.`
        : `Отряд идёт ${plural(event.days, "день", "дня", "дней")} от места «${n.place(event.from)}» к началу нового подряда.`;
    case "scout_ahead":
      return `${who(event.actor)} идёт впереди обоза разведчиком.`;
    case "scout_looked":
      return event.saw ? `${who(event.actor)} замечает, что ждёт впереди.` : `${who(event.actor)} смотрит вперёд, но ничего не замечает.`;
    case "escort_settled":
      return `Обоз прибыл: ${n.place(event.destination)}. Наёмникам заплачено, что положено.`;
  }
}

function everyone(participants: readonly Handle[], ctx: SeatContext): boolean {
  return ctx.party !== undefined && ctx.party.length > 1 && ctx.party.every((h) => participants.includes(h));
}

/** Card words in the seat's quotes, unless the own move is already quoted. */
function quoted(text: string): string {
  return text.startsWith("«") ? text : `«${text}»`;
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** A choice's words on the card it belongs to; an own move reads as the player's words. */
function choiceWords(choice: string, card: CardOnSeat | undefined): string {
  if (choice === "own_move" && card?.ownMove) return `«${card.ownMove}»`;
  // The line ends the sentence itself: "Pay him and cross." reads "advises: Pay him and cross."
  return (card?.choices.get(choice) ?? choice).replace(/[.!]$/, "");
}

/** The d20 a check or an attack kept, and the other one under Advantage or Disadvantage. */
function d20(roll: RollView): { kept: number; other?: number } | undefined {
  const die = roll.dice.find((d) => d.dice.endsWith("d20"));
  if (!die) return undefined;
  const other = die.results.length > 1 ? die.results.find((r, i) => r !== die.kept || die.results.indexOf(die.kept) !== i) : undefined;
  return { kept: die.kept, ...(other !== undefined ? { other } : {}) };
}

const SKILL_BY_TITLE = new Map<string, Skill>((Object.keys(SKILLS_RU) as Skill[]).map((s) => [titled(s), s]));
const ABILITIES: readonly Ability[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

/** The skill and the ability a roll's label names: "a Strength (Athletics) check". */
function labelled(label: string): { skill?: Skill; ability?: Ability } {
  const skill = /\(([^)]+)\)/.exec(label)?.[1];
  const ability = ABILITIES.find((a) => label.includes(titled(a)));
  return { ...(skill && SKILL_BY_TITLE.has(skill) ? { skill: SKILL_BY_TITLE.get(skill)! } : {}), ...(ability ? { ability } : {}) };
}

/**
 * A check, outcome first (design §4): "Bren, Athletics: it worked. The die shows 10, 13 with the
 * skill." No target number, as before; the seat adds the roll id last.
 */
function checkEn(roll: RollView, n: SeatNames): string {
  const { skill, ability } = labelled(roll.label);
  const what = skill ? titled(skill) : ability ? titled(ability) : roll.label;
  const die = d20(roll);
  const outcome = roll.outcome === "success" ? "it worked" : "it didn't work";
  const dice = die ? ` The die shows ${die.kept}${die.other !== undefined ? ` (of two: ${die.kept} and ${die.other})` : ""}, ${roll.total} with the ${skill ? "skill" : "ability"}.` : ` ${roll.total} in all.`;
  return `${n.person(roll.roller)}, ${what}: ${outcome}.${dice}`;
}

function rollRu(roll: RollView, n: SeatNames, human: Handle | undefined): string {
  const who = n.person(roll.roller);
  const die = d20(roll);
  const dieWords = die ? `На кости ${die.kept}${die.other !== undefined ? ` (из двух: ${die.kept} и ${die.other})` : ""}` : "";
  switch (roll.kind) {
    case "skill_check":
    case "ability_check": {
      const { skill, ability } = labelled(roll.label);
      const what = skill ? SKILLS_RU[skill] : ability ? `проверка: ${ABILITY_RU[ability]}` : "проверка";
      return `${who}, ${what}: ${roll.outcome === "success" ? "вышло" : "не вышло"}. ${dieWords ? `${dieWords}, ${skill ? "с навыком" : "всего"} ${roll.total}.` : `Всего ${roll.total}.`}`;
    }
    case "saving_throw": {
      const { ability } = labelled(roll.label);
      return `${who} ${ability ? `пытается устоять (${ABILITY_RU[ability]})` : "пытается устоять"}: ${roll.outcome === "success" ? "вышло" : "не вышло"}. ${dieWords ? `${dieWords}, всего ${roll.total}.` : `Всего ${roll.total}.`}`;
    }
    case "attack": {
      const target = roll.target ? ` (${n.who(roll.target)})` : "";
      const outcome = roll.outcome === "critical_hit" ? "точное попадание!" : roll.outcome === "hit" ? "попал" : "мимо";
      return `${who} бьёт${target}: ${outcome}. ${dieWords ? `${dieWords}, всего ${roll.total}.` : `Всего ${roll.total}.`}`;
    }
    case "initiative":
      return `${who}, порядок в бою: ${roll.total}.`;
    case "damage":
      return `${who}, урон: ${roll.total}.`;
    case "healing":
      return `${who}, лечение: ${roll.total}.`;
    case "death_save":
      return `${roll.roller === human ? "Вы боретесь" : `${who} борется`} со смертью: ${roll.outcome === "success" ? "держится" : "слабеет"}. ${dieWords || `Всего ${roll.total}`}.`;
    case "table":
      return `${who}, жребий: ${roll.total}.`;
  }
}

function ledgerRu(event: Extract<Event, { kind: "ledger" }>, n: SeatNames, human: Handle | undefined): string {
  const goods = event.what.kind === "coins" ? coinsRu(event.what.copper) : `${n.thing(event.what.item, titled(event.what.item))}${event.what.quantity > 1 ? `, ${event.what.quantity}` : ""}`;
  const from = n.person(event.from);
  const to = n.person(event.to);
  if (event.to === human) {
    switch (event.reason) {
      case "wage":
        return `Вам платят жалованье: ${goods}.`;
      case "loot":
      case "theft":
        return `Вы забираете: ${goods}.`;
      case "reward":
        return `Вам дают награду: ${goods}.`;
      default:
        return event.from.includes(":") ? `Вы получаете: ${goods}.` : `${from} даёт вам: ${goods}.`;
    }
  }
  if (event.from === human) {
    switch (event.reason) {
      case "inn":
        return `Вы платите за постой: ${goods}.`;
      case "toll":
        return `Вы платите пошлину: ${goods}.`;
      case "loot":
      case "theft":
        return event.to.includes(":") ? `Вы теряете: ${goods}.` : `${to} забирает ваше: ${goods}.`;
      default:
        return event.to.includes(":") ? `Вы платите: ${goods}.` : `Вы отдаёте: ${goods}; берёт ${n.who(event.to)}.`;
    }
  }
  switch (event.reason) {
    case "wage":
      return `${to} получает жалованье: ${goods}. Платит ${n.who(event.from)}.`;
    case "toll":
      return `${from} платит пошлину: ${goods}.`;
    case "inn":
      return `${from} платит за постой: ${goods}.`;
    case "loot":
      return `${to} забирает добычу: ${goods}.`;
    case "theft":
      return `${to} тайком забирает: ${goods}. Обокраден: ${n.who(event.from)}.`;
    case "reward":
      return `${to} получает награду: ${goods}.`;
    case "trade":
      return `${from} отдаёт: ${goods}; берёт ${n.who(event.to)}.`;
  }
}

/** Coins in Russian: «2 золотых, 5 серебряных». */
export function coinsRu(copper: number): string {
  const parts = (
    [
      [Math.floor(copper / 100), "золотой", "золотых"],
      [Math.floor((copper % 100) / 10), "серебряный", "серебряных"],
      [copper % 10, "медный", "медных"],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => plural(count, one, many, many));
  return parts.length > 0 ? parts.join(", ") : "ничего";
}

/** Coins in English, as the engine says them: "2 gold pieces", "1 gold, 5 silver pieces". */

function miles(count: number): string {
  return plural(count, "милю", "мили", "миль");
}

const NUMBERS_EN = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Time in English words (decision 0038's number words): "twenty minutes", "four hours", "an hour and a half". */
export function durationEn(minutes: number): string {
  if (minutes < 60) {
    if (minutes === 30) return "half an hour";
    const tens = ["", "ten", "twenty", "thirty", "forty", "fifty"];
    return minutes % 10 === 0 ? `${tens[minutes / 10]} minutes` : `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? "an hour" : `${NUMBERS_EN[hours] ?? hours} hours`;
  if (rest === 0) return h;
  if (rest === 30) return hours === 1 ? "an hour and a half" : `${h} and a half`;
  return `${h} and ${durationEn(rest)}`;
}

const HOURS_RU = ["", "час", "два часа", "три часа", "четыре часа", "пять часов", "шесть часов", "семь часов", "восемь часов", "девять часов", "десять часов", "одиннадцать часов", "двенадцать часов"];
const MINUTES_RU: Record<number, { nominative: string; accusative: string }> = {
  10: { nominative: "десять минут", accusative: "десять минут" },
  15: { nominative: "четверть часа", accusative: "четверть часа" },
  20: { nominative: "двадцать минут", accusative: "двадцать минут" },
  30: { nominative: "полчаса", accusative: "полчаса" },
  40: { nominative: "сорок минут", accusative: "сорок минут" },
  45: { nominative: "три четверти часа", accusative: "три четверти часа" },
  50: { nominative: "пятьдесят минут", accusative: "пятьдесят минут" },
};

/** Time in Russian words: «двадцать минут», «четыре часа», «полтора часа». */
export function durationRu(minutes: number, grammatical: "nominative" | "accusative"): string {
  if (minutes < 60) return MINUTES_RU[minutes]?.[grammatical] ?? plural(minutes, "минута", "минуты", "минут").replace(/минута$/, grammatical === "accusative" ? "минуту" : "минута");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 1 && rest === 30) return "полтора часа";
  const h = HOURS_RU[hours] ?? plural(hours, "час", "часа", "часов");
  if (rest === 0) return h;
  if (rest === 30) return `${h} с половиной`;
  return `${h} и ${durationRu(rest, grammatical)}`;
}

/** Each watch of the day, as the seat says it. */
export const WATCH_RU: Record<Watch, string> = {
  small_hours: "глухая ночь",
  dawn: "рассвет",
  morning: "утро",
  afternoon: "день",
  evening: "вечер",
  night: "ночь",
};

export const ABILITY_RU: Record<Ability, string> = {
  strength: "Сила",
  dexterity: "Ловкость",
  constitution: "Выносливость",
  intelligence: "Интеллект",
  wisdom: "Мудрость",
  charisma: "Обаяние",
};

const DAMAGE_RU: Record<DamageType, string> = {
  acid: "кислота",
  bludgeoning: "дробящий удар",
  cold: "холод",
  fire: "огонь",
  force: "чистая сила",
  lightning: "молния",
  necrotic: "тьма",
  piercing: "колющий удар",
  poison: "яд",
  psychic: "удар по разуму",
  radiant: "свет",
  slashing: "рубящий удар",
  thunder: "гром",
};

/** Each condition's line when it starts and ends; its name is `CONDITION_NAMES_RU` (words.ts). */
export const CONDITIONS_RU: Record<Condition, { on: string; off: string }> = {
  blinded: { on: "ничего не видит", off: "снова видит" },
  charmed: { on: "под чарами", off: "больше не под чарами" },
  deafened: { on: "ничего не слышит", off: "снова слышит" },
  frightened: { on: "в страхе", off: "больше не в страхе" },
  grappled: { on: "в захвате", off: "вырывается из захвата" },
  incapacitated: { on: "не может действовать", off: "снова может действовать" },
  invisible: { on: "исчезает из виду", off: "снова на виду" },
  paralyzed: { on: "не может пошевелиться", off: "снова может двигаться" },
  petrified: { on: "обращается в камень", off: "снова из плоти" },
  poisoned: { on: "страдает от яда", off: "больше не страдает от яда" },
  prone: { on: "падает на землю", off: "поднимается на ноги" },
  restrained: { on: "в путах", off: "освобождается от пут" },
  stunned: { on: "в оглушении, не может действовать", off: "приходит в себя" },
  unconscious: { on: "без сознания", off: "приходит в себя" },
};

const CONCENTRATION_RU: Record<Extract<Event, { kind: "concentration_ended" }>["reason"], string> = {
  replaced: ": берётся за другое",
  failed_save: ": сбит удар",
  incapacitated: ": без сил",
  expired: ": время вышло",
  ended: "",
};
