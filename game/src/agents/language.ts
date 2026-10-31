// The language the agents write the table's prose in (`--lang`, decision 0038). English is the
// default and adds nothing to a prompt. Only what a model writes changes: the engine's lines, the
// option names and the terminal UI stay English, and tool inputs stay the ids the tools take.

/** The languages a run can ask the agents to write in. */
export const LANGUAGES = ["en", "ru"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The DM's language section, or nothing for English. */
export function dmLanguage(language: Language, human = true, names: readonly string[] = []): string[] {
  if (language === "en") return [];
  return [
    "## Language",
    "",
    human
      ? "Write everything the table hears in Russian: narration, questions to the human, the closing narration, and your scene summaries and memory. The human may write in Russian or English; read either."
      : "Write everything the table hears in Russian: narration, the closing narration, and your scene summaries and memory.",
    "The engine's lines, the options and the scene files are in English: tell what they mean in the fiction, in Russian, and never quote them. Tool inputs stay exactly as the tools take them: ids, handles, skills and option ids.",
    "The guard reads Russian too: no numbers in words from ten up (десять, двадцать, сто), and no game statistics (КД, класс доспеха, СЛ, хиты, очки здоровья, бонус атаки).",
    ...russianNameLine(names),
    "",
  ];
}

/**
 * An AI player's language section, or nothing for English. `voice` is the card's optional
 * `## Voice in Russian` section, which only a Russian prompt carries.
 */
export function playerLanguage(language: Language, voice?: string, names: readonly string[] = []): string {
  if (language === "en") return "";
  const named = russianNameLine(names).map((line) => ` ${line}`).join("");
  const own = voice ? `\n\nHow your character sounds in Russian, from your card:\n\n${voice}` : "";
  return `

Language: write in Russian everything you say, declare, note or summarise, and give your character's name in Russian letters. Answer a hand with SPEAK, BOTH, ACT: or PASS in Latin letters (what follows ACT: in Russian), and a declaration with just PASS, in Latin letters, when you do nothing new. Tool inputs stay exactly as the tools take them: ids, handles and option ids. The engine's lines and your options are in English; read them, and never quote them aloud. The guard reads Russian too: no numbers in words from ten up and no game statistics (КД, хиты, очки здоровья). Carry your card's voice by meaning, in the words a Russian speaker of your character's background would use: never translate its catchphrases or forms of address word for word, and never leave them in English.${named}${own}`;
}

/**
 * The party's and the NPCs' one Russian name each (AGT-38), so every agent writes the same form:
 * the table's name matcher knows the pack's other spellings, not invented ones.
 */
function russianNameLine(names: readonly string[]): string[] {
  return names.length > 0 ? [`Names in Russian: write each as given here, declined as Russian declines it: ${names.join("; ")}.`] : [];
}
