// The seat's own words, in the run's language (Milestone 12, design §1.6, §3): the lines the table
// itself writes for the human's seat, never the DM's or the engine's. AGT-99 starts it with the own
// move and the card's prompt; AGT-98 moves the rest of the seat's strings here.
import type { Skill } from "@nat20-table/engine-client";
import type { Language } from "../agents/language.ts";
import { titled } from "../view.ts";

export interface SeatWords {
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
}

const SKILLS_RU: Record<Skill, string> = {
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
  },
  ru: {
    ownMoveLine: "Или что-то своё: скажите своими словами.",
    choicesTitle: "Выборы",
    cardPrompt: "Номер выбора или своими словами.",
    marked: "(Enter)",
    othersChoice: "(выбор остальных)",
    ownMoveChoice: (mine, name, words, skill) => `${mine ? "Ваш ход" : `${name} предлагает`}: «${words}» (${SKILLS_RU[skill]})`,
    stillWaits: (count) => `Дорога всё ещё ждёт вашего слова: выбор от 1 до ${count} или своими словами.`,
  },
};
