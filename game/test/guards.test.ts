// The narration and speech guards (M6 spec §3.5, TASKS.md AGT-20): what they refuse and what they
// let through, on The Silent Mill's own ids, and that a refused line reaches nobody.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { narrationGuard, packIds, speechGuard } from "../src/table/guards.ts";
import { testTable } from "./helpers.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");

test("the DM-only ids of The Silent Mill are its checks, encounters, spawns, flags and stat blocks, never what players see", () => {
  const { dmOnly, shown } = packIds(MILL);
  for (const id of ["reeve_insight", "yard_fight", "cellar_fight", "extra_warrior", "road_snare", "knows_goblin_tracks", "goblin_warrior", "goblin_boss", "giant_rat", "standing_at_most", "flag_set", "any_party_bloodied"]) {
    assert.ok(dmOnly.has(id), `${id} is DM-only`);
  }
  // Scenes, places and creature handles are shown to players; a plain-word id can't be told from prose.
  for (const id of ["s3_mill_yard", "green_well", "mill_door", "goblin_1", "wolf_2", "bren", "wolf"]) assert.ok(!dmOnly.has(id), `${id} is not DM-only`);
  for (const id of ["s3_mill_yard", "green_well", "goblin_1", "wolf_2", "bren"]) assert.ok(shown.has(id), `${id} is shown`);
});

test("the narration guard refuses numbers, game statistics, DM-only ids and unknown roll ids", () => {
  const guard = narrationGuard({ ids: packIds(MILL), knownRoll: (id) => id === "r12" });
  const refused: Array<[string, RegExp]> = [
    ["The goblin has 7 left in it.", /number \(7\)/],
    ["Fifteen goblins pour out of the mill.", /number \(Fifteen\)/],
    ["Its AC is high.", /game statistic \(AC\)/],
    ["The goblin is down to a few hit points.", /game statistic \(hit points\)/],
    ["That needs a hard DC.", /game statistic \(DC\)/],
    ["You fail reeve_insight.", /names reeve_insight/],
    ["The goblin_warrior snarls.", /names goblin_warrior/],
    ["Now yard_fight begins.", /names yard_fight/],
    ["They know about knows_goblin_tracks.", /names knows_goblin_tracks/],
    ["standing_at_most is close.", /names standing_at_most/],
    ["The rats stay away because of any_party_bloodied.", /names any_party_bloodied/],
    // A colon doesn't hide an id: each part of the token is checked.
    ["The check:reeve_insight succeeds.", /names reeve_insight/],
    ["Now (yard_fight:begun) starts.", /names yard_fight/],
    ["The blade bites deep [r999].", /cites \[r999\], a roll the log doesn't have/],
    ["goblin_1 has 4 left.", /number \(4\)/],
    ["The goblin_12 falls.", /number \(12\)/],
  ];
  for (const [text, why] of refused) assert.match(guard(text) ?? "(let through)", why, text);
  for (const text of [
    "The blade bites deep [r12].",
    "Two goblins and a wolf wait by the mill_door; goblin_1 looks bloodied.",
    "Bren steps through the gate into s3_mill_yard.",
    "The reeve looks away when you ask about the mill.",
  ]) {
    assert.equal(guard(text), undefined, text);
  }
});

test("the guards read Russian: numbers in words from ten up and game statistics are refused, plain Russian prose passes", () => {
  // Runs with --lang ru (decision 0038): the DM and the AI players write Russian.
  const guard = narrationGuard({ ids: packIds(MILL), knownRoll: (id) => id === "r12" });
  const refused: Array<[string, RegExp]> = [
    ["У гоблина осталось двенадцать хитов.", /number \(двенадцать\)/],
    ["Двадцать гоблинов высыпают из мельницы.", /number \(Двадцать\)/],
    ["Сто стрел летят во двор.", /number \(Сто\)/],
    ["Волк выдержит ещё пятьдесят ударов.", /number \(пятьдесят\)/],
    ["Его КД высок.", /game statistic \(КД\)/],
    ["Это проверка со СЛ повыше.", /game statistic \(СЛ\)/],
    ["Гоблин почти без хитов.", /game statistic \(хитов\)/],
    ["Класс доспеха у волка невелик.", /game statistic \(Класс доспеха\)/],
    ["У неё мало очков здоровья.", /game statistic \(очков здоровья\)/],
    ["С таким бонусом атаки не промахнёшься.", /game statistic \(бонусом атаки\)/],
    // Copilot on table #122: the bare singular, the hundreds, the nominative.
    ["У гоблина остался один хит.", /game statistic \(хит\)/],
    ["Он держится на последнем хите.", /game statistic \(хите\)/],
    ["В деревне двести жителей.", /number \(двести\)/],
    ["В деревне меньше двухсот жителей.", /number \(двухсот\)/],
    ["Пятьсот шагов до мельницы.", /number \(Пятьсот\)/],
    ["Сотни крыс шуршат в амбаре.", /number \(Сотни\)/],
    ["Это низкий уровень опасности.", /game statistic \(уровень опасности\)/],
    ["Для такого уровня опасности их маловато.", /game statistic \(уровня опасности\)/],
  ];
  const speech = speechGuard({ shown: packIds(MILL).shown });
  for (const [text, why] of refused) {
    assert.match(guard(text) ?? "(let through)", why, `narration: ${text}`);
    assert.match(speech(text) ?? "(let through)", why, `speech: ${text}`);
  }
  for (const text of [
    "Гоблин хитро ухмыляется у стола [r12].",
    "Хитрый гоблин прячется за пятистенком.",
    "Семью мельника никто не видел с весны.",
    "Волк обходит двор с другой стороны; goblin_1 выглядит раненым.",
    "Двое гоблинов и волк ждут у mill_door, в паре шагов от ворот.",
    "Брен проходит в ворота, в s3_mill_yard стоит тишина.",
  ]) {
    assert.equal(guard(text), undefined, text);
  }
  assert.match(speech("У меня осталось пятнадцать хитов!") ?? "", /number \(пятнадцать\)/);
  assert.match(speech("Мой класс доспеха их не сдержит.") ?? "", /game statistic \(класс доспеха\)/);
  assert.equal(speech("Я тяжело ранена. Прикройте меня!"), undefined);
});

test("the speech guard refuses an AI player's numbers and game statistics, and lets plain talk through", () => {
  const guard = speechGuard({ shown: packIds(MILL).shown });
  assert.match(guard("I'm at 3 HP, cover me!") ?? "", /number \(3\)/);
  assert.match(guard("My armour class won't hold them.") ?? "", /game statistic \(armour class\)/);
  assert.match(guard("Only twelve arrows left.") ?? "", /number \(twelve\)/);
  assert.equal(guard("I'm badly hurt. Cover me while I pull back."), undefined);
  assert.equal(guard("Torva, take goblin_2 by the woodpile!"), undefined);
});

test("a refused line reaches no other seat and nothing in the transcript; the speaker gets the reason", async () => {
  const ids = { dmOnly: new Set(["yard_fight"]), shown: new Set<string>() };
  const t = await testTable({ seed: 1, speechGuard: speechGuard(ids), narrationGuard: narrationGuard({ ids, knownRoll: () => false }) });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    const said = await t.table.speak("maren", "I'm at 3 HP and my AC is poor.");
    assert.equal(said.ok, false);
    assert.match(said.text, /^Refused, nobody heard it: it holds a number \(3\)\. Say it without that\.$/);
    const narrated = await t.table.narrate("The yard_fight begins.");
    assert.equal(narrated.ok, false);
    assert.match(narrated.text, /^Refused, nobody heard it: it names yard_fight, which only the DM knows\. Rewrite it\.$/);
    for (const player of ["torva", "ilsa"]) assert.deepEqual(t.table.drainInbox(player), []);
    assert.deepEqual(t.table.drainDmInbox(), []);
    assert.equal(t.seat.shown.length, 0, "the human was shown nothing");
    assert.ok(t.table.transcript.records.every((r) => r.channel === "run"), "only the table's own retry lines are written");
    // The human's own words are theirs: no guard runs on them.
    assert.equal((await t.table.speak("bren", "I'm at 3 HP!")).ok, true);
  } finally {
    t.close();
  }
});
