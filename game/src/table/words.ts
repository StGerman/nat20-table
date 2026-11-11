// The seat's own words, in the run's language (Milestone 12, design §1.6, §3): the lines the table
// itself writes for the human's seat, never the DM's or the engine's. AGT-99 starts it with the own
// move, the card's prompt and the marked choice; AGT-98 moves the rest of the seat's strings here.
import type { Skill } from "@nat20-table/engine-client";
import type { Language } from "../agents/language.ts";

export interface SeatWords {
  /** The card's last line, unnumbered: a player may answer in their own words. */
  ownMoveLine: string;
  /** The card list's heading. */
  choicesTitle: string;
  /** The card's prompt line; `marked` adds that Enter takes the marked choice. */
  cardPrompt(marked: boolean): string;
  /** The end of the line Enter takes. */
  marked: string;
  /** After the choice most of the others gave. */
  othersChoice: string;
  /** An own move on the card, as a numbered choice: in the words the player said, with the skill it takes. */
  ownMoveChoice(mine: boolean, name: string, words: string, skill: Skill): string;
  /** After words a card took no move from: the card still waits. */
  stillWaits(count: number, marked: boolean): string;
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

/** A skill as the SRD names it in English: `animal_handling` is "Animal Handling". */
function skillEn(skill: Skill): string {
  return skill
    .split("_")
    .map((w) => (w === "of" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export const SEAT_WORDS: Record<Language, SeatWords> = {
  en: {
    ownMoveLine: "Something else: say it in your own words.",
    choicesTitle: "Choices",
    cardPrompt: (marked) => `A choice's number, or your own words${marked ? ", Enter for the marked one" : ""}.`,
    marked: "(Enter)",
    othersChoice: "(the others' choice)",
    ownMoveChoice: (mine, name, words, skill) => `${mine ? "Your move" : `${name}'s move`}: "${words}" (${skillEn(skill)})`,
    stillWaits: (count, marked) => `The road still waits for your word: a choice, 1 to ${count}${marked ? ", or Enter for the marked one" : ""}, or your own words.`,
  },
  ru: {
    ownMoveLine: "Или что-то своё: скажите своими словами.",
    choicesTitle: "Выборы",
    cardPrompt: (marked) => `Номер выбора или своими словами${marked ? ", Enter для отмеченного" : ""}.`,
    marked: "(Enter)",
    othersChoice: "(выбор остальных)",
    ownMoveChoice: (mine, name, words, skill) => `${mine ? "Ваш ход" : `${name} предлагает`}: «${words}» (${SKILLS_RU[skill]})`,
    stillWaits: (count, marked) => `Дорога всё ещё ждёт вашего слова: выбор от 1 до ${count}${marked ? ", Enter для отмеченного" : ""} или своими словами.`,
  },
};
