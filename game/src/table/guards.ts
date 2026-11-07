// The narration and speech guards (M6 spec §3.5, TASKS.md AGT-20, AGT-95): checks on free text one
// seat writes for others, run before anyone else sees it. DM text (narration, questions, memory) may
// give no number for a game statistic (Armor Class, a DC, Hit Points, a bonus), show no roll's
// modifiers, name no DM-only id of the pack, and cite no roll the log doesn't have. An AI player's
// lines may give no number for a game statistic either. Other numbers and game words are fine
// (decision 0064): coin, days, distances, a roll's total. Ids every player is shown (scenes,
// places, creature handles such as goblin_1) are names. What a filter can't catch, a secret told in
// plain prose, is the prompt's job and the leak scan's (crates/nat20-duel/src/leak_scan.rs).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { skeletonFile } from "../pack/read.ts";
import type { Language } from "../agents/language.ts";
import type { TextGuard } from "./state.ts";

/** A roll citation, `[r12]`: it must name a roll the log has. */
const CITATION = /\[r(\d+)\]/g;

/**
 * Numbers in words: a game statistic's value said in prose ("AC fifteen", "three hit points left").
 * They count only beside a game statistic (`hiddenNumberIn`): on their own they are ordinary prose,
 * coin, days and distances included (AGT-95, decision 0064).
 */
const NUMBER_WORDS =
  /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)$/i;

/**
 * The same in Russian, for runs whose agents write Russian (decision 0038), in every case form:
 * one to nine (один, двух, тремя, пятью), the teens (-надцать), the tens (десять, двадцать,
 * тридцать, сорок, пятьдесят to восемьдесят, девяносто), сто, сотня, the hundreds (двести to
 * девятьсот: двухсот, тремстам, пятьюстами) and тысяча. Matched against one whole word.
 */
const RUSSIAN_NUMBER_WORDS =
  /^(?:\p{L}*(?:надцат|десят|двадцат|тридцат|девяност|тысяч)\p{L}*|сорока?|сто|ста|сотн\p{L}*|сотен|двести|триста|четыреста|(?:двух|двум|двумя|тр[её]х|трем|тремя|четыр[её]х|четыр[её]м|четырьмя|пят[ьи]|пятью|шест[ьи]|шестью|сем[ьи]|семью|восемь|восьми|восемью|восьмью|девят[ьи]|девятью)(?:сот|стам|стами|стах)|од(?:ин|на|но|ну|ной|ного|ному|ним|ном)|дв(?:а|е|ух|ум|умя)|тр(?:и|[её]х|[её]м|емя)|четыр(?:е|[её]х|[её]м|ьмя)|пят(?:ь|и|ью)|шест(?:ь|и|ью)|сем(?:ь|и|ью)|вос(?:емь|ьми|емью|ьмью)|девят(?:ь|и|ью))$/iu;

/**
 * Game statistics whose values the table never hears from an agent (Rule 3, spec §3.5): a
 * creature's Armor Class and Hit Points, a DC, an attack or save bonus, a challenge rating. The
 * word alone is fine; a number beside it is refused (`hiddenNumberIn`).
 */
const STAT_TERMS: RegExp[] = [
  /\barmou?r class\b/gi,
  /\bAC\b/gi,
  /\bDCs?\b/gi,
  /\bdifficulty class\b/gi,
  /\bhit points?\b/gi,
  /\bHP\b/gi,
  /\bsaving throw bonus\b/gi,
  /\battack bonus\b/gi,
  /\bchallenge rating\b/gi,
  // Russian (decision 0038): Armor Class, DC, Hit Points, bonuses, challenge rating.
  /класс\p{L}* (?:доспех|брон)\p{L}*/giu,
  /(?<!\p{L})КД(?!\p{L})/giu,
  /(?<!\p{L})СЛ(?!\p{L})/giu,
  /класс\p{L}* сложност\p{L}*/giu,
  /(?<!\p{L})хит(?:|а|у|ом|е|ы|ов|ам|ами|ах)(?!\p{L})/giu,
  /(?<!\p{L})хит-?поинт\p{L}*/giu,
  /очк\p{L}* (?:здоровья|жизни)/giu,
  /(?<!\p{L})ОЗ(?!\p{L})/gu,
  /бонус\p{L}* (?:к )?(?:атак|спас)\p{L}*/giu,
  /(?:показател|урове?н)\p{L}* опасности/giu,
];

/** How many words either side of a game statistic a number counts as its value ("Armor Class of about 15", «класс доспеха у волка всего 13»). */
const STAT_REACH = 4;

/** Where a sentence or clause ends: a number past it is about something else. A colon or dash doesn't ("AC: 15", «КД — 15»). */
const CLAUSE_END = /[.!?;]/;

/** A die, `d20` or `2d6`: the dice of a roll are public (protocol §5), not a statistic's value. */
const DIE = /^\d*[dк]\d+$/iu;

/** The word without the punctuation around it ("15," is 15, "+4" is 4). */
function bareWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** A word that is a number: digits in it (15, 7/10), or a number in words, English or Russian. A die is not one. */
function isNumber(word: string): boolean {
  return (/\d/.test(word) && !DIE.test(word)) || NUMBER_WORDS.test(word) || RUSSIAN_NUMBER_WORDS.test(word);
}

/**
 * A number beside a game statistic in the same clause (AGT-95, decision 0064): "AC 15", "DC
 * twelve", "has 3 HP", "7/10 hit points", «КД 15», «осталось три хита». Numbers elsewhere, coin,
 * days, distances, a roll's total, pass; so do the statistics' names alone. A hidden number said
 * without its statistic's name ("you needed a fifteen") is the prompt's job and the leak scan's.
 */
function hiddenNumberIn(text: string): string | undefined {
  let nearest: { term: string; number: string; distance: number } | undefined;
  for (const term of STAT_TERMS) {
    for (const found of text.matchAll(term)) {
      const at = found.index ?? 0;
      const before = text.slice(0, at).split(CLAUSE_END).at(-1)!.split(/\s+/).map(bareWord).filter(Boolean).slice(-STAT_REACH).reverse();
      const after = text.slice(at + found[0].length).split(CLAUSE_END)[0].split(/\s+/).map(bareWord).filter(Boolean).slice(0, STAT_REACH);
      for (const side of [before, after]) {
        const distance = side.findIndex(isNumber);
        if (distance >= 0 && (!nearest || distance < nearest.distance)) nearest = { term: found[0], number: side[distance], distance };
      }
    }
  }
  return nearest ? `it gives a number for a game statistic (${nearest.term}, ${nearest.number}): the table never hears those` : undefined;
}

/**
 * A roll written with its modifiers, as the DM's full view shows it (`1d20 (14) +5 = 19`, `14 + 5 =
 * 19`): players get a roll's dice, total and outcome only (protocol §5).
 */
const ROLL_MODIFIERS = /(?:\)|\d)\s*[+-]\s*\d+\s*=\s*\d/;

function rollModifiersIn(text: string): string | undefined {
  const found = ROLL_MODIFIERS.exec(text);
  return found ? `it shows a roll's modifiers (${found[0]}): give the total only` : undefined;
}

/** Kinds of DM-only data that are no player's business by name (protocol §5): surrender triggers, a spawn's `unless`. */
const DM_ONLY_KINDS = [
  "check_resolved",
  "flag_set",
  "hazard_triggered",
  "spawned",
  "creature_placed",
  "hp_fraction_at_most",
  "standing_at_most",
  "leader_down",
  "any_party_bloodied",
];

/**
 * A word that mixes Cyrillic and Latin letters, such as «Бранnок» (AGT-38): a model's slip
 * between scripts, never a word of either language.
 */
const MIXED_SCRIPT = /(?<!\p{L})(?=\p{L}*\p{Script=Cyrillic})(?=\p{L}*\p{Script=Latin})\p{L}+(?!\p{L})/u;

function mixedScriptIn(text: string): string | undefined {
  const word = MIXED_SCRIPT.exec(text);
  return word ? `it mixes Russian and Latin letters in one word (${word[0]}): write it in one alphabet` : undefined;
}

/** A run of letters, digits, `_` and `:`: an id, a handle or a word, as the leak scan reads them. */
const TOKEN = /[A-Za-z0-9_:]+/g;

/** A token without the colons around it ("goblin_1:" names goblin_1). */
function bareToken(token: string): string {
  return token.replace(/^:+|:+$/g, "");
}

/** The text's tokens, and each part of a token with a colon in it ("check:reeve_insight" names reeve_insight). */
function tokens(text: string): string[] {
  return (text.match(TOKEN) ?? [])
    .map(bareToken)
    .flatMap((token) => (token.includes(":") ? [token, ...token.split(":")] : [token]))
    .filter((token) => token.length > 0);
}

/** The text with every shown id taken out, so the digits in goblin_1 or s3_mill_yard don't count as numbers. */
function withoutShown(text: string, shown: ReadonlySet<string>): string {
  return text.replace(TOKEN, (token) => (shown.has(bareToken(token)) ? " " : token));
}

/**
 * The DM's text guard: refuses a number given for a game statistic, a roll's modifiers, mixed-script
 * words, DM-only ids and unknown roll ids, and in a Russian run (`language` ru, decision 0038) a word
 * in Latin letters (AGT-73).
 */
export function narrationGuard(options: { ids: PackIds; knownRoll: (id: string) => boolean; language?: Language }): TextGuard {
  return (text) => {
    for (const cited of text.matchAll(CITATION)) {
      if (!options.knownRoll(`r${cited[1]}`)) return `it cites [r${cited[1]}], a roll the log doesn't have`;
    }
    const bare = text.replace(CITATION, "");
    const secret = tokens(bare).find((token) => options.ids.dmOnly.has(token));
    return (
      hiddenNumberIn(withoutShown(bare, options.ids.shown)) ??
      rollModifiersIn(bare) ??
      mixedScriptIn(bare) ??
      (secret ? `it names ${secret}, which only the DM knows` : undefined) ??
      (options.language === "ru" ? latinWordIn(bare, options.ids.shown) : undefined)
    );
  };
}

/**
 * In a Russian run, a line with letters and not one Cyrillic letter (AGT-38): an AI player slipped
 * into English, and the human at the table reads Russian. Shown ids (goblin_1) don't count.
 */
function englishIn(text: string, shown: ReadonlySet<string>): string | undefined {
  const words = withoutShown(text, shown);
  return /\p{L}/u.test(words) && !/\p{Script=Cyrillic}/u.test(words) ? "it is in English: say it in Russian" : undefined;
}

/** An id (with an `_`, a digit or a `:`) every player is shown, such as goblin_1: a name, in any alphabet. */
function shownId(token: string, shown: ReadonlySet<string>): boolean {
  return /[_:\d]/.test(token) && shown.has(token);
}

/** The answer words a player writes in Latin letters by its prompt (party talk §4.3): SPEAK, BOTH, ACT, PASS. */
const HAND_WORDS = new Set(["SPEAK", "BOTH", "ACT", "PASS"]);

/** A word of two Latin letters or more: in a Russian line, an English word or a name left in Latin letters. */
const LATIN_WORD = /(?<![\p{L}\d_:])\p{Script=Latin}{2,}(?![\p{L}\d_:])/u;

/**
 * In a Russian run, a word in Latin letters beside Russian ones (AGT-73, decision 0060 F7: «Torva
 * идёт к старосте», «идёт first», a headman's "Well, now…"): the human reads Russian, and the name
 * line gives every name in Russian letters. Ids every player is shown (goblin_1) are names and pass;
 * a handle with no `_` or digit (torva) is a name and is written in Russian.
 */
function latinWordIn(text: string, shown: ReadonlySet<string>): string | undefined {
  const words = text.replace(TOKEN, (token) => (shownId(bareToken(token), shown) || HAND_WORDS.has(token) ? " " : token));
  const word = LATIN_WORD.exec(words);
  return word ? `it has a word in Latin letters (${word[0]}): write it in Russian` : undefined;
}

/**
 * An AI player's text guard: refuses a number given for a game statistic, a roll's modifiers and
 * mixed-script words, and in a
 * Russian run (`language` ru) a line with no Russian in it or a word in Latin letters.
 */
export function speechGuard(options: { shown: ReadonlySet<string>; language?: Language; dmOnly?: ReadonlySet<string> }): TextGuard {
  return (text) =>
    // A lone handle is whom a line is said to (AGT-84: `odda_vell`, `bandit_1`), not words: it passes
    // unless it is an id only the DM knows (Copilot on table #289).
    HANDLE.test(text)
      ? options.dmOnly?.has(text)
        ? `it names ${text}, which only the DM knows`
        : undefined
      : hiddenNumberIn(withoutShown(text, options.shown)) ??
    rollModifiersIn(text) ??
    mixedScriptIn(text) ??
      (options.language === "ru" ? (englishIn(text, options.shown) ?? latinWordIn(text, options.shown)) : undefined);
}

/** A handle as the engine and the pack write one: lowercase letters, digits and `_`, starting with a letter. */
const HANDLE = /^[a-z][a-z0-9_]*$/;

interface SceneFileIds {
  id: string;
  anchors?: Array<{ id: string }>;
  creatures?: Array<{ handle: string; monster?: string }>;
  checks?: Array<{ id: string; on_success?: Consequence[]; on_failure?: Consequence[] }>;
  hazards?: Array<{ id: string; on_success?: Consequence[]; on_failure?: Consequence[] }>;
  encounters?: Array<{ id: string; surprise?: { when_flag?: string } }>;
  spawns?: Array<{ id: string; when?: { kind: string; flag?: string; unless?: string }; creatures?: Array<{ handle: string; monster?: string }> }>;
}
type Consequence = { kind: string; flag?: string };

/** A pack's ids, split by who may hear them. */
export interface PackIds {
  /** Checks, hazards, encounters, spawns, flags, stat blocks and DM-only kinds. */
  dmOnly: Set<string>;
  /** What every player is shown: scene ids, places and creature handles. */
  shown: Set<string>;
}

/**
 * The ids of the scenes in `pack/scenes/`. DM-only: checks, hazards, encounters, spawns, flags and
 * monster stat blocks, less any id a player is shown anyway (a scene, anchor or creature handle).
 * As in the leak scan, only ids with an `_`, a digit or a `:` are kept: a plain-word id can't be
 * told from prose. The surrender trigger kinds and DM-only event kinds are added.
 */
export function packIds(pack: string): PackIds {
  const dir = path.join(pack, "scenes");
  const scenes = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as SceneFileIds);
  const hidden = new Set<string>(DM_ONLY_KINDS);
  const shown = new Set<string>();
  const creature = (c: { handle: string; monster?: string }) => {
    shown.add(c.handle);
    if (c.monster) hidden.add(c.monster.split(/[.:]/).at(-1)!);
  };
  for (const scene of scenes) {
    shown.add(scene.id);
    for (const anchor of scene.anchors ?? []) shown.add(anchor.id);
    for (const c of scene.creatures ?? []) creature(c);
    for (const test of [...(scene.checks ?? []), ...(scene.hazards ?? [])]) {
      hidden.add(test.id);
      for (const consequence of [...(test.on_success ?? []), ...(test.on_failure ?? [])]) {
        if (consequence.kind === "flag" && consequence.flag) hidden.add(consequence.flag);
      }
    }
    for (const encounter of scene.encounters ?? []) {
      hidden.add(encounter.id);
      if (encounter.surprise?.when_flag) hidden.add(encounter.surprise.when_flag);
    }
    for (const spawn of scene.spawns ?? []) {
      hidden.add(spawn.id);
      if (spawn.when?.kind === "flag" && spawn.when.flag) hidden.add(spawn.when.flag);
      if (spawn.when?.unless) hidden.add(spawn.when.unless);
      for (const c of spawn.creatures ?? []) creature(c);
    }
  }
  // The adventure's creature list (AGT-24): its entry ids and stat blocks are DM-only too.
  const skeleton = skeletonFile(pack);
  if (existsSync(skeleton)) {
    const adventure = JSON.parse(readFileSync(skeleton, "utf8")) as { stat_blocks?: Array<{ id: string; monster: string }> };
    for (const entry of adventure.stat_blocks ?? []) {
      hidden.add(entry.id);
      hidden.add(entry.monster.split(/[.:]/).at(-1)!);
    }
  }
  return { dmOnly: new Set([...hidden].filter((id) => !shown.has(id) && /[_:\d]/.test(id))), shown };
}
