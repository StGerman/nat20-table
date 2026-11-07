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

test("both guards refuse a word that mixes Russian and Latin letters, and pass either alphabet alone (AGT-38)", () => {
  const narration = narrationGuard({ ids: packIds(MILL), knownRoll: () => true });
  const speech = speechGuard({ shown: packIds(MILL).shown });
  for (const guard of [narration, speech]) {
    assert.match(guard("Смотритель Бранnок поднимает руку.") ?? "", /mixes Russian and Latin letters in one word \(Бранnок\)/);
    assert.equal(guard("Смотритель Браннок поднимает руку."), undefined);
    assert.equal(guard("Brannock raises a hand."), undefined);
    assert.equal(guard("Браннок кивает: «OK», и goblin_1 падает."), undefined, "a Latin word beside Russian ones is not a mixed word");
  }
});

test("in a Russian run the speech guard refuses a line with no Russian in it, and only there (AGT-38)", () => {
  const { shown } = packIds(MILL);
  const russian = speechGuard({ shown, language: "ru" });
  assert.match(russian("I check the barn door for tracks.") ?? "", /in English: say it in Russian/);
  assert.equal(russian("Осматриваю дверь амбара."), undefined);
  assert.equal(russian("goblin_1 — бей его!"), undefined, "a shown id beside Russian words passes");
  assert.equal(speechGuard({ shown, language: "en" })("I check the barn door for tracks."), undefined);
  assert.equal(speechGuard({ shown })("I check the barn door for tracks."), undefined);
});

test("in a Russian run both guards refuse a word in Latin letters beside Russian ones, and only there (AGT-73, F7)", () => {
  const ids = packIds(MILL);
  const speech = speechGuard({ shown: ids.shown, language: "ru" });
  const narration = narrationGuard({ ids, knownRoll: () => true, language: "ru" });
  for (const guard of [speech, narration]) {
    // Decision 0060 F7 and AGT-73's run 19-50-27.
    assert.match(guard("Torva идёт к старосте.") ?? "", /a word in Latin letters \(Torva\): write it in Russian/);
    assert.match(guard("Ильза идёт first.") ?? "", /\(first\)/);
    assert.match(guard("«Well, now…» — тянет староста.") ?? "", /\(Well\)/);
    assert.match(guard("torva идёт к старосте.") ?? "", /\(torva\)/, "a handle with no _ or digit is a name, written in Russian");
    assert.equal(guard("goblin_1 падает, и Торва идёт к старосте."), undefined, "a shown id passes");
    assert.equal(guard("Торва идёт к старосте, а Брен ждёт у ворот."), undefined);
    assert.equal(guard("Ильза сама спросит про пастуха. PASS"), undefined, "an answer word of the prompt passes (run 07-29-50, T92)");
  }
  assert.equal(narration("Гоблин падает [r12]."), undefined, "a roll citation is not a word");
  assert.equal(speechGuard({ shown: ids.shown })("Torva идёт к старосте."), undefined, "an English run lets it pass");
  assert.equal(narrationGuard({ ids, knownRoll: () => true })("Torva идёт к старосте."), undefined, "an English run lets it pass");
  assert.equal(speechGuard({ shown: ids.shown, language: "ru" })("I go first."), "it is in English: say it in Russian", "a line all in English keeps its own reason");
});

test("the narration guard refuses a number for a game statistic, a roll's modifiers, DM-only ids and unknown roll ids", () => {
  const guard = narrationGuard({ ids: packIds(MILL), knownRoll: (id) => id === "r12" });
  const refused: Array<[string, RegExp]> = [
    ["The goblins look tough, AC 15 or so.", /number for a game statistic \(AC, 15\)/],
    ["The lock is a DC fifteen.", /\(DC, fifteen\)/],
    ["goblin_1 has 3 HP left.", /\(HP, 3\)/],
    ["The wolf is at 7/10 hit points.", /\(hit points, 7\/10\)/],
    ["Its Armor Class of about 13 holds.", /\(Armor Class, 13\)/],
    ["Its AC: 15.", /\(AC, 15\)/],
    // Review of table #326: a number glued to its statistic, a hyphenated number, a bonus, health, a far number.
    ["AC15 at best.", /\(AC, 15\)/],
    ["DC12 to climb.", /\(DC, 12\)/],
    ["goblin_1 has HP3 left.", /\(HP, 3\)/],
    ["The goblin's AC is twenty-two.", /\(AC, twenty-two\)/],
    ["The goblin swings, +4 to hit.", /\(to hit, \+4\)/],
    ["Its bonus is +5.", /\(bonus, \+5\)/],
    ["The goblin has 3 health left.", /\(health, 3\)/],
    ["The Armor Class of the goblin standing by the door is 15.", /\(Armor Class, 15\)/],
    ["You rolled 19 (14 + 5).", /a roll's modifiers \(\(14 \+ 5\)\)/],
    ["You rolled 1d20+5 for a 19.", /a roll's modifiers \(1d20\+5\)/],
    ["That is 14 – 5 = 9.", /a roll's modifiers/],
    ["A goblin at two hit points crawls away.", /\(hit points, two\)/],
    ["Bren's blow, 1d20 (14) +5 = 19, lands.", /a roll's modifiers/],
    ["The total is 14 + 5 = 19.", /a roll's modifiers/],
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
  ];
  for (const [text, why] of refused) assert.match(guard(text) ?? "(let through)", why, text);
  // Numbers and game words the table may know (AGT-95, decision 0064).
  for (const text of [
    "The blade bites deep [r12].",
    "Two goblins and a wolf wait by the mill_door; goblin_1 looks bloodied.",
    "Bren steps through the gate into s3_mill_yard.",
    "The reeve looks away when you ask about the mill.",
    "Fifteen goblins pour out of the mill.",
    "Odda counts out 12 gold pieces into each palm: three days of road, 2 a day, and a bonus for the bridge.",
    "The mill is 300 feet off, past the second fence.",
    "Bren rolls a 17 on the d20 [r12], and the goblin's AC doesn't save it.",
    "Its AC is high: steel under the rags.",
    "Maren heals you; the hit points come back with the warmth.",
    "You have advantage on this one: the wolf hasn't seen you.",
    "goblin_1 has 4 friends behind the woodpile.",
    "No one here has hit points to spare.",
    "Keep your AC up, 2 more goblins come!",
    "Odda adds a bonus of two silver for the bridge.",
    "Two to hit the left one, Torva!",
    "The ford is 3–4 days off (2 by the old road).",
    "The goblin_12 falls.",
  ]) {
    assert.equal(guard(text), undefined, text);
  }
});

test("the guards read Russian: a number in digits or words beside a game statistic is refused, numbers elsewhere and game words alone pass", () => {
  // Runs with --lang ru (decision 0038): the DM and the AI players write Russian.
  const guard = narrationGuard({ ids: packIds(MILL), knownRoll: (id) => id === "r12" });
  const refused: Array<[string, RegExp]> = [
    ["У гоблина осталось двенадцать хитов.", /\(хитов, двенадцать\)/],
    ["У гоблина остался один хит.", /\(хит, один\)/],
    ["Гоблин держится на трёх хитах.", /\(хитах, трёх\)/],
    ["Его КД 15, не меньше.", /\(КД, 15\)/],
    ["КД у волка — 13.", /\(КД, 13\)/],
    ["Осталось 7 здоровья.", /\(здоровья, 7\)/],
    ["Гоблин бьёт с +3 к попаданию.", /\(к попаданию, \+3\)/],
    ["Это проверка со СЛ двенадцать.", /\(СЛ, двенадцать\)/],
    ["Класс доспеха у волка всего 13.", /\(Класс доспеха, 13\)/],
    ["У неё пять очков здоровья.", /\(очков здоровья, пять\)/],
    ["С бонусом атаки +4 не промахнёшься.", /\(бонусом атаки, \+4\)/],
    ["Это уровень опасности два.", /\(уровень опасности, два\)/],
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
    "Двадцать гоблинов высыпают из мельницы.",
    "Одда отсчитывает каждому по 12 золотых: три дня дороги.",
    "До мельницы пятьсот шагов.",
    "Его КД высок: под тряпьём кольчуга.",
    "Гоблин почти без хитов.",
    "Бросок 17 на к20 [r12]. Хиты гоблина тают.",
    "До брода дня три–четыре (два по старой дороге).",
  ]) {
    assert.equal(guard(text), undefined, text);
  }
  assert.match(speech("У меня осталось пятнадцать хитов!") ?? "", /\(хитов, пятнадцать\)/);
  assert.equal(speech("Мой класс доспеха их не сдержит."), undefined, "a game word alone passes");
  assert.equal(speech("Я тяжело ранена. Прикройте меня!"), undefined);
});

test("the speech guard refuses an AI player's number for a game statistic, and lets numbers and game words through", () => {
  const guard = speechGuard({ shown: packIds(MILL).shown });
  assert.match(guard("I'm at 3 HP, cover me!") ?? "", /\(HP, 3\)/);
  assert.match(guard("My armour class is 16, I'll take the front.") ?? "", /\(armour class, 16\)/);
  assert.equal(guard("Only twelve arrows left."), undefined);
  assert.equal(guard("My armour class won't hold them."), undefined);
  assert.equal(guard("Three gold for a bowl of soup? Robbery."), undefined);
  assert.equal(guard("I'm badly hurt. Cover me while I pull back."), undefined);
  assert.equal(guard("Torva, take goblin_2 by the woodpile!"), undefined);
  assert.match(guard("Its AC [r3] 15, I swear.") ?? "", /\(AC, 15\)/, "a citation is not the number");
});

test("a refused line reaches no other seat and nothing in the transcript; the speaker gets the reason", async () => {
  const ids = { dmOnly: new Set(["yard_fight"]), shown: new Set<string>() };
  const t = await testTable({ seed: 1, speechGuard: speechGuard(ids), narrationGuard: narrationGuard({ ids, knownRoll: () => false }) });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    const said = await t.table.speak("maren", "I'm at 3 HP and my AC is poor.");
    assert.equal(said.ok, false);
    assert.match(said.text, /^Refused, nobody heard it: it gives a number for a game statistic \(HP, 3\): the table never hears those\. Say it without that\.$/);
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

test("an AI player's line to an NPC by handle passes the Russian guard; a prose addressee is guarded (AGT-84, review of table #289)", async () => {
  const ids = { dmOnly: new Set(["yard_fight"]), shown: new Set<string>() };
  const t = await testTable({ seed: 1, speechGuard: speechGuard({ shown: ids.shown, language: "ru" }), narrationGuard: narrationGuard({ ids, knownRoll: () => false }) });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    assert.equal((await t.table.speak("maren", "Сколько ты хочешь за зерно?", "odda_vell")).ok, true, "a handle with no Cyrillic is not English");
    assert.equal((await t.table.speak("maren", "Отойди с дороги.", "bandit_1")).ok, true, "a handle's digit is not a number");
    const prose = await t.table.speak("maren", "Отойди с дороги.", "the man with 3 dogs");
    assert.equal(prose.ok, false, "an addressee in words is guarded like the line");
    assert.equal((await t.table.speak("maren", "Пойдём.", " maren ")).ok, false, "a padded own handle is still the speaker (Copilot on table #289)");
  } finally {
    t.close();
  }
});

test("the speech guard refuses a lone DM-only id as an addressee and passes any other handle (Copilot on table #289)", () => {
  const ids = packIds(MILL);
  const guard = speechGuard({ shown: ids.shown, language: "ru", dmOnly: ids.dmOnly });
  assert.match(guard("yard_fight") ?? "", /names yard_fight, which only the DM knows/);
  assert.equal(guard("odda_vell"), undefined);
  assert.equal(guard("bandit_1"), undefined);
});
