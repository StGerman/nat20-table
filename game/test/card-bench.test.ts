// The card bench with no model (AGT-123, decision 0084, `docs/design/card-bench.md` §6): the
// temporary pack loads for every road and arrival card a campaign pack's route reaches, and that
// card is the first card on the table; a card that reads a deed comes on a roster a scripted
// contract saved; a line that becomes an own move settles the card and ends the bench run;
// `play:card` runs end to end with a scripted DM; and its report, `bench.md` (AGT-124), has one
// block a line.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Event, Roster } from "@nat20-table/engine-client";
import { REPO } from "../src/engine.ts";
import { readCampaign } from "../src/pack/campaign.ts";
import { readPack } from "../src/pack/read.ts";
import { BenchError, benchLines, benchPack, benchPlan, benchRoster, packsReaching } from "../src/play/bench.ts";
import { benchReport } from "../src/play/bench-report.ts";
import type { RunRecord } from "../src/play/record.ts";
import { writeRoster } from "../src/play/roster.ts";
import { castParty } from "../src/play/run.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat, benchSeat, caravanSeat, votesOwnMove, type BenchSeatLog } from "../src/table/scripted.ts";
import type { TranscriptRecord } from "../src/table/types.ts";
import type { UsageRecord } from "../src/usage.ts";
import { testTable } from "./helpers.ts";

const FAIR = path.join(REPO, "scenarios/fair_in_wend");
const WAY_BACK = path.join(REPO, "scenarios/the_way_back");
/** The campaign packs: every pack under `scenarios/` with a campaign file. */
const CAMPAIGNS = readdirSync(path.join(REPO, "scenarios"))
  .map((name) => path.join(REPO, "scenarios", name))
  .filter((pack) => existsSync(path.join(pack, "campaign.json")));

interface Card {
  id: string;
  when?: string;
  chained?: boolean;
  if?: unknown;
  unless?: unknown;
  requires?: string;
}

/** Every card of a pack: its world's deck and its own. */
function cards(pack: string): Card[] {
  const world = (JSON.parse(readFileSync(path.join(pack, "campaign.json"), "utf8")) as { world: { map: string } }).world.map;
  return [path.join(REPO, "worlds", world, "deck"), path.join(pack, "deck")].flatMap((dir) =>
    readdirSync(dir).filter((f) => f.endsWith(".json")).sort().flatMap((f) => (JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { cards: Card[] }).cards),
  );
}

/** A scripted DM that makes every player's words on a card an own move: Persuasion DC 5, the card's first choice on a success, its second on a failure. */
function movingDm(): ScriptedDm {
  return new ScriptedDm({
    card_words: async (tools, briefing) => {
      const ids = [...(/^Its choices: (.*)$/m.exec(briefing)?.[1] ?? "").matchAll(/(?:^|\| )([a-z0-9_]+): /g)].map((m) => m[1]!);
      await tools.ownMoveOrAnswer("The man listens.", { ability: "charisma", skill: "persuasion", dc: 5, success: ids[0]!, failure: ids[1]! });
    },
  });
}

/** One bench run with no model: the copy of `pack` for `card`, the bench's seats, a scripted DM. */
async function benchRun(pack: string, card: string, lines: string[], options: { dm?: ScriptedDm; roster?: Roster } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "card-bench-test-"));
  try {
    const { dir, plan } = benchPack(pack, card, root);
    const cast = castParty(dir);
    const human = cast.human!;
    const log: BenchSeatLog = { reached: false, typed: [] };
    const t = await testTable({ seed: 3, pack: dir, human, players: cast.ai, seat: new ScriptedSeat(human, [], benchSeat(lines, log)), ...(options.roster ? { roster: options.roster } : {}) });
    try {
      const campaign = readCampaign(dir)!;
      const loop = new TableLoop({
        table: t.table,
        dm: options.dm ?? new ScriptedDm({}),
        players: cast.ai.map((h) => new ScriptedPlayer(h, { card: votesOwnMove })),
        maxSteps: 400,
        campaign: { party: [human, ...cast.ai], keepsParty: true, startDay: campaign.startDay, ...(campaign.dayLimit !== undefined ? { dayLimit: campaign.dayLimit } : {}) },
      });
      const report = await loop.run(campaign.startScene);
      const logged = await t.engine.request("dm", { cmd: "events", since: 0 });
      assert.ok(logged.result?.cmd === "events");
      return { plan, log, report, events: logged.result.events as Event[], requests: t.requests() };
    } finally {
      t.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const shown = (events: Event[]) => events.flatMap((e) => (e.kind === "card_shown" ? [e.card] : []));

test("the bench plans the shortest stretch to a card: from the last place with a scene of its own to where the card's leg ends", () => {
  const stretch = (pack: string, card: string) => {
    const plan = benchPlan(pack, card);
    return [plan.when, plan.start, plan.route.join(" > ")];
  };
  assert.deepEqual(stretch(FAIR, "bog_wifes_toll"), ["road", "highsteads", "highsteads > wendford"]);
  assert.deepEqual(stretch(FAIR, "millbeck_bridge"), ["road", "wendford", "wendford > millbeck_bridge"]);
  // The bridge has no scene of its own, so a lowland card starts at Wendford and crosses the bridge road first.
  assert.deepEqual(stretch(FAIR, "rutted_road"), ["road", "wendford", "wendford > millbeck_bridge > midwend"]);
  assert.deepEqual(stretch(FAIR, "toll_paid_word"), ["arrival", "highsteads", "highsteads > wendford"]);
  assert.deepEqual(stretch(WAY_BACK, "salt_on_credit"), ["road", "wendford", "wendford > highsteads"]);
  assert.deepEqual(stretch(WAY_BACK, "the_fair_price"), ["arrival", "wendmouth", "wendmouth > midwend > millbeck_bridge > wendford"]);
  // The deeds a card reads, and the chained cards its choices add, which the copy keeps.
  assert.deepEqual(benchPlan(FAIR, "toll_paid_word").needs, ["paid_the_toll"]);
  assert.deepEqual(benchPlan(FAIR, "toll_paid_word").barred, ["toll_men_spared"]);
  assert.deepEqual(benchPlan(FAIR, "millbeck_bridge").kept, ["millbeck_bridge", "peddlers_mark"]);
  assert.deepEqual(benchPlan(FAIR, "barefoot_pilgrim").kept, ["barefoot_pilgrim", "what_agna_drew"]);

  const refused = (pack: string, card: string) => {
    try {
      benchPlan(pack, card);
    } catch (error) {
      assert.ok(error instanceof BenchError, String(error));
      return error.message;
    }
    return assert.fail(`${card} was planned`);
  };
  assert.match(refused(FAIR, "no_such_card"), /has no card no_such_card/);
  assert.match(refused(FAIR, "goblin_ambush"), /is a chained card/);
  assert.match(refused(FAIR, "river_mist"), /is a night card/);
  assert.match(refused(FAIR, "barrow_lights"), /road card of the zone barrows, which .* never crosses: its route highsteads > wendford > millbeck_bridge > midwend > wendmouth/);
  // Fair in Wend starts at the Highsteads and never arrives there.
  assert.match(refused(FAIR, "gwyn_news"), /arrival card of highsteads, where .* never arrives/);
  assert.match(refused(path.join(REPO, "scenarios/the_silent_mill"), "bog_wifes_toll"), /has no campaign\.json/);
  // A pack's own card is reached only in that pack; a world card in every pack whose route crosses its zone.
  assert.deepEqual(packsReaching("salt_on_credit"), ["scenarios/the_way_back"]);
  assert.deepEqual(packsReaching("bog_wifes_toll"), ["scenarios/fair_in_wend", "scenarios/the_way_back"]);
});

test("a lines file is one line a row: # rows are notes, ~ rows are left out and never typed", () => {
  assert.deepEqual(benchLines("# questions first\nWho set you here?\n\n  ~ As we agreed at the fair.  \nWe pay nothing.\n"), {
    lines: ["Who set you here?", "We pay nothing."],
    leftOut: ["As we agreed at the fair."],
  });
});

test("the bench's copy leaves the pack as it was, holds the one card, and still reads as a pack", () => {
  const root = mkdtempSync(path.join(tmpdir(), "card-bench-test-"));
  try {
    const before = readFileSync(path.join(FAIR, "campaign.json"), "utf8");
    const { dir, plan } = benchPack(FAIR, "millbeck_bridge", root);
    assert.equal(readFileSync(path.join(FAIR, "campaign.json"), "utf8"), before);
    const world = (JSON.parse(readFileSync(path.join(dir, "campaign.json"), "utf8")) as { world: { start: string; route: string[]; escort: { destination: string } } }).world;
    assert.deepEqual([world.start, world.route, world.escort.destination], ["wendford", plan.route, "millbeck_bridge"]);
    const left = [path.join(dir, "worlds/wend/deck"), path.join(dir, "deck")].flatMap((deck) =>
      readdirSync(deck).flatMap((f) => (JSON.parse(readFileSync(path.join(deck, f), "utf8")) as { cards: Card[] }).cards.map((c) => c.id)),
    );
    assert.deepEqual(left.sort(), ["millbeck_bridge", "odda_falls", "peddlers_mark"]);
    // The DM's pack text: the lore outside the pack still reads from the copy.
    assert.match(readPack(dir).text, /## Lore\n\n\S/);
    // A second copy into the same folder is refused: every bench run takes a fresh one.
    assert.throws(() => benchPack(FAIR, "millbeck_bridge", root), BenchError);
    // A saved party is copied with its hash chain, and a missing one is refused.
    const rosters = path.join(root, "saved");
    writeRoster(rosters, "wend", { format: 2, characters: [] } as unknown as Roster, "run-1");
    benchRoster(rosters, "wend", path.join(root, "rosters"));
    assert.deepEqual(readdirSync(path.join(root, "rosters")).sort(), ["wend.chain.jsonl", "wend.json"]);
    assert.throws(() => benchRoster(rosters, "nobody", path.join(root, "rosters")), /no saved party/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const pack of CAMPAIGNS) {
  const name = path.basename(pack);
  // The cards the bench covers with no saved party: road and arrival cards on the route, not chained, reading no deed.
  const covered = cards(pack).filter((c) => (c.when ?? "road") !== "night" && !c.chained && c.if === undefined && c.unless === undefined && c.requires === undefined && packsReaching(c.id).includes(`scenarios/${name}`));
  test(`${name}: the copy loads for each of its ${covered.length} road and arrival cards that read no deed, and that card is the first on the table`, async () => {
    assert.ok(covered.length >= 10, `${name} covers ${covered.map((c) => c.id).join(", ")}`);
    for (const card of covered) {
      const run = await benchRun(pack, card.id, ["A plain question."]);
      assert.deepEqual(shown(run.events).slice(0, 1), [card.id], `${card.id}: ${run.report.ended}`);
      // The seat typed its line at the card and left when the lines ran out: it never picked a number.
      assert.deepEqual([run.log.reached, run.log.typed, run.log.left], [true, ["A plain question."], "lines_out"], card.id);
      assert.ok(!run.requests.some((r) => r.cmd === "choose_card"), `${card.id}: nobody gave a word`);
      assert.ok(!run.events.some((e) => e.kind === "card_resolved"), `${card.id}: not settled`);
    }
  });
}

test("a card that reads a deed comes on a roster a scripted contract saved; a line that becomes an own move settles it and ends the bench run", async () => {
  // Fair in Wend, scripted, crosses the Millbeck: every choice of its bridge card writes crossed_millbeck.
  const cast = castParty(FAIR);
  const first = await testTable({ seed: 3, pack: FAIR, human: cast.human!, players: cast.ai, seat: new ScriptedSeat(cast.human!, [], caravanSeat()) });
  let roster: Roster;
  try {
    const campaign = readCampaign(FAIR)!;
    const loop = new TableLoop({
      table: first.table,
      dm: new ScriptedDm({}),
      players: cast.ai.map((h) => new ScriptedPlayer(h)),
      maxSteps: 400,
      campaign: { party: [cast.human!, ...cast.ai], keepsParty: true, startDay: campaign.startDay, dayLimit: campaign.dayLimit! },
    });
    assert.equal((await loop.run(campaign.startScene)).ended, "the escort contract is done");
    const saved = await first.engine.request("dm", { cmd: "save_roster" });
    assert.ok(saved.result?.cmd === "save_roster");
    roster = saved.result.roster;
  } finally {
    first.close();
  }
  const plan = benchPlan(WAY_BACK, "bridge_again");
  assert.deepEqual([plan.needs, plan.route.join(" > ")], [["crossed_millbeck"], "wendmouth > midwend > millbeck_bridge"]);

  // With no saved party nothing remembers the deed: the card never comes, and the cut contract ends at the bridge.
  const cold = await benchRun(WAY_BACK, "bridge_again", ["Who set you here?"]);
  assert.deepEqual([shown(cold.events), cold.log.reached, cold.report.ended], [[], false, "the escort contract is done"]);

  // On the saved party it is the first card; the first line becomes an own move, the AI seats vote for it, and the card is settled.
  const run = await benchRun(WAY_BACK, "bridge_again", ["We pay nothing: show us the reeve's seal.", "A second line, never typed."], { dm: movingDm(), roster });
  assert.deepEqual(shown(run.events).slice(0, 1), ["bridge_again"], run.report.ended);
  assert.deepEqual([run.log.typed, run.log.left], [["We pay nothing: show us the reeve's seal."], "settled"]);
  const votes = run.requests.filter((r) => r.cmd === "choose_card");
  assert.deepEqual(votes.map((r) => r.choice), cast.ai.map(() => "own_move"), "every AI seat votes for the own move, and the human seat picks no number");
  const ran = run.events.find((e) => e.kind === "own_move_ran");
  assert.ok(ran?.kind === "own_move_ran" && ran.roll != null, "the own move's roll happened");
  const settled = run.events.filter((e) => e.kind === "card_resolved");
  assert.equal(settled.length, 1, "the card is settled once, by the own move's success or failure choice");
  assert.equal(run.report.ended, "the human quit");
});

test("play:card runs end to end with a scripted DM: it passes the scripted-players guard, a line that settles the card ends the bench run, the lines left start a fresh one, and it stops when they run out", () => {
  const out = mkdtempSync(path.join(tmpdir(), "card-bench-cli-"));
  try {
    const lines = path.join(out, "lines.txt");
    // The scripted bench DM answers a question and makes any other words an own move.
    writeFileSync(lines, "# the bog-wife\nWhat do you want for the crossing?\n~ As we agreed at the fair, let us pass.\nWe carry your peat to the Highsteads instead.\nAnd who taught you the way?\n");
    const node = ["--experimental-strip-types", "--no-warnings"];
    const card = path.join(REPO, "game/src/play/card.ts");
    // The command's temporary copies go under this folder, so the test sees what a run leaves behind.
    const tmp = path.join(out, "tmp");
    mkdirSync(tmp);
    const play = (...args: string[]) =>
      spawnSync(process.execPath, [...node, card, "--dm", "scripted", "--no-upload", "--seed", "3", "--out", path.join(out, "runs"), ...args], { encoding: "utf8", env: { ...process.env, TMPDIR: tmp } });

    const run = play("--card", "bog_wifes_toll", "--pack", WAY_BACK, "--lines", lines);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /Card bench of bog_wifes_toll: 3 of 3 lines typed in 2 bench runs\. The lines ran out with bog_wifes_toll still waiting\./);
    assert.match(run.stdout, /Left out, not typed: As we agreed at the fair, let us pass\./);
    const folders = readdirSync(path.join(out, "runs")).sort();
    assert.equal(folders.length, 2, folders.join(", "));
    const [folder] = folders;
    assert.match(folder!, /^card-/);
    const file = (run: string, name: string) => readFileSync(path.join(out, "runs", run, name), "utf8");
    const record = JSON.parse(file(folder!, "run.json")) as RunRecord;
    assert.equal(record.command, "play:card");
    // The scripted DM's lines are English, so a run with no model is English and the narration guard refuses none of them.
    assert.deepEqual(record.settings.lang, { value: "en", from: "default" });
    assert.doesNotMatch(file(folder!, "report.md"), /narration refused/);
    assert.deepEqual(record.bench, { card: "bog_wifes_toll", pack: "scenarios/the_way_back", route: ["wendford", "highsteads"], lines_file: lines, left_out: ["As we agreed at the fair, let us pass."], lines_before: 0 });
    // Bench run 1: the question is answered and the card waits; the plan becomes an own move and settles it. The seat's other inputs are the road's numbered lines.
    const typed = (run: string) =>
      file(run, "inputs.jsonl")
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row) as { text: string; human?: boolean })
        .flatMap((row) => (row.human ? [JSON.parse(row.text) as { kind: string; text?: string }] : []))
        .flatMap((intent) => (intent.kind === "text" ? [intent.text] : []));
    assert.deepEqual(typed(folders[0]!), ["What do you want for the crossing?", "We carry your peat to the Highsteads instead."]);
    assert.match(file(folders[0]!, "transcript.jsonl"), /bren on the road card: own move \\"We carry your peat to the Highsteads instead\.\\"/);
    assert.match(file(folders[0]!, "report.md"), /Own moves put on a card: 1/);
    // Bench run 2, on a fresh copy: the card is on the table again and takes the line left.
    assert.deepEqual(typed(folders[1]!), ["And who taught you the way?"]);
    assert.match(file(folders[1]!, "report.md"), /First card: bog_wifes_toll/);
    // The report (AGT-124): `bench.md` in each bench run's folder, one block a line, with no model.
    assert.match(run.stdout, /Send bench\.md back to the thread/);
    const first = file(folders[0]!, "bench.md");
    assert.match(first, /^# Card bench: bog_wifes_toll$/m);
    assert.match(first, /^- Pack: scenarios\/the_way_back, cut to wendford > highsteads$/m);
    assert.match(first, /^- DM: scripted \(no model\); language en$/m);
    assert.match(first, /^- The card: settled on `own_move` \(majority\)$/m);
    assert.match(first, /^- Cost: no model calls$/m);
    assert.match(first, /^- `walk_past`: Walk past her\.$/m);
    assert.deepEqual(first.match(/^## .*$/gm), ['## Line 1: "What do you want for the crossing?"', '## Line 2: "We carry your peat to the Highsteads instead."', "## Left out, not typed"]);
    const [, answered, moved] = first.split(/^## Line /m);
    // A question: the DM answers, the card waits, nothing is rolled or remembered.
    assert.match(answered!, /^- The DM's call: an answer, no own move; the card waits$/m);
    assert.match(answered!, /^- The card was not decided on this line$/m);
    assert.match(answered!, /^- remember: none$/m);
    assert.match(answered!, /  - card_words:\n    > The road gives its answer\.\n/);
    assert.doesNotMatch(answered!, /roll|Votes|Then the engine/);
    // A plan: the own move with its check and choices, the votes, the engine's roll, the choice it brought, the deeds, the fact kept, the DM's words.
    assert.match(moved!, /^- The DM's call: an own move, persuasion \(charisma\) DC 10; success brings `bread` \(Give her bread\.\), failure `true_word` \(Tell her something true\.\)$/m);
    assert.match(moved!, /^- Votes: bren own_move, torva own_move, maren own_move, ilsa own_move$/m);
    assert.doesNotMatch(moved!, /chose without words/);
    const rolled = /^- The own move's roll: (r\d+): bren rolls a Charisma \(Persuasion\) check: .* vs DC 10, (success|failure)\.$/m.exec(moved!);
    assert.ok(rolled, moved);
    assert.ok(file(folders[0]!, "session-log.jsonl").includes(`"id":"${rolled[1]}"`), "the report's roll is the engine's (Rule 4)");
    assert.match(moved!, new RegExp(`^- The own move brought: \`${rolled[2] === "success" ? "bread" : "true_word"}\``, "m"));
    assert.match(moved!, /^- The card was decided: `own_move` \(majority\)$/m);
    assert.match(moved!, /^- Then the engine logged:\n  - The world remembers own_move_bog_wifes_toll, by bren, torva, maren, ilsa\.$/m);
    assert.match(moved!, /^- remember:\n  - by its place in the transcript:\n    > The road heard a plan\.$/m);
    // The cut contract's pay at the end of the card's leg is not what the card did.
    assert.doesNotMatch(moved!, /The caravan reaches|in wages/);
    assert.match(moved!, /  - card_words:\n    > The road hears the plan\.\n  - road:\n    > The caravan moves on along the road\.\n\n## Left out/);
    assert.doesNotMatch(first, /The caravan comes to a new place/, "the arrival's scene is not the card's outcome");
    assert.match(first, /## Left out, not typed\n\n- As we agreed at the fair, let us pass\.\n$/);
    // Bench run 2 numbers its line after the two typed before it, and says the card still waits.
    const second = file(folders[1]!, "bench.md");
    assert.match(second, /; 1 typed in this bench run, 2 in the bench runs before it$/m);
    assert.match(second, /^- The card: still waiting when the bench run ended$/m);
    assert.deepEqual(second.match(/^## Line .*$/gm), ['## Line 3: "And who taught you the way?"']);
    // The temporary copy is gone, and the pack's own play commands still refuse scripted players on a campaign.
    assert.ok(!existsSync(record.settings.pack!.value as string), "the copy is removed when the bench run ends");
    assert.deepEqual(readdirSync(tmp), [], "both copies are removed");
    const scene = spawnSync(process.execPath, [...node, path.join(REPO, "game/src/play/full.ts"), "--dm", "scripted", "--players", "scripted", "--pack", FAIR, "--no-upload", "--out", path.join(out, "other")], { encoding: "utf8" });
    assert.equal(scene.status, 2);
    assert.match(scene.stderr, /scripted players never move the caravan/);

    // What the bench refuses before it copies or starts anything.
    const refused = (args: string[], why: RegExp) => {
      const r = play(...args);
      assert.equal(r.status, 2, r.stdout);
      assert.match(r.stderr, why);
      assert.deepEqual(readdirSync(tmp), [], `refused before anything is copied: ${args.join(" ")}`);
    };
    refused(["--pack", FAIR, "--lines", lines], /--card names the card to bench/);
    refused(["--card", "bog_wifes_toll", "--lines", lines], /--pack names the campaign pack to bench bog_wifes_toll in\. The packs that reach bog_wifes_toll: scenarios\/fair_in_wend, scenarios\/the_way_back\./);
    refused(["--card", "millbeck_bridge", "--pack", FAIR], /--lines names the file of lines/);
    refused(["--card", "goblin_ambush", "--pack", FAIR, "--lines", lines], /is a chained card/);
    refused(["--card", "toll_paid_word", "--pack", FAIR, "--lines", lines], /comes only to a party that remembers paid_the_toll: play it on a saved party with --roster NAME/);
    refused(["--card", "toll_paid_word", "--pack", FAIR, "--lines", lines, "--roster", "nobody", "--rosters", path.join(out, "rosters")], /--roster nobody: no saved party/);
    refused(["--card", "bog_wifes_toll", "--pack", WAY_BACK, "--lines", lines, "--seat", "ink"], /name one of the two/);
    assert.deepEqual(readdirSync(path.join(out, "runs")).sort(), folders, "a refused bench starts no run");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("the bench report from a run's records: a fact kept after its wake settled goes to its own line, an engine refusal with its reason, an own move that fell and a card then settled by a number, and each line's cost", () => {
  const event = (seq: number, kind: string, text: string, rest: object = {}) => ({ seq, scene: "s", visibility: { scope: "dm" }, text, kind, ...rest }) as unknown as Event;
  const log = [
    event(1, "card_shown", "toll goes on the table.", { card: "toll", zone: "millbeck", when: "road" }),
    event(2, "card_drawn", "A road card.", { target: "blades", card_text: "A man at the bridge wants two silver a head.", choices: [{ id: "pay", text: "Pay him." }, { id: "talk", text: "Talk him down." }] }),
    event(3, "card_own_move", "bren says something else.", { actor: "bren", words: "I lean on him", skill: "intimidation" }),
    event(4, "own_move_set", "bren's own move on toll.", { card: "toll", actor: "bren", ability: "charisma", skill: "intimidation", dc: 15, success: "talk", failure: null }),
    event(5, "card_advice", "torva says: own_move.", { actor: "torva", choice: "own_move" }),
    event(6, "roll", "bren rolls a Charisma (Intimidation) check: 1d20 (4) +1 = 5 vs DC 15, failure.", { roll: { id: "r6", kind: "skill_check", outcome: "failure" } }),
    event(7, "check_resolved", "bren's check fails.", { actor: "bren", roll_id: "r6", success: false }),
    event(8, "own_move_ran", "The own move brings nothing.", { card: "toll", choice: null, roll: "r6" }),
    event(9, "deed_remembered", "The world remembers own_move_toll, by bren.", { deed: "own_move_toll", by: ["bren"] }),
    event(10, "card_advice", "bren says: pay.", { actor: "bren", choice: "pay" }),
    event(11, "card_advice", "torva says: pay.", { actor: "torva", choice: "pay" }),
    event(12, "card_resolved", "The card is decided: pay.", { choice: "pay", decided: "majority" }),
    event(13, "ledger", "bren pays 2 silver pieces in toll.", { reason: "toll" }),
    event(14, "time_lost", "The caravan loses 20 minutes.", { minutes: 20 }),
    // The cut contract ends at the card's leg: its pay is not the card's doing.
    event(15, "ledger", "npc:fenn pays bren 2 gold pieces in wages.", { reason: "wage" }),
    event(16, "escort_settled", "The caravan reaches b; the Blades are paid what they are owed.", { destination: "b" }),
    event(17, "roll", "world rolls road card: 1d100 (39) = 39.", { roll: { id: "r17", kind: "table", outcome: "value" } }),
    event(18, "card_shown", "other goes on the table.", { card: "other", zone: "millbeck", when: "road" }),
    event(19, "own_move_set", "bren's own move on other.", { card: "other", actor: "bren", ability: "wisdom", skill: "insight", dc: 10, success: "x", failure: null }),
  ];
  const said = (log_head: number, speaker: string, channel: TranscriptRecord["channel"], kind: TranscriptRecord["kind"], text: string, rest: Partial<TranscriptRecord> = {}): TranscriptRecord => ({ at: "t", speaker, channel, kind, text, rolls: [], log_head, ...rest });
  const transcript = [
    said(2, "dm", "table", "narration", "A man steps out at the bridge.", { wake: "card" }),
    said(2, "table", "run", "system", "card toll goes to the seats"),
    said(2, "bren", "table", "intent", "What does he charge?", { human: true }),
    said(2, "dm", "table", "narration", "Two silver a head, he says.", { wake: "card_words" }),
    said(2, "bren", "table", "intent", "I lean on him", { human: true }),
    // The first line's wake settled on its answer; its `remember` landed after the seat typed the second line.
    said(2, "dm", "memory:dm", "memory", "The toll is two silver a head."),
    said(2, "dm", "run", "retry", "memory refused: it names a DC"),
    said(2, "dm", "run", "retry", "dm: own_move refused: invalid_request (bad_own_move): the failure pay breaks no custom the words asked for"),
    said(4, "dm", "table", "narration", "He looks you up and down.", { wake: "card_words" }),
    // The fall has its own road wake, before the person settles the card by a number.
    said(9, "dm", "memory:dm", "memory", "He will not be leaned on."),
    said(9, "dm", "table", "narration", "He does not budge.", { wake: "road" }),
    said(9, "dm", "memory:dm", "memory", "summary: The road so far."),
    said(9, "bren", "run", "intent", "bren on the road card: Pay him."),
    said(16, "dm", "memory:dm", "memory", "The toll-man let them through\nand kept the coin."),
    said(16, "dm", "table", "narration", "The coin changes hands.", { wake: "road" }),
    // The cut contract's pay, the arrival's scene and the next card are not the card's outcome.
    said(16, "dm", "table", "narration", "The Blades are paid.", { wake: "road" }),
    said(16, "dm", "memory:dm", "memory", "summary: The pay."),
    said(16, "dm", "table", "narration", "The gate of b stands open.", { wake: "scene_open" }),
    said(18, "table", "run", "system", "card other goes to the seats"),
    said(18, "dm", "table", "narration", "Another card.", { wake: "card" }),
    said(19, "bren", "table", "intent", "Not a line of the bench", { human: true }),
  ];
  const wake = (agent: string, purpose: string, usd: number, wall_ms: number, tools: string[], rest: Partial<UsageRecord> = {}) => ({ agent, purpose, api_equivalent_usd: usd, wall_ms, outcome: "ok", tools, ...rest }) as UsageRecord;
  const usage = [
    wake("dm", "scene_open", 0.3, 20_000, ["narrate"]),
    wake("dm", "card", 0.04, 5000, [], { outcome: "timeout" }),
    wake("dm", "card_words", 0.05, 6000, ["own_move_or_answer", "remember"], { settled_early: true, waited_ms: 4000 }),
    wake("torva", "card", 0.01, 1000, ["choose_card"]),
    wake("dm", "card_words", 0.04, 5000, ["remember", "own_move_or_answer", "own_move_or_answer"]),
    wake("dm", "road", 0.02, 2000, ["narrate", "remember"]),
    wake("dm", "road", 0.03, 3000, ["narrate", "remember"]),
    wake("dm", "road", 0.02, 2000, ["narrate"]),
    wake("dm", "scene_open", 0.02, 2000, ["narrate"]),
  ];
  const run = {
    run_id: "card-test",
    build: { table_commit: "abcdef0123", dirty: false },
    ended: "the human quit",
    settings: { dm: { value: "model" }, "dm-model": { value: "the-dm-model" }, "dm-effort": { value: "medium" }, lang: { value: "ru" } },
    bench: { card: "toll", pack: "scenarios/x", route: ["a", "b"], lines_file: null, left_out: [], lines_before: 0 },
  } as unknown as RunRecord;

  const report = benchReport(run, log, transcript, usage).join("\n");
  assert.match(report, /^- DM: the-dm-model, effort medium; language ru$/m);
  assert.match(report, /^- Lines: typed by a person at the seat; 2 typed in this bench run$/m);
  assert.match(report, /^- The card: settled on `pay` \(Pay him\.\) \(majority\)$/m);
  assert.match(report, /^- Cost: 0\.53 USD for the bench run; before the first line \(scene_open, card \(timeout\)\): 0\.34 USD, 25\.0 s of DM wakes$/m);
  assert.doesNotMatch(report, /is not split|is not known/);
  const [, asked, leaned, ...more] = report.split(/^## /m);
  assert.deepEqual(more, [], "words after the card's decision are no line, and nothing was left out");
  // Line 1: answered. Its fact stands with it, though the transcript holds it after the second line.
  assert.match(asked!, /^Line 1: "What does he charge\?"$/m);
  assert.match(asked!, /^- The DM's call: an answer, no own move; the card waits$/m);
  assert.match(asked!, /^- The card was not decided on this line\n- remember:\n  - in its card_words wake:\n    > The toll is two silver a head\.\n- The DM's words to the table:\n  - card_words:\n    > Two silver a head, he says\.\n- Cost: 0\.05 USD, 4\.0 s of DM wakes \(card_words\)$/m);
  // Line 2: refused once, then an own move with no failure, which fell on the engine's roll; the person then took a number.
  // The fall's road wake and the settled card's are both the line's.
  assert.match(leaned!, /^Line 2: "I lean on him"$/m);
  assert.match(leaned!, /^- The DM's call: an own move, intimidation \(charisma\) DC 15; success brings `talk` \(Talk him down\.\), failure names no choice$/m);
  assert.match(leaned!, /^- Refused or failed:\n  - retry: dm: own_move refused: invalid_request \(bad_own_move\): the failure pay breaks no custom the words asked for\n  - retry: memory refused: it names a DC$/m);
  assert.match(leaned!, /^- Votes: torva own_move\n- The own move's roll: r6: bren rolls a Charisma \(Intimidation\) check: 1d20 \(4\) \+1 = 5 vs DC 15, failure\.\n- The own move brought: no choice: it fell, and the move is spent\n- The seat then chose without words: bren on the road card: Pay him\.\n- Votes after the fall: bren pay, torva pay\n- The card was decided: `pay` \(Pay him\.\) \(majority\)$/m);
  // What the fall and the choice did, and not the cut contract's pay after it.
  assert.match(leaned!, /^- Then the engine logged:\n  - The world remembers own_move_toll, by bren\.\n  - bren pays 2 silver pieces in toll\.\n  - The caravan loses 20 minutes\.\n- remember:\n  - in its road wake:\n    > He will not be leaned on\.\n  - in its road wake:\n    > The toll-man let them through\n    > and kept the coin\.$/m);
  assert.match(leaned!, /^- The DM's words to the table:\n  - card_words:\n    > He looks you up and down\.\n  - road:\n    > He does not budge\.\n  - road:\n    > The coin changes hands\.\n- Cost: 0\.09 USD, 10\.0 s of DM wakes \(card_words, road, road\)$/m);
  assert.doesNotMatch(report, /Another card|The road so far|r17|Not a line of the bench|in wages|Blades are paid|gate of b|insight/);

  // Wakes that do not match the lines or the facts: the cost is given whole, and the facts by their place in the transcript.
  const unsplit = benchReport(run, log, transcript, usage.filter((u) => u.api_equivalent_usd !== 0.04 || u.purpose !== "card_words")).join("\n");
  assert.match(unsplit, /^- Cost is not split by line: 1 card_words wakes for 2 lines$/m);
  assert.match(unsplit, /^- The wake of a kept fact is not known: 3 remember calls in usage\.jsonl for 4 in the transcript\. Facts are listed by their place in the transcript$/m);
  assert.doesNotMatch(unsplit, /s of DM wakes \(card_words|in its \w+ wake/);
  assert.match(unsplit.split(/^## /m)[2]!, /^- remember:\n  - by its place in the transcript:\n    > The toll is two silver a head\.\n  - by its place in the transcript:\n    > He will not be leaned on\.\n  - by its place in the transcript:\n    > The toll-man let them through\n/m);
  // A card that never came, and a run of another command.
  assert.match(benchReport({ ...run, bench: { ...run.bench!, card: "absent", left_out: ["As agreed last night"] } }, log, transcript, []).join("\n"), /^- The card: never came to the table\n- Cost: no model calls\n[^#]*## Left out, not typed\n\n- As agreed last night$/m);
  assert.deepEqual(benchReport({ ...run, bench: undefined }, log, transcript, usage), []);
});
