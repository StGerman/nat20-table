// A Russian line for each level-up choice (AGT-146, Glass Table scope In 7): the engine is walked
// through every level-up choice the four pregens can meet up to level 5, trying every option at
// every choice, and each option must have its Russian name and line, so a Russian seat never offers
// a pick the player cannot read for what it does. No model.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { LevelUpChoice, Roster } from "@nat20-table/engine-client";
import { GameEngine } from "../src/engine.ts";
import { levelUpChoices } from "../src/table/choices.ts";
import { ruDictionary, SeatNames } from "../src/table/seat-lines.ts";
import { SEAT_WORDS, SKILLS_RU } from "../src/table/words.ts";
import { TEST_PACK } from "./helpers.ts";

/** The XP of level 5: past it the engine offers nothing a saved party has reached. */
const XP = 6500;
const SCENE = "m5_s3_yard";
const HANDLES = ["bren", "torva", "maren", "ilsa"];

/**
 * The refusals the walk may meet, each a known engine gap: anything else fails the test, so a new
 * stall, or a fix that opens choices beyond these, is seen.
 */
const KNOWN_STALLS = [
  /** ENG-50: the level 4 Ability Score Improvement asks what level_up cannot ask yet. */
  /level-up cannot go on: it asks for ability scores or a spell swap/,
  /** ENG-51: the cleric's level 4. */
  /^Core refused an answer in maren's level-up\.$/,
];

/** What the walk was refused, by whom and after which picks. */
const refused: string[] = [];

async function started(roster?: Roster): Promise<GameEngine> {
  const engine = await GameEngine.start({ pack: TEST_PACK, runDir: mkdtempSync(path.join(tmpdir(), "level-up-")), seed: 1, ...(roster ? { roster } : {}) });
  const loaded = await engine.request("dm", { cmd: "load_scene", scene_id: SCENE });
  if (!loaded.ok) {
    engine.close();
    assert.fail(`load_scene ${SCENE}: ${loaded.error?.message}`);
  }
  return engine;
}

/** The choice open after answering `path` in order, or undefined when the level-ups end (or the engine cannot go on). */
async function after(roster: Roster, handle: string, path: string[][]): Promise<LevelUpChoice | undefined> {
  const engine = await started(roster);
  try {
    let answered = 0;
    for (let tries = 0; tries < 40; tries++) {
      const r = await engine.request(handle, { cmd: "level_up", actor: handle });
      // No more XP is the walk's end; any other refusal is recorded.
      if (!r.ok) {
        if (!/needs \d+\.?$/.test(r.error?.message ?? "")) refused.push(`${handle} after ${JSON.stringify(path)}: ${r.error?.message}`);
        return undefined;
      }
      let choice = (r.result as { choice?: LevelUpChoice | null }).choice ?? undefined;
      while (choice) {
        if (answered === path.length) return choice;
        const a = await engine.request(handle, { cmd: "answer_level_up", actor: handle, prompt_id: choice.prompt_id, picks: path[answered++]! });
        if (!a.ok) {
          refused.push(`${handle} after ${JSON.stringify(path)}: ${a.error?.message}`);
          return undefined;
        }
        choice = (a.result as { choice?: LevelUpChoice | null }).choice ?? undefined;
      }
    }
    return undefined;
  } finally {
    engine.close();
  }
}

/** Every choice each pregen meets, trying each option once per distinct choice. */
async function reachable(): Promise<LevelUpChoice[]> {
  const first = await started();
  const saved = await first.request("dm", { cmd: "save_roster" }).finally(() => first.close());
  assert.ok(saved.ok && saved.result?.cmd === "save_roster");
  const roster: Roster = { ...saved.result.roster, characters: saved.result.roster.characters.map((c) => ({ ...c, xp: XP })) };
  const found: LevelUpChoice[] = [];
  for (const handle of HANDLES) {
    const done = new Set<string>();
    const stack: string[][][] = [[]];
    while (stack.length > 0) {
      const path = stack.pop()!;
      const choice = await after(roster, handle, path);
      if (!choice) continue;
      const ids = choice.options.map((o) => o.id);
      // An earlier pick only takes ids off a later list (a spell known is not offered again), and every
      // option of a choice is tried once, so a choice met again with the same ids adds nothing new.
      const key = `${choice.level} ${choice.label} ${[...ids].sort().join(",")}`;
      if (done.has(key)) continue;
      done.add(key);
      found.push(choice);
      for (const id of ids) stack.push([...path, [id, ...ids.filter((x) => x !== id).slice(0, choice.picks - 1)]]);
    }
  }
  return found;
}

test("every level-up choice the pregens can meet has its Russian name and line, and a Russian seat shows them", async () => {
  const choices = await reachable();
  const dictionary = ruDictionary();
  const ids = new Set(choices.flatMap((c) => c.options.map((o) => o.id)));
  assert.ok(ids.has("fireball") && ids.has("skilled") && ids.has("survival"), "spells, feats and skills are all reached");
  for (const id of ids) {
    assert.ok(dictionary.things[id], `a Russian name for ${id}`);
    assert.ok(dictionary.level_up[id], `a Russian line for ${id}`);
  }
  for (const label of new Set(choices.map((c) => c.label))) assert.ok(dictionary.things[label], `a Russian title for ${label}`);
  // A skill has one Russian name at the seat: the level-up's is the action card's.
  for (const [skill, name] of Object.entries(SKILLS_RU)) if (ids.has(skill)) assert.equal(dictionary.things[skill], name, skill);
  const unknown = refused.filter((r) => !KNOWN_STALLS.some((known) => known.test(r.split(": ").slice(1).join(": "))));
  assert.deepEqual(unknown, [], "only the known engine gaps stop the walk");
  assert.ok(refused.length > 0, "the known gaps still stop it: when ENG-50 or ENG-51 is fixed, drop its pattern and let the walk go on");
  const names = new SeatNames("ru");
  const talk = { names, words: SEAT_WORDS.ru };
  for (const choice of choices) {
    for (const line of levelUpChoices(choice, [], talk).slice(1)) {
      assert.match(line.label, /^[^a-z]+: [^a-z]+$/i, `a Russian line, no English: ${line.label}`);
    }
  }
});
