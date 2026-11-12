// The seat's own words, in the run's language (Milestone 12, design §1.6, §3): the lines the table
// itself writes for the human's seat, never the DM's or the engine's. AGT-99 starts it with the own
// move and the card's prompt; AGT-98 moves the rest of the seat's strings here.
import type { Condition, ErrorCode, HealthBand, LifeState, RejectReason, Side, Skill } from "@nat20-table/engine-client";
import type { Language } from "../agents/language.ts";
import type { StopKind } from "./types.ts";
import { titled } from "../view.ts";
import { plural } from "./plural.ts";

/** The table's own lines at the seat (AGT-98): titles, prompts, status lines, the end. */
export interface TableWords {
  passedOverTitle: string;
  passedOver(scene: string, next: string): string;
  journeyEnd: string;
  lastTurn(place: string): string;
  contractDone(place: string): string;
  earned(wages: string | undefined, xp: number | undefined): string;
  enoughXp: string;
  moreXp(points: number): string;
  partyKept: string;
  onTheRoad: string;
  yourCaravan: string;
  merchantDecides: string;
  bladesDecide: string;
  noSuchNumber: string;
  saidAtTable: string;
  levelUp: string;
  levelUpHint: string;
  levelTitle(level: number, label: string, more: number | undefined): string;
  levelUpLine(level: number): string;
  pickRange(count: number): string;
  yourTurn: string;
  nothingToReact: string;
  pickOrSay: string;
  sayOrOptions: string;
  noSuchOnList(number: number): string;
  stoppedShort: string;
  /** A walk that ran out of movement: how far it went, and who it provoked. */
  movedShort(feet: number, provoked: string): string;
  notAccepted: string;
  /** A refusal with no engine reason: the table is not taking that now. */
  notNow: string;
  notUnderstood: string;
  notUnderstoodText: string;
  noSuchReaction: string;
  noSuchReactionText(number: number, count: number): string;
  surrender: string;
  acceptSurrender(names: string): string;
  fightOn: string;
  surrenderHint: string;
  theNight: string;
  theRoad: string;
  notYet: string;
  pickOrEnter(count: number): string;
  sheet: string;
  where: string;
  map: string;
  noMap: string;
  options: string;
  notYourTurn: string;
  optionsHint: string;
  noOptions: string;
  log: string;
  usage: string;
  paused: string;
  pausedStatus: string;
  resumed: string;
  pausedOnly: string;
  pausedWait: string;
  suggestOn: string;
  suggestOff: string;
  /** The run's end, from why it ended and how it stopped. */
  ended(reason: string, stop: StopKind | undefined): string;
}

export interface SeatWords extends TableWords {
  /** The card's last line, unnumbered: a player may answer in their own words. */
  ownMoveLine: string;
  /** The card list's heading. */
  choicesTitle: string;
  /** The card's prompt line. A card takes no Enter (AGT-101). */
  cardPrompt: string;
  /** The end of the line Enter takes, on the level-up and road lists. */
  marked: string;
  /** After the choice most of the others gave. */
  othersChoice: string;
  /** An own move on the card, as a numbered choice: in the words the player said, with the skill it takes. */
  ownMoveChoice(mine: boolean, name: string, words: string, skill: Skill): string;
  /** After words a card took no move from: the card still waits. */
  stillWaits(count: number): string;
  /** The fight's move pick, its line and the walk to a creature or a place (AGT-98). */
  moveMenu: string;
  endTurn: string;
  /** A side as the move pick names a creature's. */
  side: Record<Side, string>;
  feet(ft: number): string;
  nextTo(name: string): string;
  toPlace(name: string): string;
  /** A walk this turn's movement doesn't finish. */
  stopsShort(ft: number): string;
  move(where: string, about: string): string;
  dashMove(where: string, about: string): string;
  /** A target to walk to first. */
  walk: string;
  anotherTarget: string;
  /** An area aim and who it catches. */
  aimAt(option: string, at: string, catches: string): string;
  /** The road's own lines (AGT-80). */
  takeRoad(to: string, miles: number): string;
  takeRoadFast(to: string, miles: number): string;
  unexplored(miles: number): string;
  unexploredFast(miles: number): string;
  moveOn: string;
  pushOn(to: string | undefined): string;
  makeCamp: string;
  takeRooms: string;
  scout: string;
  /** The level-up list's first line, which Enter takes. */
  recommended(names: string): string;
}

/** Each skill in Russian, as the seat says it. */
export const SKILLS_RU: Record<Skill, string> = {
  acrobatics: "Акробатика",
  animal_handling: "Уход за животными",
  arcana: "Магия",
  athletics: "Атлетика",
  deception: "Обман",
  history: "История",
  insight: "Проницательность",
  intimidation: "Запугивание",
  investigation: "Анализ",
  medicine: "Медицина",
  nature: "Природа",
  perception: "Внимательность",
  performance: "Выступление",
  persuasion: "Убеждение",
  religion: "Религия",
  sleight_of_hand: "Ловкость рук",
  stealth: "Скрытность",
  survival: "Выживание",
};

export const SEAT_WORDS: Record<Language, SeatWords> = {
  en: {
    ownMoveLine: "Something else: say it in your own words.",
    choicesTitle: "Choices",
    cardPrompt: "A choice's number, or your own words.",
    marked: "(Enter)",
    othersChoice: "(the others' choice)",
    ownMoveChoice: (mine, name, words, skill) => `${mine ? "Your move" : `${name}'s move`}: "${words}" (${titled(skill)})`,
    stillWaits: (count) => `The road still waits for your word: a choice, 1 to ${count}, or your own words.`,
    moveMenu: "Move…",
    endTurn: "End turn",
    side: { party: "party", hostile: "hostile", neutral: "neutral" },
    feet: (ft) => `${ft} ft`,
    nextTo: (name) => `next to ${name}`,
    toPlace: (name) => `to ${name}`,
    stopsShort: (ft) => `; ${ft} ft this turn, stops short`,
    move: (where, about) => `Move ${where} (${about})`,
    dashMove: (where, about) => `Dash, then move ${where} (${about})`,
    walk: " (walk)",
    anotherTarget: ", another target",
    aimAt: (option, at, catches) => `${option} at ${at}: catches ${catches}`,
    takeRoad: (to, miles) => `Take the road to ${to} (${miles} miles)`,
    takeRoadFast: (to, miles) => `Take the road to ${to} at a fast pace, there today (${miles} miles)`,
    unexplored: (miles) => `Take an unexplored road (${miles} miles)`,
    unexploredFast: (miles) => `Take an unexplored road at a fast pace, to its end today (${miles} miles)`,
    moveOn: "Move on with the caravan",
    pushOn: (to) => (to ? `Push on at a fast pace to reach ${to} today` : "Push on at a fast pace to reach the road's end today"),
    makeCamp: "Make camp for the night",
    takeRooms: "Take rooms at the inn for the night",
    scout: "Walk ahead as the scout",
    recommended: (names) => `Take the recommended: ${names} (Enter)`,

    passedOverTitle: "Passed over",
    passedOver: (scene, next) => `This run doesn't play ${scene}: the party goes on to ${next}.`,
    journeyEnd: "Journey's end",
    lastTurn: (place) => `The contract is done. You have one last turn in ${place} before the story rests.`,
    contractDone: (place) => `The escort contract to ${place} is done.`,
    earned: (wages, xp) => `On this journey you earned ${[...(wages ? [`${wages} in wages`] : []), ...(xp ? [`${xp} experience`] : [])].join(" and ")}.`,
    enoughXp: "You have enough experience for your next level.",
    moreXp: (points) => `${points} more experience brings your next level.`,
    partyKept: "Your party is kept for the next journey.",
    onTheRoad: "On the road",
    yourCaravan: "The caravan is yours: you make the call, with the Blades' advice.",
    merchantDecides: "The merchant decides; your word is advice.",
    bladesDecide: "The Blades decide together.",
    noSuchNumber: "No such number",
    saidAtTable: "Said at the table",
    levelUp: "Level up",
    levelUpHint: "Pick a number, or press Enter for the recommended choice.",
    levelTitle: (level, label, more) => `Level ${level}: ${label}${more !== undefined ? ` (pick ${more} more)` : ""}`,
    levelUpLine: (level) => `Level up to level ${level}`,
    pickRange: (count) => `Pick 1 to ${count}.`,
    yourTurn: "Your turn: pick a number from the list, or say what you do.",
    nothingToReact: "Nothing to react to",
    pickOrSay: "Pick a number from the list, or say what you do.",
    sayOrOptions: "Say what you do, or type /options.",
    noSuchOnList: (number) => `There is no ${number} on the list. Type /options to see it again.`,
    stoppedShort: "Stopped short",
    movedShort: (feet, provoked) => `You moved ${feet} ft; stopped short, as far as movement goes: not there yet${provoked ? `; provoked ${provoked}` : ""}.`,
    notAccepted: "Not accepted",
    notNow: "Not now: the table is waiting on something else.",
    notUnderstood: "Not understood",
    notUnderstoodText: "I didn't get that; pick from /options.",
    noSuchReaction: "No such reaction",
    noSuchReactionText: (number, count) => `There is no reaction ${number}. Answer y or n, or ${count <= 2 ? Array.from({ length: count }, (_, i) => i + 1).join(" or ") : `1 to ${count}`}.`,
    surrender: "Surrender",
    acceptSurrender: (names) => `Accept the surrender of ${names}`,
    fightOn: "Fight on",
    surrenderHint: "Pick 1 or 2, or say what you do.",
    theNight: "The night",
    theRoad: "The road",
    notYet: "Not yet",
    pickOrEnter: (count) => `Pick 1 to ${count}, or press Enter for the marked one.`,
    sheet: "Sheet",
    where: "Where",
    map: "Map",
    noMap: "There is no map here: this adventure is not on the road.",
    options: "Options",
    notYourTurn: "It isn't your turn.",
    optionsHint: "Pick a number, or say what you do: the DM offers the rest.",
    noOptions: "No options now.",
    log: "Log",
    usage: "Usage",
    paused: "Paused",
    pausedStatus: "Paused: AI players wait until /pause again.",
    resumed: "Resumed.",
    pausedOnly: "Only commands while paused; /pause goes on.",
    pausedWait: "Paused. Type /pause to go on.",
    suggestOn: "Suggestions on: three moves out of a fight.",
    suggestOff: "Suggestions off. /suggest turns them on again.",
    ended: (reason) => reason,
  },
  ru: {
    ownMoveLine: "Или что-то своё: скажите своими словами.",
    choicesTitle: "Выборы",
    cardPrompt: "Номер выбора или своими словами.",
    marked: "(Enter)",
    othersChoice: "(выбор остальных)",
    ownMoveChoice: (mine, name, words, skill) => `${mine ? "Ваш ход" : `${name} предлагает`}: «${words}» (${SKILLS_RU[skill]})`,
    stillWaits: (count) => `Дорога всё ещё ждёт вашего слова: выбор от 1 до ${count} или своими словами.`,
    moveMenu: "Идти…",
    endTurn: "Закончить ход",
    side: { party: "свой", hostile: "враг", neutral: "не враг" },
    feet: (ft) => plural(ft, "фут", "фута", "футов"),
    nextTo: (name) => `Подойти: ${name}`,
    toPlace: (name) => `Идти: ${name}`,
    stopsShort: (ft) => `; за ход только ${plural(ft, "фут", "фута", "футов")}, не дойдёте`,
    move: (where, about) => `${where} (${about})`,
    dashMove: (where, about) => `Рывок, потом ${where.charAt(0).toLowerCase()}${where.slice(1)} (${about})`,
    walk: " (подойти)",
    anotherTarget: ", другая цель",
    aimAt: (option, at, catches) => `${option}: ${at}, заденет: ${catches}`,
    takeRoad: (to, miles) => `Дорога: ${to} (${plural(miles, "миля", "мили", "миль")})`,
    takeRoadFast: (to, miles) => `Дорога: ${to}, быстрым шагом, сегодня там (${plural(miles, "миля", "мили", "миль")})`,
    unexplored: (miles) => `Неизведанная дорога (${plural(miles, "миля", "мили", "миль")})`,
    unexploredFast: (miles) => `Неизведанная дорога быстрым шагом, сегодня до её конца (${plural(miles, "миля", "мили", "миль")})`,
    moveOn: "Идти дальше с обозом",
    pushOn: (to) => (to ? `Прибавить шагу, чтобы сегодня дойти: ${to}` : "Прибавить шагу, чтобы сегодня дойти до конца дороги"),
    makeCamp: "Встать лагерем на ночь",
    takeRooms: "Снять комнаты на постоялом дворе",
    scout: "Идти впереди разведчиком",
    recommended: (names) => `Взять предложенное: ${names} (Enter)`,

    passedOverTitle: "Сцена пропущена",
    passedOver: () => "Эту сцену прогон не играет: отряд идёт дальше.",
    journeyEnd: "Конец пути",
    lastTurn: (place) => `Подряд выполнен. У вас ещё один ход здесь (${place}), и на этом история пока остановится.`,
    contractDone: (place) => `Подряд на охрану обоза выполнен: обоз дошёл (${place}).`,
    earned: (wages, xp) => `За этот путь вы заработали: ${[...(wages ? [`${wages} жалованья`] : []), ...(xp ? [`${xp} опыта`] : [])].join(" и ")}.`,
    enoughXp: "Опыта хватает на следующий уровень.",
    moreXp: (points) => `До следующего уровня ещё ${points} опыта.`,
    partyKept: "Отряд сохранён для следующего пути.",
    onTheRoad: "В пути",
    yourCaravan: "Обоз ваш: решаете вы, наёмники советуют.",
    merchantDecides: "Решает хозяин обоза, а ваше слово будет советом.",
    bladesDecide: "Наёмники решают вместе.",
    noSuchNumber: "Такого номера нет",
    saidAtTable: "Сказано за столом",
    levelUp: "Новый уровень",
    levelUpHint: "Выберите номер или нажмите Enter, чтобы взять предложенное.",
    levelTitle: (level, label, more) => `Уровень ${level}: ${label}${more !== undefined ? ` (выбрать ещё ${more})` : ""}`,
    levelUpLine: (level) => `Перейти на уровень ${level}`,
    pickRange: (count) => `Выберите номер от 1 до ${count}.`,
    yourTurn: "Ваш ход: выберите номер из списка или скажите, что делаете.",
    nothingToReact: "Нечего выбирать",
    pickOrSay: "Выберите номер из списка или скажите, что делаете.",
    sayOrOptions: "Скажите, что делаете, или наберите /options.",
    noSuchOnList: (number) => `В списке нет номера ${number}. Наберите /options, чтобы увидеть его снова.`,
    stoppedShort: "Не дошли",
    movedShort: (feet, provoked) => `Вы прошли ${plural(feet, "фут", "фута", "футов")}, и шаги на этот ход кончились: до цели ещё не дошли${provoked ? `. Вслед вам может ударить: ${provoked}` : ""}.`,
    notAccepted: "Не принято",
    notNow: "Сейчас нельзя: стол ждёт другого.",
    notUnderstood: "Не понято",
    notUnderstoodText: "Не понял вас; выберите из /options.",
    noSuchReaction: "Такого ответа нет",
    noSuchReactionText: (number, count) => `Ответа ${number} нет. Скажите «да» или «нет» или выберите ${count <= 2 ? Array.from({ length: count }, (_, i) => i + 1).join(" или ") : `от 1 до ${count}`}.`,
    surrender: "Сдача",
    acceptSurrender: (names) => `Принять сдачу: ${names}`,
    fightOn: "Биться дальше",
    surrenderHint: "Выберите 1 или 2 или скажите, что делаете.",
    theNight: "Ночь",
    theRoad: "Дорога",
    notYet: "Не сейчас",
    pickOrEnter: (count) => `Выберите номер от 1 до ${count} или нажмите Enter для отмеченного.`,
    sheet: "Лист персонажа",
    where: "Где вы",
    map: "Карта",
    noMap: "Здесь нет карты: это приключение не в дороге.",
    options: "Что можно сделать",
    notYourTurn: "Сейчас не ваш ход.",
    optionsHint: "Выберите номер или скажите, что делаете: остальное предложит ведущий.",
    noOptions: "Сейчас выбирать нечего.",
    log: "Последние события",
    usage: "Расход",
    paused: "Пауза",
    pausedStatus: "Пауза: игроки за столом ждут, пока вы снова не наберёте /pause.",
    resumed: "Игра идёт дальше.",
    pausedOnly: "На паузе только команды; /pause продолжает игру.",
    pausedWait: "Пауза. Наберите /pause, чтобы продолжить.",
    suggestOn: "Подсказки включены: три хода вне боя.",
    suggestOff: "Подсказки выключены. /suggest включает их снова.",
    ended: (reason, stop) => endedRu(reason, stop),
  },
};

/** Why the run ended, in Russian: the table's own reasons, by how the run stopped. */
function endedRu(reason: string, stop: StopKind | undefined): string {
  switch (stop) {
    case "time_limit":
      return "вышло время игры";
    case "stalled":
      return "история перестала двигаться";
    case "usage_limit":
      return "кончился лимит подписки";
    case "login":
      return "нужно снова войти в учётную запись";
    case "offline":
      return "пропала связь";
    case "operator":
      return "вы вышли из игры";
    case "crash":
      return "сбой программы; всё сыгранное сохранено";
    case undefined:
      if (/escort contract is done/.test(reason)) return "подряд выполнен, обоз дошёл";
      if (/adventure is over/.test(reason)) return "приключение окончено";
      if (/day limit/.test(reason)) return "последний день игры прошёл";
      if (/stops before/.test(reason)) return "игра кончается перед следующей сценой";
      return "игра окончена";
  }
}

/** Why the engine refused a pick, in Russian (AGT-98): one line per reason, so a new reason fails `tsc`. */
const REFUSED_RU: Record<RejectReason, string> = {
  out_of_range: "Слишком далеко: отсюда не достать.",
  no_valid_target: "Сейчас не по кому.",
  invalid_target: "Эта цель не подходит.",
  insufficient_resource: "На это не осталось сил или зарядов.",
  action_already_used: "На это в этот ход уже нет времени.",
  condition_prevents: "Ваше состояние сейчас не даёт это сделать.",
  not_known: "Ваш персонаж этого не умеет.",
  needs_target: "Нужно выбрать цель.",
  needs_point: "Нужно выбрать место.",
  needs_variant: "Нужно выбрать, как именно.",
  no_path: "Туда не пройти.",
  already_attempted: "Это уже пробовали; второй раз так же не выйдет.",
  condition_not_met: "Сейчас для этого нет повода.",
  automatic: "Это и так выйдет само.",
  already_spawned: "Это уже случилось.",
  not_proficient: "Ваш персонаж в этом не обучен.",
  no_item_left: "Этого больше не осталось.",
  area_empty: "Там никого нет.",
  not_carried: "У вас этого нет с собой.",
  insufficient_funds: "Не хватает денег.",
  not_fallen: "Он не упал: так нельзя.",
  nothing_carried: "У него ничего нет.",
  no_room: "Места не хватит.",
  not_driver: "Обоз ведёте не вы.",
  no_road: "Отсюда туда нет дороги.",
  pace_too_fast: "Так быстро по этой дороге не пройти.",
  day_over: "На сегодня дорога кончена: пора на ночлег.",
  overloaded: "Обоз этого не увезёт.",
  no_inn: "Здесь нет постоялого двора.",
  card_pending: "Сначала нужно решить, что делать на дороге.",
  no_card: "Сейчас решать на дороге нечего.",
  card_not_offered: "Этого сейчас не предлагают.",
  no_say: "Здесь не ваше слово.",
  already_spoke: "Вы уже сказали своё слово.",
  waiting_for_advice: "Сначала слово за наёмниками.",
  unknown_choice: "Такого выбора нет.",
  not_enough_xp: "Опыта на новый уровень пока мало.",
  level_up_open: "Сначала закончите выбор нового уровня.",
  no_level_up: "Сейчас нового уровня нет.",
  night_falls: "Темнеет: пора вставать на ночлег.",
  bad_picks: "Выберите столько, сколько просят.",
  own_move_taken: "Своё уже предложили.",
  bad_own_move: "Так своё не предложить.",
};

const ERROR_RU: Record<ErrorCode, string> = {
  bad_request: "Стол не понял этот ход.",
  unsupported_version: "Стол и движок разных версий.",
  no_session: "Игра ещё не началась.",
  no_scene: "Сцена ещё не началась.",
  unknown_creature: "Такого здесь нет.",
  unknown_option: "Такого хода нет.",
  unknown_check: "Такой проверки нет.",
  unknown_anchor: "Такого места здесь нет.",
  unknown_spawn: "Такого здесь нет.",
  unknown_encounter: "Такой встречи нет.",
  unknown_stat_block: "Такого существа нет.",
  no_campaign: "Это приключение не в дороге.",
  not_your_turn: "Сейчас не ваш ход.",
  stale_prompt: "Этот выбор уже прошёл.",
  not_visible: "Вы этого не видите.",
  wrong_mode: "Сейчас так нельзя: не тот момент.",
  rejected: "Так нельзя.",
  surrender_not_available: "Сдаваться сейчас некому.",
  not_implemented: "Этого стол пока не умеет.",
  bad_scene: "Со сценой что-то не так.",
  bad_roster: "С сохранённым отрядом что-то не так.",
  internal: "Внутренняя ошибка стола.",
};

/** A refusal at a Russian seat: the reason's line, else the code's. */
export function refusedRu(code: ErrorCode | undefined, reason: RejectReason | undefined): string {
  return (reason ? REFUSED_RU[reason] : undefined) ?? (code ? ERROR_RU[code] : undefined) ?? "Так нельзя.";
}

/** The terminal seat's own words (AGT-98): labels, prompt hints, the help, the panel, the header. */
export interface UiWords {
  dm: string;
  toYou: string;
  /** Speech to someone: " to you", " to Torva". */
  speechTo(name: string | undefined): string;
  dmAsks: string;
  reaction: string;
  notAccepted: string;
  runOver: string;
  sceneOf(number: number, of: number): string;
  minutes(count: number): string;
  commandHelp: Record<"options" | "sheet" | "where" | "map" | "log" | "usage" | "pause" | "suggest" | "panel" | "help" | "quit", string>;
  noCommand(name: string, commands: string): string;
  busy: string;
  pausedTyped: string;
  answerYesNo: string;
  hint: {
    combatTurn(name: string): string;
    reaction: string;
    explore(name: string): string;
    answer: string;
    pick: string;
    paused: string;
    surrender: string;
    card: string;
    levelUp: string;
    road: string;
  };
  help: string;
  helpText(commands: ReadonlyArray<readonly [string, string]>): string;
  answeredLater: string;
  stopping: string;
  /** The wait in the input row: who the table waits on, and where the commands are. */
  wait(who: string | undefined, seconds: number | undefined): string;
  dmThinking: string;
  thinking(name: string): string;
  suggestHint: string;
  yourOwn: string;
  tooSmall: string;
  pausedBlock: string;
  finaleHint: string;
  enterPlays(line: string): string;
  overlayKeys(name: string, scroll: boolean, fresh: number): string;
  fresh(count: number): string;
  pickerTitle: string;
  /** The story's line when the table stops early, with why. */
  stoppingFor(why: string): string;
  /** Why: the run's time limit. */
  timeLimit(minutes: number): string;
  /** The situation panel's title as an overlay. */
  panelTitle: string;
  /** The input row while the engine starts. */
  engineStarting: string;
  /** The picker's one row when nothing matches the draft. */
  noCommandStarts(draft: string): string;
  /** How many commands the picker shows of how many match, when some are cut. */
  pickerCount(shown: number, total: number): string;
  suggestQuestion: { answer(name: string): string; surrender(name: string): string; other(name: string): string };
  panel: {
    explore: string;
    paused: string;
    party: string;
    round(n: number): string;
    yourTurn: string;
    turnOf(name: string): string;
    upIn(n: number): string;
    next(names: string): string;
    stale: string;
    more(n: number): string;
    fallen(names: string): string;
    hp(hp: number, max: number): string;
    temp(n: number): string;
    concentrating(spell: string): string;
    inReach: string;
    feet(n: number): string;
    sides: Record<Side, string>;
    health: Record<HealthBand, string>;
    condition(c: Condition): string;
    life(state: LifeState): string;
    used: string;
    free: string;
    left(n: number): string;
    action: string;
    bonusAction: string;
    reactionWord: string;
    movementLeft(left: number, speed: number): string;
    slot(level: number): string;
    moveCard: string;
    endTurnCard: string;
  };
}

const ru = (n: number, one: string, few: string, many: string) => plural(n, one, few, many);

export const UI_WORDS: Record<Language, UiWords> = {
  en: {
    dm: "DM",
    toYou: " (to you)",
    speechTo: (name) => (name === undefined ? " to you" : ` to ${name}`),
    dmAsks: "DM asks you",
    reaction: "Reaction",
    notAccepted: "Not accepted",
    runOver: "The run is over",
    sceneOf: (number, of) => `Scene ${number} of ${of}`,
    minutes: (count) => `${count} min`,
    commandHelp: {
      options: "your numbered options now",
      sheet: "your character sheet",
      where: "places and the creatures you can see, with distances",
      map: "the places you know, the roads, and where the caravan is",
      log: "the last engine lines, with their roll ids",
      usage: "tokens and API-equivalent cost so far, per agent",
      pause: "AI players wait until you type /pause again",
      suggest: "turn the three suggested moves out of a fight off or on",
      panel: "fold the situation panel to one line, or open it again",
      help: "every command and key",
      quit: "end the run (the run folder keeps everything so far)",
    },
    noCommand: (name, commands) => `There is no /${name}. Commands: ${commands}`,
    busy: "The table is busy: wait for your prompt. A command typed now is answered when it comes.",
    pausedTyped: "Paused: only commands until /pause again.",
    answerYesNo: "Answer y or n (да or нет), or the number of a reaction.",
    hint: {
      combatTurn: (name) => `Your turn: an option number, or what ${name} does in words. /options lists them again.`,
      reaction: "React? y or n (or the reaction's number).",
      explore: (name) => `What does ${name} do or say? Words, or a number from /options.`,
      answer: "The DM asks you: answer in words.",
      pick: "Pick a number from this list, Esc to go back, or say what you do instead.",
      paused: "Paused. Commands only; /pause goes on.",
      surrender: "Accept the surrender (1), fight on (2), or say what you do.",
      card: "A choice's number, or your own words.",
      levelUp: "Your new level: a number, or Enter for the recommended pick.",
      road: "The caravan waits on you: Enter for the marked line, or a number.",
    },
    help: "Help",
    helpText: (commands) =>
      [
        "Commands:",
        ...commands.map(([name, what]) => `  /${name}  ${what}`),
        "",
        "Keys:",
        "  Enter      send the line",
        "  /          on an empty line, the commands to choose from; type to narrow",
        "  Tab        complete a /command, or put the next suggestion in the line",
        "  ↑/↓        light a command, an option or a suggestion; Enter runs it",
        "  Esc        close this, go back from a sub-list, or clear the line",
        "  PgUp/PgDn  scroll the story, or this",
        "  End        back to the newest lines",
        "  Ctrl+P/N   lines you sent before",
        "  Ctrl+C     stop after this decision; twice, at once",
      ].join("\n"),
    answeredLater: "answered at your next prompt",
    stopping: "Stopping after the current decision; Ctrl+C again stops at once.",
    wait: (who, seconds) => (seconds === undefined ? `waiting... ${who ?? "The table is playing"} (/help for commands)` : `${who ?? "The table is playing"}${seconds >= 1 ? ` · ${seconds}s` : ""} (/help for commands)`),
    dmThinking: "The DM is thinking",
    thinking: (name) => `${name} is thinking`,
    suggestHint: "or type your own. ↑/↓ and Enter send one; Tab puts one in the line.",
    yourOwn: "Your own…",
    tooSmall: "Window too small: make it at least 40×16. The game goes on.",
    pausedBlock: "Paused: the AI players wait. /pause to go on.",
    finaleHint: "Any key leaves; the checks go on after it.",
    enterPlays: (line) => `Enter plays ${line}`,
    overlayKeys: (name, scroll, fresh) => `${name} · Esc closes${scroll ? " · PgUp/PgDn" : ""}${fresh > 0 ? ` · ↓ ${fresh} new` : ""}`,
    fresh: (count) => (count > 0 ? `↓ ${count} new · End to follow` : "↓ End to follow"),
    engineStarting: "The engine is starting",
    stoppingFor: (why) => `Stopping: ${why}.`,
    timeLimit: (minutes) => `the ${minutes}-minute time limit`,
    panelTitle: "Panel",
    pickerTitle: "Commands · ↑/↓ move · Enter runs · Tab completes · Esc closes",
    noCommandStarts: (draft) => `No command starts with ${draft}. /help lists them all.`,
    pickerCount: (shown, total) => ` (${shown} of ${total})`,
    suggestQuestion: {
      answer: (name) => `What does ${name} answer?`,
      surrender: (name) => `They offer to surrender. What does ${name} do?`,
      other: (name) => `What does ${name} do or say?`,
    },
    panel: {
      explore: "Explore",
      paused: "Paused",
      party: " · party: ",
      round: (n) => `Round ${n}`,
      yourTurn: "your turn",
      turnOf: (name) => `${name}'s turn`,
      upIn: (n) => ` · you are up in ${n}`,
      next: (names) => ` · next ${names}`,
      stale: " · stale",
      more: (n) => `+${n} more · /where`,
      fallen: (names) => `Fallen ${names}`,
      hp: (hp, max) => `${hp}/${max} HP`,
      temp: (n) => ` +${n} temp`,
      concentrating: (spell) => `concentrating on ${spell}`,
      inReach: "in reach",
      feet: (n) => `${String(n).padStart(3)} ft`,
      sides: { hostile: "Foes", party: "Party", neutral: "Others" },
      health: { unhurt: "unhurt", bloodied: "bloodied", down: "down" },
      condition: (c) => c,
      life: (state) => state,
      used: "used",
      free: "free",
      left: (n) => `${n} left`,
      action: "Action",
      bonusAction: "Bonus Action",
      reactionWord: "Reaction",
      movementLeft: (left, speed) => `${left} of ${speed} ft left`,
      slot: (level) => `level ${level} slot`,
      moveCard: "Walk next to a creature or to a place. Leaving a foe's reach lets it make an opportunity attack, unless you took Disengage.",
      endTurnCard: "End your turn. Whatever you didn't use is lost; your reaction comes back at the start of your next turn.",
    },
  },
  ru: {
    dm: "Ведущий",
    toYou: " (вам)",
    speechTo: (name) => (name === undefined ? " (вам)" : ` (для: ${name})`),
    dmAsks: "Ведущий спрашивает вас",
    reaction: "Ответный ход",
    notAccepted: "Не принято",
    runOver: "Игра окончена",
    sceneOf: (number, of) => `Сцена ${number} из ${of}`,
    minutes: (count) => `${count} мин`,
    commandHelp: {
      options: "что можно сделать сейчас, по номерам",
      sheet: "лист вашего персонажа",
      where: "места и все, кого вы видите, и до них сколько шагов",
      map: "знакомые места, дороги и где сейчас обоз",
      log: "последние события стола с номерами бросков",
      usage: "сколько уже потрачено на модели, по каждому за столом",
      pause: "игроки за столом ждут, пока вы снова не наберёте /pause",
      suggest: "выключить или включить три подсказки вне боя",
      panel: "свернуть боковую панель в одну строку или раскрыть её",
      help: "все команды и клавиши",
      quit: "закончить игру (всё сыгранное сохранится в папке игры)",
    },
    noCommand: (name, commands) => `Команды /${name} нет. Есть такие: ${commands}`,
    busy: "Стол занят: дождитесь своей очереди. Команда, набранная сейчас, сработает, когда очередь придёт.",
    pausedTyped: "Пауза: пока только команды, до следующего /pause.",
    answerYesNo: "Ответьте «да» или «нет» или номером ответного хода.",
    hint: {
      combatTurn: (name) => `Ваш ход: номер из списка или своими словами, что делает ${name}. /options покажет список снова.`,
      reaction: "Ответить? «да» или «нет» (или номер ответа).",
      explore: (name) => `Что ${name} делает или говорит? Своими словами или номером из /options.`,
      answer: "Ведущий спрашивает вас: ответьте словами.",
      pick: "Выберите номер из списка, Esc — назад, или скажите, что делаете.",
      paused: "Пауза. Только команды; /pause продолжает.",
      surrender: "Принять сдачу (1), биться дальше (2) или сказать, что делаете.",
      card: "Номер выбора или своими словами.",
      levelUp: "Новый уровень: номер или Enter, чтобы взять предложенное.",
      road: "Обоз ждёт вас: Enter для отмеченного или номер.",
    },
    help: "Помощь",
    helpText: (commands) =>
      [
        "Команды:",
        ...commands.map(([name, what]) => `  /${name}  ${what}`),
        "",
        "Клавиши:",
        "  Enter      отправить строку",
        "  /          в пустой строке: список команд; печатайте, чтобы сузить",
        "  Tab        дописать /команду или взять следующую подсказку в строку",
        "  ↑/↓        выбрать команду, вариант или подсказку; Enter выполняет",
        "  Esc        закрыть, вернуться из подсписка или очистить строку",
        "  PgUp/PgDn  листать историю или это окно",
        "  End        к последним строкам",
        "  Ctrl+P/N   строки, которые вы уже отправляли",
        "  Ctrl+C     остановить после этого решения; дважды — сразу",
      ].join("\n"),
    answeredLater: "сработает, когда придёт ваша очередь",
    stopping: "Остановка после текущего решения; ещё раз Ctrl+C — сразу.",
    wait: (who, seconds) => (seconds === undefined ? `ждём... ${who ?? "Стол играет"} (/help — команды)` : `${who ?? "Стол играет"}${seconds >= 1 ? ` · ${seconds} с` : ""} (/help — команды)`),
    dmThinking: "Ведущий думает",
    thinking: (name) => `${name} думает`,
    suggestHint: "или напишите своё. ↑/↓ и Enter отправляют подсказку; Tab кладёт её в строку.",
    yourOwn: "Своё…",
    tooSmall: "Окно слишком маленькое: нужно хотя бы 40×16. Игра идёт дальше.",
    pausedBlock: "Пауза: игроки за столом ждут. /pause продолжает.",
    finaleHint: "Любая клавиша — выход; проверки продолжатся после него.",
    enterPlays: (line) => `Enter: ${line}`,
    overlayKeys: (name, scroll, fresh) => `${name} · Esc закрывает${scroll ? " · PgUp/PgDn" : ""}${fresh > 0 ? ` · ↓ новых: ${fresh}` : ""}`,
    fresh: (count) => (count > 0 ? `↓ новых: ${count} · End — к ним` : "↓ End — к последним"),
    engineStarting: "Стол готовится",
    stoppingFor: (why) => `Игра останавливается: ${why}.`,
    timeLimit: (minutes) => `вышло отведённое время, ${plural(minutes, "минута", "минуты", "минут")}`,
    panelTitle: "Обстановка",
    pickerTitle: "Команды · ↑/↓ выбор · Enter выполняет · Tab дописывает · Esc закрывает",
    noCommandStarts: (draft) => `Нет команды, которая начинается с ${draft}. /help покажет все.`,
    pickerCount: (shown, total) => ` (${shown} из ${total})`,
    suggestQuestion: {
      answer: (name) => `Что отвечает ${name}?`,
      surrender: (name) => `Враги готовы сдаться. Что делает ${name}?`,
      other: (name) => `Что ${name} делает или говорит?`,
    },
    panel: {
      explore: "Без боя",
      paused: "Пауза",
      party: " · отряд: ",
      round: (n) => `Раунд ${n}`,
      yourTurn: "ваш ход",
      turnOf: (name) => `ходит ${name}`,
      upIn: (n) => ` · ваш ход через ${n}`,
      next: (names) => ` · дальше: ${names}`,
      stale: " · давние сведения",
      more: (n) => `ещё ${n} · /where`,
      fallen: (names) => `Выбыли: ${names}`,
      hp: (hp, max) => `здоровье ${hp}/${max}`,
      temp: (n) => ` +${n} сверху`,
      concentrating: (spell) => `удерживает: ${spell}`,
      inReach: "достать можно",
      feet: (n) => `${String(n).padStart(3)} фт`,
      sides: { hostile: "Враги", party: "Свои", neutral: "Прочие" },
      health: { unhurt: "без ран", bloodied: "в ранах", down: "вне боя" },
      condition: (c) => CONDITION_NAMES_RU[c],
      life: (state) => ({ conscious: "в сознании", unconscious: "без сознания", stable: "вне опасности", dead: "погиб" })[state],
      used: "потрачено",
      free: "есть",
      left: (n) => `осталось ${n}`,
      action: "Действие",
      bonusAction: "Быстрое действие",
      reactionWord: "Ответ",
      movementLeft: (left, speed) => `шагов: ${ru(left, "фут", "фута", "футов")} из ${speed}`,
      slot: (level) => `ячейка круга ${level}`,
      moveCard: "Подойти к кому-то или к месту. Если уйти от врага, он может ударить вслед, если вы не отступили осторожно.",
      endTurnCard: "Закончить ход. Неистраченное пропадает; ответный ход вернётся в начале вашего следующего хода.",
    },
  },
};

/** Each condition's name for the panel and the sheet in Russian (seat-lines.ts holds its lines). */
export const CONDITION_NAMES_RU: Record<Condition, string> = {
  blinded: "ничего не видит",
  charmed: "под чарами",
  deafened: "ничего не слышит",
  frightened: "страх",
  grappled: "в захвате",
  incapacitated: "не может действовать",
  invisible: "невидимость",
  paralyzed: "паралич",
  petrified: "камень",
  poisoned: "яд",
  prone: "на земле",
  restrained: "в путах",
  stunned: "оглушение",
  unconscious: "без сознания",
};
