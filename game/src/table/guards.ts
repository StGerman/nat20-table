// The narration and speech guards (M6 spec §3.5, TASKS.md AGT-20): checks on free text one seat
// writes for others, run before anyone else sees it. DM text (narration, questions, memory) may
// hold no number outside a roll citation, no game-stat term, no DM-only id of the pack, and no
// citation of a roll the log doesn't have. An AI player's lines may hold no number and no game-stat
// term. Ids every player is shown (scenes, places, creature handles such as goblin_1) are names,
// not numbers. What a filter can't catch, a secret told in plain prose, is the prompt's job and the
// leak scan's (crates/nat20-duel/src/leak_scan.rs).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TextGuard } from "./state.ts";

/** A roll citation, `[r12]`: the only place a DM's text may hold digits. */
const CITATION = /\[r(\d+)\]/g;

/**
 * Numbers in words from ten up: the size of a DC, an AC or a Hit Point total. Small counts ("two
 * goblins", "one of them") are ordinary prose about what the characters can see, so they pass.
 */
const NUMBER_WORDS =
  /\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i;

/**
 * The same in Russian, for runs whose agents write Russian (decision 0038), in every case form:
 * the teens (-надцать), the tens (десять, двадцать, тридцать, сорок, пятьдесят to восемьдесят,
 * девяносто), сто, сотня, the hundreds (двести to девятьсот: двухсот, тремстам, пятьюстами) and
 * тысяча. JavaScript's \b knows only Latin letters, hence the lookarounds.
 */
const RUSSIAN_NUMBER_WORDS =
  /(?<!\p{L})(?:\p{L}*(?:надцат|десят|двадцат|тридцат|девяност|тысяч)\p{L}*|сорока?|сто|ста|сотн\p{L}*|сотен|двести|триста|четыреста|(?:двух|двум|двумя|тр[её]х|трем|тремя|четыр[её]х|четыр[её]м|четырьмя|пят[ьи]|пятью|шест[ьи]|шестью|сем[ьи]|семью|восемь|восьми|восемью|восьмью|девят[ьи]|девятью)(?:сот|стам|стами|стах))(?!\p{L})/iu;

/** Game-stat terms no narration or spoken line names (spec §3.5). */
const STAT_TERMS: RegExp[] = [
  /\barmou?r class\b/i,
  /\bAC\b/i,
  /\bDCs?\b/i,
  /\bdifficulty class\b/i,
  /\bhit points?\b/i,
  /\bHP\b/i,
  /\bsaving throw bonus\b/i,
  /\battack bonus\b/i,
  /\bchallenge rating\b/i,
  // Russian (decision 0038): Armor Class, DC, Hit Points, bonuses, challenge rating.
  /класс\p{L}* (?:доспех|брон)\p{L}*/iu,
  /(?<!\p{L})КД(?!\p{L})/iu,
  /(?<!\p{L})СЛ(?!\p{L})/iu,
  /класс\p{L}* сложност\p{L}*/iu,
  /(?<!\p{L})хит(?:|а|у|ом|е|ы|ов|ам|ами|ах)(?!\p{L})/iu,
  /(?<!\p{L})хит-?поинт\p{L}*/iu,
  /очк\p{L}* (?:здоровья|жизни)/iu,
  /(?<!\p{L})ОЗ(?!\p{L})/u,
  /бонус\p{L}* (?:к )?(?:атак|спас)\p{L}*/iu,
  /(?:показател|урове?н)\p{L}* опасности/iu,
];

/** Kinds of DM-only data that are no player's business by name (protocol §5): surrender triggers, a spawn's `unless`. */
const DM_ONLY_KINDS = [
  "check_resolved",
  "flag_set",
  "hazard_triggered",
  "spawned",
  "hp_fraction_at_most",
  "standing_at_most",
  "leader_down",
  "any_party_bloodied",
];

function numberIn(text: string): string | undefined {
  const digit = /\d+/.exec(text);
  if (digit) return `it holds a number (${digit[0]})`;
  const word = NUMBER_WORDS.exec(text) ?? RUSSIAN_NUMBER_WORDS.exec(text);
  return word ? `it holds a number (${word[0]})` : undefined;
}

function statTermIn(text: string): string | undefined {
  for (const term of STAT_TERMS) {
    const found = term.exec(text);
    if (found) return `it names a game statistic (${found[0]})`;
  }
  return undefined;
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

/** The DM's text guard: refuses numbers, game-stat terms, DM-only ids and unknown roll ids. */
export function narrationGuard(options: { ids: PackIds; knownRoll: (id: string) => boolean }): TextGuard {
  return (text) => {
    for (const cited of text.matchAll(CITATION)) {
      if (!options.knownRoll(`r${cited[1]}`)) return `it cites [r${cited[1]}], a roll the log doesn't have`;
    }
    const bare = text.replace(CITATION, "");
    const secret = tokens(bare).find((token) => options.ids.dmOnly.has(token));
    return (
      numberIn(withoutShown(bare, options.ids.shown)) ?? statTermIn(bare) ?? (secret ? `it names ${secret}, which only the DM knows` : undefined)
    );
  };
}

/** An AI player's text guard: refuses numbers and game-stat terms. */
export function speechGuard(options: { shown: ReadonlySet<string> }): TextGuard {
  return (text) => numberIn(withoutShown(text, options.shown)) ?? statTermIn(text);
}

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
  return { dmOnly: new Set([...hidden].filter((id) => !shown.has(id) && /[_:\d]/.test(id))), shown };
}
