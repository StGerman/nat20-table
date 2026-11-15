// The card bench with no model (AGT-123, decision 0084, `docs/design/card-bench.md` §6): the
// temporary pack loads for every road and arrival card a campaign pack's route reaches, and that
// card is the first card on the table; a card that reads a deed comes on a roster a scripted
// contract saved; a line that becomes an own move settles the card and ends the bench run; and
// `play:card` runs end to end with a scripted DM.
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
import type { RunRecord } from "../src/play/record.ts";
import { writeRoster } from "../src/play/roster.ts";
import { castParty } from "../src/play/run.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat, benchSeat, caravanSeat, votesOwnMove, type BenchSeatLog } from "../src/table/scripted.ts";
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
    assert.deepEqual(left.sort(), ["millbeck_bridge", "peddlers_mark"]);
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
    assert.deepEqual(record.bench, { card: "bog_wifes_toll", pack: "scenarios/the_way_back", route: ["wendford", "highsteads"], lines_file: lines, left_out: ["As we agreed at the fair, let us pass."] });
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
