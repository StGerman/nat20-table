// The loop plays the living world (M9, AGT-80 step 2): it starts the campaign, the human moves the
// caravan on and makes camp from the numbered options, a road card asks the human first and then
// the AI players (AGT-87), the DM tells the card and the night, the party is
// saved after the night, and the night past the day limit ends the run.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { cardChoices, roadChoices } from "../src/table/choices.ts";
import { TableLoop } from "../src/table/loop.ts";
import { DmTools } from "../src/table/tools.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat } from "../src/table/scripted.ts";
import type { HumanPrompt, PlayerIntent } from "../src/table/types.ts";
import { DM_ROAD_PROMPT } from "../src/agents/dm.ts";
import { readCampaign } from "../src/pack/campaign.ts";
import { wordRows } from "../src/play/verdict.ts";
import { formatDmState } from "../src/view.ts";
import { TEST_PACK, testTable } from "./helpers.ts";

/** A human who lists the options, then moves the caravan on once, then makes camp. */
function traveller(): (prompt: HumanPrompt, seat: ScriptedSeat) => PlayerIntent {
  let listed = false;
  let moved = false;
  return (prompt, seat) => {
    if (prompt.kind !== "explore") return ScriptedSeat.pass(prompt, seat);
    if (!listed) {
      listed = true;
      return { kind: "command", name: "options" };
    }
    listed = false;
    const want = moved ? "Make camp for the night" : "Move on with the caravan";
    const choice = seat.choices.find((c) => c.label === want);
    if (!choice) return { kind: "text", text: "I wait." };
    if (want.startsWith("Move")) moved = true;
    return { kind: "option", number: choice.number };
  };
}

test("the loop starts the campaign, asks a road card of the human first and then the AI players, tells the night, saves, and stops at the day limit", async () => {
  const seat = new ScriptedSeat("bren", [], traveller());
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
  try {
    const dm = new ScriptedDm({});
    const maren = new ScriptedPlayer("maren");
    let nights = 0;
    const loop = new TableLoop({
      table: t.table,
      dm,
      players: [maren],
      maxSteps: 200,
      campaign: { party: ["bren", "maren"], dayLimit: 1, onNight: async () => void (nights += 1) },
    });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the day limit: day 1 is over", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    assert.equal(nights, 1, "the party is saved after the night");
    const sent = t.requests().map((r) => [r.cmd, r.viewer]);
    assert.deepEqual(sent.find(([c]) => c === "start_campaign"), ["start_campaign", "dm"]);
    assert.ok(sent.some(([c, v]) => c === "travel" && v === "bren"), "the human moved the caravan on");
    assert.ok(sent.some(([c, v]) => c === "rest_night" && v === "bren"), "the human made camp");
    // A card was drawn on the road: the human gave a word before maren was woken for it (AGT-87).
    const cards = t.requests().filter((r) => r.cmd === "choose_card").map((r) => r.viewer);
    // Seed 1 draws a card on the first leg.
    assert.deepEqual(cards, ["bren", "maren"], "the human speaks first, so their word can sway the AI player");
    assert.ok(maren.briefings.some((b) => b.wake === "card" && /^Choices: /m.test(b.briefing) && /^Said so far: bren /m.test(b.briefing)), "the AI player hears the human's word");
    assert.ok(dm.briefings.some((b) => b.wake === "road" && b.briefing.includes("A road card was settled")));
    const word = seat.shown.find((e) => e.kind === "options" && e.title === "Your word");
    assert.ok(word?.kind === "options" && word.preset === 1, "Enter goes with the others");
    assert.ok(dm.briefings.some((b) => b.wake === "road" && b.briefing.includes("The night passed")));
    // The human never reads the card's id or zone, nor the merchant's purse.
    const shown = JSON.stringify(seat.shown);
    assert.doesNotMatch(shown, /purse_cp|"zone"/);
  } finally {
    t.close();
  }
});

test("a road card's choices for the human: Enter takes what most of the others said", () => {
  const card = { choices: [{ id: "clear", text: "Clear the road" }, { id: "around", text: "Go around" }], said: [{ actor: "maren", choice: "around" }] };
  const { choices, preset } = cardChoices(card);
  assert.deepEqual(choices.map((c) => c.label), ["Clear the road", "Go around (the others' choice)"]);
  assert.equal(preset, 2);
  assert.equal(cardChoices({ ...card, said: [] }).preset, 1, "nobody spoke: the first choice");
});

test("the road's lines join the human's options only when the human may drive and no card waits", () => {
  const world = {
    drives: true,
    at: { kind: "at", place: "inn" },
    places: [{ id: "inn", name: "The Inn", kind: "inn", market: false, inn_cp: 5 }],
    roads: [],
    unexplored: [],
    caravan: { owner: "npc:odda_vell", wagons: [] },
    card: null,
  } as never;
  assert.deepEqual(roadChoices(world, 3).map((c) => [c.number, c.label]), [
    [3, "Move on with the caravan"],
    [4, "Make camp for the night"],
    [5, "Take rooms at the inn for the night"],
  ]);
  assert.deepEqual(roadChoices({ ...(world as object), drives: false } as never, 1), []);
  assert.deepEqual(roadChoices({ ...(world as object), card: { text: "x" } } as never, 1), []);
  // A Hired Blade may walk ahead as the scout (AGT-90): one line for the road, gone once they do;
  // a merchant or a run with no escort has none.
  const escort = { destination: "mill", blades: [{ handle: "bren", served: 0, paid_cp: 0 }], done: false };
  const blade = { ...(world as object), escort } as never;
  assert.deepEqual(roadChoices(blade, 1, "bren").at(-1), { number: 4, label: "Walk ahead as the scout", act: { kind: "scout" }, about: { id: "scout" } });
  assert.equal(roadChoices({ ...(blade as object), scout: "torva" } as never, 1, "bren").at(-1)?.label, "Walk ahead as the scout", "another Blade's turn ahead can be taken");
  assert.ok(!roadChoices({ ...(blade as object), scout: "bren" } as never, 1, "bren").some((c) => c.act?.kind === "scout"));
  assert.ok(!roadChoices(blade, 1, "odda").some((c) => c.act?.kind === "scout"), "not a Blade");
  assert.ok(!roadChoices(world, 1, "bren").some((c) => c.act?.kind === "scout"), "no escort");
});

test("a human who owns the caravan picks a road out of the place, each line carrying where it goes", () => {
  const world = {
    drives: true,
    at: { kind: "at", place: "inn" },
    places: [
      { id: "inn", name: "The Inn", kind: "inn", market: false },
      { id: "mill", name: "The Mill", kind: "ruin", market: false },
    ],
    roads: [{ id: "inn_mill", from: "mill", to: "inn", miles: 6 }],
    unexplored: [{ id: "inn_hills", from: "inn", miles: 9 }],
    caravan: { owner: "bren", wagons: [] },
    card: null,
  } as never;
  const choices = roadChoices(world, 1);
  assert.deepEqual(choices.map((c) => c.label), ["Take the road to The Mill (6 miles)", "Take an unexplored road (9 miles)", "Make camp for the night"]);
  assert.deepEqual(choices.slice(0, 2).map((c) => c.act), [{ kind: "travel", pace: "normal", to: "inn_mill" }, { kind: "travel", pace: "normal", to: "inn_hills" }]);
  // On the road, the owner goes on along it: no road to pick.
  const onRoad = roadChoices({ ...(world as object), at: { kind: "on_road", road: "inn_mill", came_from: "inn", miles_left: 2 } } as never, 1);
  assert.deepEqual(onRoad.map((c) => c.act), [{ kind: "travel", pace: "normal" }, { kind: "rest_night", where: "camp" }]);
});

test("the road's lines follow the engine's miles left today: none once the day is spent, and a fast line when only a fast pace gets there today", () => {
  // Stas's run, 2026-11-05: at Wendford with 16 normal miles left and 20 to Saltmouth, only the
  // normal pace was offered, and twice "Move on" was picked on a spent day and refused in English.
  const world = {
    drives: true,
    at: { kind: "at", place: "wendford" },
    places: [
      { id: "wendford", name: "Wendford", kind: "village", market: true },
      { id: "wendmouth", name: "Saltmouth", kind: "town", market: true },
    ],
    roads: [{ id: "river_road", from: "wendford", to: "wendmouth", miles: 20, max_pace: "fast" }],
    unexplored: [],
    caravan: { owner: "npc:odda_vell", wagons: [] },
    card: null,
    today: { fast: 20, normal: 16, slow: 12 },
    trip: { complete: true, legs: [{ road: "river_road", to: "wendmouth", pace: "normal", miles: 20, minutes: 400, nights: 1 }] },
  };
  const labels = (w: object) => roadChoices(w as never, 1).map((c) => c.label);
  assert.deepEqual(labels(world), ["Move on with the caravan", "Push on at a fast pace to reach Saltmouth today", "Make camp for the night"]);
  assert.deepEqual(roadChoices(world as never, 1)[1]?.act, { kind: "travel", pace: "fast" });
  assert.deepEqual(labels({ ...world, today: { fast: 30, normal: 24, slow: 18 } }), ["Move on with the caravan", "Make camp for the night"], "normal gets there today");
  assert.deepEqual(labels({ ...world, roads: [{ ...world.roads[0], max_pace: "normal" }] }), ["Move on with the caravan", "Make camp for the night"], "the road allows no fast pace");
  const spent = { fast: 0, normal: 0, slow: 0 };
  assert.deepEqual(labels({ ...world, today: spent }), ["Make camp for the night"]);
  // On the road the stretch is what is left of it, toward the road's other end.
  const onRoad = { ...world, at: { kind: "on_road", road: "river_road", came_from: "wendford", miles_left: 4 }, trip: null };
  assert.deepEqual(labels({ ...onRoad, today: { fast: 4, normal: 3, slow: 2 } }), ["Move on with the caravan", "Push on at a fast pace to reach Saltmouth today", "Make camp for the night"]);
  assert.deepEqual(labels({ ...onRoad, today: spent }), ["Make camp for the night"]);
  // A human who owns the caravan gets the fast line under the road it belongs to.
  const owned = { ...world, caravan: { owner: "bren", wagons: [] }, trip: null };
  assert.deepEqual(labels(owned), ["Take the road to Saltmouth (20 miles)", "Take the road to Saltmouth at a fast pace, there today (20 miles)", "Make camp for the night"]);
  // With the normal miles spent but a few fast ones left, the day is still over: only the night.
  assert.deepEqual(labels({ ...onRoad, today: { fast: 4, normal: 0, slow: 0 } }), ["Make camp for the night"]);
  assert.deepEqual(labels({ ...owned, today: { fast: 20, normal: 0, slow: 0 } }), ["Make camp for the night"]);
  // An unexplored road gets the same fast line when only a fast pace reaches its end today.
  const unexplored = { ...owned, roads: [], unexplored: [{ id: "barrow_path", from: "wendford", miles: 20, max_pace: "fast" }] };
  assert.deepEqual(labels(unexplored), ["Take an unexplored road (20 miles)", "Take an unexplored road at a fast pace, to its end today (20 miles)", "Make camp for the night"]);
});

test("once the day's travel is spent the DM can't propose moving on, and the human's options offer only the night", async () => {
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    const ok = (r: { ok: boolean }) => assert.ok(r.ok, JSON.stringify(r));
    ok(await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" }));
    ok(await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] }));
    ok(await t.engine.request("bren", { cmd: "travel", actor: "bren", to: "crossing_inn", pace: "fast" }));
    for (const who of ["bren", "maren"]) ok(await t.engine.request(who, { cmd: "choose_card", actor: who, choice: "clear" }));
    // 12 of the hills' 20 miles is all the day has left: the caravan stops on the trail.
    ok(await t.engine.request("bren", { cmd: "travel", actor: "bren", to: "old_tower", pace: "normal" }));
    const state = await t.engine.request("bren", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state" && state.result.state.view === "player" && state.result.state.world);
    const world = state.result.state.world;
    assert.equal(world.at.kind, "on_road");
    assert.equal(world.today.normal, 0);
    assert.deepEqual(roadChoices(world, 1).map((c) => c.act?.kind), ["rest_night"]);
    const said = await new DmTools(t.table).proposeRoad("move_on");
    assert.ok(!said.ok && said.text.includes("spent"), said.text);
    assert.equal(t.table.road, undefined);
  } finally {
    t.close();
  }
});

/** The engine's test campaign with the caravan owned by `owner` and no escort or route: a player's own caravan. */
function ownedPack(owner: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "owned-"));
  cpSync(TEST_PACK, dir, { recursive: true });
  const file = path.join(dir, "campaign.json");
  const campaign = JSON.parse(readFileSync(file, "utf8")) as { world: Record<string, unknown> & { caravan: { owner: string } } };
  delete campaign.world.escort;
  delete campaign.world.route;
  campaign.world.caravan.owner = owner;
  writeFileSync(file, JSON.stringify(campaign));
  return dir;
}

test("a human who owns the caravan takes a road by name, and makes the caravan's call on a card after the Blades' advice", async () => {
  const pack = ownedPack("bren");
  let moved = false;
  let listed = false;
  const seat = new ScriptedSeat("bren", [], (prompt, s) => {
    if (prompt.kind !== "explore") return ScriptedSeat.pass(prompt, s);
    if (!listed) {
      listed = true;
      return { kind: "command", name: "options" };
    }
    listed = false;
    const choice = moved ? s.choices.find((c) => c.label === "Make camp for the night") : s.choices.find((c) => c.label.startsWith("Take the road to"));
    if (!choice) return { kind: "text", text: "I wait." };
    moved = true;
    return { kind: "option", number: choice.number };
  });
  const t = await testTable({ seed: 1, pack, human: "bren", players: ["maren"], seat });
  try {
    const loop = new TableLoop({ table: t.table, dm: new ScriptedDm({}), players: [new ScriptedPlayer("maren")], maxSteps: 200, campaign: { party: ["bren", "maren"], dayLimit: 1 } });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the day limit: day 1 is over", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    const sent = t.requests();
    const travel = sent.find((r) => r.cmd === "travel");
    assert.ok(travel && typeof travel.to === "string", `the owner named the road: ${JSON.stringify(travel)}`);
    const words = sent.filter((r) => r.cmd === "choose_card").map((r) => r.actor);
    assert.ok(words.length > 0, "a card was drawn on the road");
    // A caravan card waits for its owner after the Blade: bren speaks last and settles it.
    assert.equal(words.at(-1), "bren", words.join(", "));
    assert.ok(seat.shown.some((e) => e.kind === "info" && e.text.includes("The caravan is yours: you make the call")), "the human was asked as the owner");
  } finally {
    t.close();
    rmSync(pack, { recursive: true, force: true });
  }
});

test("a campaign pack names its start scene and day limit; the DM reads the world and the road's rules", async () => {
  assert.deepEqual(readCampaign(TEST_PACK), { startScene: "vale_town", startDay: 1 });
  // The day limit is the pack's last day on its own clock, so it never comes before its start day.
  const early = mkdtempSync(path.join(tmpdir(), "early-limit-"));
  try {
    cpSync(TEST_PACK, early, { recursive: true });
    const file = path.join(early, "campaign.json");
    const json = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...json, day_limit: 3, world: { ...json.world, day: 5 } }));
    assert.throws(() => readCampaign(early), /day_limit 3 is before the start day 5; it is the last day the run plays/);
  } finally {
    rmSync(early, { recursive: true, force: true });
  }
  assert.match(DM_ROAD_PROMPT, /never name a price, a wage or a sum of coin/);
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" });
    await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] });
    const state = await t.engine.request("dm", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state");
    const text = formatDmState(state.result.state);
    assert.match(text, /World: day 1, /);
    assert.match(text, /The merchant's route: /);
    assert.match(text, /the merchant's purse holds /);
  } finally {
    t.close();
  }
});

test("the DM lets time pass in a place: the watch moves on, and a span past midnight is refused (API-50)", async () => {
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    const dm = new DmTools(t.table);
    await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" });
    await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] });
    // The test world starts at 8:00: half an hour, then to noon, the evening and the night.
    const short = await dm.passTime("short_while");
    assert.deepEqual([short.ok, short.text], [true, "time passed; it is now day 1, morning"]);
    assert.equal((await dm.passTime("watch")).text, "time passed; it is now day 1, afternoon");
    assert.equal((await dm.passTime("watch")).text, "time passed; it is now day 1, evening");
    assert.equal((await dm.passTime("watch")).text, "time passed; it is now day 1, night");
    const late = await dm.passTime("watch");
    assert.equal(late.ok, false);
    assert.match(late.text, /runs past midnight/);
  } finally {
    t.close();
  }
});

/** A Hired Blade who moves the caravan on whenever it may, and makes camp when the day's travel is spent. */
function blade(): (prompt: HumanPrompt, seat: ScriptedSeat) => PlayerIntent {
  let listed = false;
  let seen = 0;
  return (prompt, seat) => {
    if (prompt.kind !== "explore") return prompt.kind === "combat_turn" || prompt.kind === "pick" ? ScriptedSeat.fight(prompt, seat) : ScriptedSeat.pass(prompt, seat);
    if (!listed) {
      listed = true;
      return { kind: "command", name: "options" };
    }
    listed = false;
    // A refused move since the last pick: the day's travel is spent, so the night comes.
    const refused = seat.shown.slice(seen).some((e) => e.kind === "info" && e.title === "Not accepted");
    seen = seat.shown.length;
    const want = refused ? "Make camp for the night" : "Move on with the caravan";
    const choice = seat.choices.find((c) => c.label === want) ?? seat.choices.find((c) => c.label === "Make camp for the night");
    return choice ? { kind: "option", number: choice.number } : { kind: "text", text: "I keep watch." };
  };
}

test("Fair in Wend plays from the Highsteads to the fair: every Blade is paid and the run ends with the contract done", async () => {
  const pack = path.join(REPO, "scenarios/fair_in_wend");
  const seat = new ScriptedSeat("bren", [], blade());
  const t = await testTable({ seed: 3, pack, human: "bren", players: ["torva", "maren", "ilsa"], seat });
  try {
    const party = ["bren", "torva", "maren", "ilsa"];
    // The DM picks the last card offered at the first draw that offers some, and picks nothing
    // after, so the run shows both the DM's pick and the table's (AGT-88).
    let picked = 0;
    const dm = new ScriptedDm({
      pick: async (tools, briefing) => {
        if (picked++ > 0) return;
        const ids = [...briefing.matchAll(/^Offered card \d+: ([a-z0-9_]+) /gm)].map((m) => m[1]!);
        await tools.pickCard(ids.at(-1)!, "It follows from what the party did.");
      },
      suggest: async () => '{"cards": [{"id": "fair_debt", "text": "A stall-keeper remembers the party."}], "why": ["it carries on the fair"]}',
    });
    const loop = new TableLoop({ table: t.table, dm, players: party.slice(1).map((h) => new ScriptedPlayer(h)), maxSteps: 400, campaign: { party, dayLimit: 3, keepsParty: true } });
    const report = await loop.run("fw_highsteads");
    assert.equal(report.ended, "the escort contract is done", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    // The journey's end (B7): one last turn in Saltmouth, the DM's closing, then the end card.
    const ends = seat.shown.flatMap((e, i) => (e.kind === "info" && e.title === "Journey's end" ? [{ i, text: e.text }] : []));
    assert.equal(ends.length, 2, JSON.stringify(ends));
    assert.match(ends[0]!.text, /^The contract is done\. You have one last turn in Saltmouth before the story rests\.$/);
    assert.ok(seat.shown.slice(ends[0]!.i, ends[1]!.i).some((e) => e.kind === "options"), "the human was asked once more in between");
    assert.match(ends[1]!.text, /^The escort contract to Saltmouth is done\.\nOn this journey you earned \d+ gold pieces in wages( and \d+ experience)?\.\n/);
    assert.match(ends[1]!.text, /more experience brings your next level\.|enough experience for your next level/);
    assert.match(ends[1]!.text, /Your party is kept for the next journey\.$/);
    assert.ok(dm.briefings.some((b) => b.briefing.includes("The journey is over")), "the DM wrote the closing");
    // The pay is told once (AGT-86, decision 0060 F5): Saltmouth's opening leaves it to the pay's own wake.
    const opening = dm.briefings.filter((b) => b.wake === "scene_open" && b.briefing.includes("fw_wendmouth is loaded")).at(-1);
    assert.ok(opening?.briefing.includes("open the arrival here without the pay"), opening?.briefing);
    const pay = dm.briefings.find((b) => b.briefing.includes("the merchant paid the Blades what they are owed"));
    assert.ok(pay?.briefing.includes("Your last narration opened the arrival: don't tell it again."), pay?.briefing);
    assert.equal(dm.briefings.filter((b) => b.briefing.includes("without the pay")).length, 1, "only the destination's opening leaves the pay out");
    assert.ok(!seat.shown.some((e) => e.kind === "options" && e.lines.some((l) => /Move on|Make camp/.test(l)) && seat.shown.indexOf(e) > ends[0]!.i), "no road lines after the contract");
    assert.ok(report.scenes.includes("fw_wendford") && report.scenes.at(-1) === "fw_wendmouth", report.scenes.join(", "));
    const state = await t.engine.request("dm", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state" && state.result.state.view === "dm");
    const escort = state.result.state.world?.escort;
    assert.ok(escort?.contract.done);
    // Every Blade is paid at least the advance and the day of arrival, from Odda's purse.
    for (const blade of escort.contract.blades) assert.ok(blade.paid_cp >= 400, `${blade.handle} paid ${blade.paid_cp}`);
    assert.ok(state.result.state.world!.clock.day <= 3, "within the day limit");
    // Wend's road piles hold more than one card, so draws offer cards (API-53). The DM is woken
    // to pick with the offered cards and the deeds (AGT-88); a wake that picks nothing leaves the
    // first card rolled to the table, counted as a fallback.
    const wakes = dm.briefings.filter((b) => b.wake === "pick");
    assert.ok(wakes.length >= 2, `${wakes.length} pick wakes`);
    assert.ok(wakes.every((b) => /^Offered card 1: /m.test(b.briefing) && /^Offered card 2: /m.test(b.briefing) && /deeds/i.test(b.briefing)), wakes[0]?.briefing);
    const picks = t.requests().filter((r) => r.cmd === "pick_card");
    assert.equal(picks.length, wakes.length, "one pick a draw");
    assert.ok(picks.every((r) => r.viewer === "dm"));
    assert.equal(picks.filter((r) => (r as { fallback?: boolean }).fallback === true).length, wakes.length - 1, "every pick after the first is the table's");
    const log = await t.engine.request("dm", { cmd: "events", since: 0 });
    assert.ok(log.result?.cmd === "events");
    const came = log.result.events.flatMap((e) => (e.kind === "card_picked" && e.came !== "soon" ? [e.came] : []));
    assert.deepEqual(came, ["dm_pick", ...Array(wakes.length - 1).fill("engine_pick")]);
    assert.ok(log.result.events.some((e) => e.kind === "card_picked" && e.came === "dm_pick" && e.reason === "It follows from what the party did."));
    assert.equal(t.table.transcript.records.filter((r) => r.kind === "fallback" && r.text.startsWith("the DM picked no road card")).length, wakes.length - 1);
    // Every card on the table has its DM-only record (AGT-91), and the DM suggests cards once the journey is over.
    const shown = log.result.events.filter((e) => e.kind === "card_shown");
    assert.equal(shown.length, log.result.events.filter((e) => e.kind === "card_drawn").length);
    assert.deepEqual(report.suggestedCards, { cards: [{ id: "fair_debt", text: "A stall-keeper remembers the party." }], why: ["it carries on the fair"] });
    const ask = dm.briefings.find((b) => b.wake === "suggest");
    assert.match(ask?.briefing ?? "", /Suggest up to two new road cards/);
    assert.equal(dm.briefings.at(-1)?.wake, "suggest", "asked last, once the journey is over");
  } finally {
    t.close();
  }
});

test("the exit pair, scripted (MAP-12): Fair in Wend, then The Way Back on the saved party, where the road reads what run 1 did", async () => {
  const party = ["bren", "torva", "maren", "ilsa"];
  const play = async (pack: string, roster?: Parameters<typeof testTable>[0]["roster"]) => {
    const seat = new ScriptedSeat("bren", [], blade());
    const t = await testTable({ seed: 3, pack: path.join(REPO, pack), human: "bren", players: party.slice(1), seat, ...(roster ? { roster } : {}) });
    const campaign = readCampaign(path.join(REPO, pack))!;
    const loop = new TableLoop({
      table: t.table,
      dm: new ScriptedDm({}),
      players: party.slice(1).map((h) => new ScriptedPlayer(h)),
      maxSteps: 400,
      campaign: { party, keepsParty: true, startDay: campaign.startDay, ...(campaign.dayLimit !== undefined ? { dayLimit: campaign.dayLimit } : {}) },
    });
    const report = await loop.run(campaign.startScene);
    return { t, report };
  };
  const run1 = await play("scenarios/fair_in_wend");
  let roster;
  let rows1: ReturnType<typeof wordRows> = [];
  try {
    assert.equal(run1.report.ended, "the escort contract is done");
    const log1 = await run1.t.engine.request("dm", { cmd: "events", since: 0 });
    assert.ok(log1.result?.cmd === "events");
    rows1 = wordRows({ roster: { party: "new" } } as never, log1.result.events as never, [], false);
    const saved = await run1.t.engine.request("dm", { cmd: "save_roster" });
    assert.ok(saved.result?.cmd === "save_roster");
    roster = saved.result.roster;
  } finally {
    run1.t.close();
  }
  const run2 = await play("scenarios/the_way_back", roster);
  try {
    // The clock carries on from run 1, and the day limit counts from the contract's first day.
    assert.equal(run2.report.ended, "the escort contract is done", JSON.stringify(run2.t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    // Its days, as run.json records them: from the carried day, three of them (Copilot on table #321).
    const days = run2.report.campaignDays!;
    assert.ok(days.start > 1, JSON.stringify(days));
    assert.equal(days.last, days.start + 2);
    assert.deepEqual(run1.report.campaignDays, { start: 1, last: 3 });
    const log = await run2.t.engine.request("dm", { cmd: "events", since: 0 });
    assert.ok(log.result?.cmd === "events");
    // The bridge is gone for the world, so its stop meets The bridge again, which reads a run 1 deed (exit row 5).
    const drawn = log.result.events.flatMap((e) => (e.kind === "card_shown" ? [e.card] : []));
    assert.ok(drawn.includes("bridge_again") && !drawn.includes("millbeck_bridge"), drawn.join(", "));
    const shown = log.result.events.find((e) => e.kind === "card_shown" && e.card === "bridge_again");
    const rows2 = wordRows({ roster: { party: "continue" } } as never, log.result.events as never, [], false);
    // The M11 verdict rows the exit pair is judged on hold by construction (F6).
    const status = (rows: typeof rows1, row: string) => rows.find((r) => r.row === row)?.status;
    assert.equal(status(rows1, "m11-deck"), "pass", "first run: m11-deck");
    assert.equal(status(rows1, "m11-thread"), "pass", "first run: m11-thread");
    assert.equal(status(rows2, "m11-deck"), "pass", "second run: m11-deck");
    assert.equal(status(rows2, "m11-thread"), "pass", "second run: m11-thread");
    assert.equal(status(rows2, "m11-memory"), "pass", "second run: m11-memory");
    assert.ok(shown?.kind === "card_shown" && (shown.reads ?? []).some((d) => d.deed === "crossed_millbeck"), JSON.stringify(shown));
  } finally {
    run2.t.close();
  }
});

test("a saved party takes up the world where it left it: the loop follows the caravan to its scene, and no second advance is paid", async () => {
  const first = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  let roster;
  try {
    await first.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" });
    await first.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] });
    await first.engine.request("bren", { cmd: "travel", actor: "bren", to: "crossing_inn", pace: "normal" });
    const saved = await first.engine.request("dm", { cmd: "save_roster" });
    assert.ok(saved.result?.cmd === "save_roster");
    roster = saved.result.roster;
  } finally {
    first.close();
  }
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], roster });
  try {
    const dm = new ScriptedDm({});
    const loop = new TableLoop({ table: t.table, dm, players: [new ScriptedPlayer("maren")], maxSteps: 6, campaign: { party: ["bren", "maren"] } });
    const report = await loop.run("vale_town");
    // The DM opens only the scene the caravan stands in, never the first scene it left at once.
    assert.equal(report.scenes[0], "vale_road", report.scenes.join(", "));
    assert.ok(dm.briefings.some((b) => b.wake === "scene_open" && b.briefing.includes("Scene vale_road is loaded")));
    assert.ok(!dm.briefings.some((b) => b.wake === "scene_open" && b.briefing.includes("Scene vale_town is loaded")));
    // The DM's tools play the same scene: a Short Rest and its reminder count in vale_road.
    const dmTools = (loop as unknown as { dmTools: { current(): string | undefined } }).dmTools;
    assert.equal(dmTools.current(), "vale_road");
    const state = await t.engine.request("dm", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state" && state.result.state.view === "dm");
    assert.deepEqual(state.result.state.world?.at, { kind: "at", place: "crossing_inn" });
    for (const blade of state.result.state.world!.escort!.contract.blades) assert.equal(blade.paid_cp, 200, `${blade.handle}: one advance`);
  } finally {
    t.close();
  }
});

test("the party goes to sleep in words: the DM proposes the night, and the human who drives ends the day with Enter", async () => {
  // The human never opens the options: they only say what Bren does (Stas's run, 2026-11-04).
  const seat = new ScriptedSeat("bren", [], (prompt, s) => (prompt.kind === "explore" ? { kind: "text", text: "I crawl under the wagon and sleep." } : ScriptedSeat.pass(prompt, s)));
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
  try {
    let proposed = 0;
    const dm = new ScriptedDm({
      table_turn: async (tools) => {
        proposed += 1;
        const said = await tools.proposeRoad("camp");
        assert.ok(said.ok, said.text);
      },
    });
    const loop = new TableLoop({ table: t.table, dm, players: [new ScriptedPlayer("maren")], maxSteps: 200, campaign: { party: ["bren", "maren"], dayLimit: 1 } });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the day limit: day 1 is over", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    assert.equal(proposed, 1, "one proposal, one night");
    const rest = t.requests().filter((r) => r.cmd === "rest_night");
    assert.deepEqual(rest.map((r) => [r.actor, r.where]), [["bren", "camp"]], "the human ended the day, never the DM");
    const asked = seat.shown.find((e) => e.kind === "options" && e.title === "The night");
    assert.ok(asked?.kind === "options" && asked.preset === 1 && asked.lines.at(-1)?.endsWith("Not yet"), JSON.stringify(asked));
    assert.ok(dm.briefings.some((b) => b.wake === "road" && b.briefing.includes("The night passed")));
  } finally {
    t.close();
  }
});

test("with no human, the DM's proposed night wakes an AI player who drives, and it ends the day", async () => {
  const t = await testTable({ seed: 1, noHuman: true, players: ["maren"] });
  try {
    const dm = new ScriptedDm({ table_turn: async (tools) => void (await tools.proposeRoad("camp")) });
    const maren = new ScriptedPlayer("maren");
    const loop = new TableLoop({ table: t.table, dm, players: [maren], maxSteps: 200, campaign: { party: ["maren"], dayLimit: 1 } });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the day limit: day 1 is over", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    assert.ok(maren.briefings.some((b) => b.wake === "road" && b.briefing.includes("rest_night with where camp")));
    assert.deepEqual(t.requests().filter((r) => r.cmd === "rest_night").map((r) => r.actor), ["maren"]);
  } finally {
    t.close();
  }
});

test("the DM can't propose a night in a fight, twice, or in an adventure without a road", async () => {
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    const tools = new DmTools(t.table);
    const off = await tools.proposeRoad("camp");
    assert.ok(!off.ok && off.text.includes("no road"), off.text);
    t.table.road = { step: "camp" };
    const twice = await tools.proposeRoad("inn");
    assert.ok(!twice.ok && twice.text.includes("already"), twice.text);
  } finally {
    t.close();
  }
});

test("the party says it moves on: the DM proposes it, and the human who drives takes the road with Enter", async () => {
  const seat = new ScriptedSeat("bren", [], (prompt, s) => (prompt.kind === "explore" ? { kind: "text", text: "Right then, let's go." } : ScriptedSeat.pass(prompt, s)));
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
  try {
    let moved = false;
    const dm = new ScriptedDm({
      table_turn: async (tools) => {
        const said = await tools.proposeRoad(moved ? "camp" : "move_on");
        assert.ok(said.ok, said.text);
        moved = true;
      },
    });
    const loop = new TableLoop({ table: t.table, dm, players: [new ScriptedPlayer("maren")], maxSteps: 200, campaign: { party: ["bren", "maren"], dayLimit: 1 } });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the day limit: day 1 is over", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    assert.equal(t.requests().filter((r) => r.cmd === "travel")[0]?.actor, "bren", "the human moved the caravan on");
    const asked = seat.shown.find((e) => e.kind === "options" && e.title === "The road");
    assert.ok(asked?.kind === "options" && asked.lines[0]?.includes("Move on with the caravan"), JSON.stringify(asked));
  } finally {
    t.close();
  }
});

test("the road the DM proposes offers a Blade the scout's walk first, then asks again without it (AGT-90)", async () => {
  // Copilot on table #314: the DM-driven road prompt never showed the scout line, so the AI Blades waited for good.
  const seat = new ScriptedSeat("bren", [], (prompt, s) => {
    if (prompt.kind === "explore") return { kind: "text", text: "Right then, let's go." };
    if (prompt.kind !== "road") return ScriptedSeat.pass(prompt, s);
    const scout = s.choices.find((c) => c.act?.kind === "scout");
    return scout ? { kind: "option", number: scout.number } : ScriptedSeat.pass(prompt, s);
  });
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
  try {
    let moved = false;
    const dm = new ScriptedDm({
      table_turn: async (tools) => {
        const said = await tools.proposeRoad(moved ? "camp" : "move_on");
        assert.ok(said.ok, said.text);
        moved = true;
      },
    });
    const loop = new TableLoop({ table: t.table, dm, players: [new ScriptedPlayer("maren")], maxSteps: 200, campaign: { party: ["bren", "maren"], dayLimit: 1 } });
    await loop.run("vale_town");
    const roads = seat.shown.filter((e) => e.kind === "options" && e.title === "The road");
    assert.ok(roads[0]?.kind === "options" && roads[0].lines.some((l) => l.includes("Walk ahead as the scout")), JSON.stringify(roads[0]));
    assert.ok(roads[1]?.kind === "options" && !roads[1].lines.some((l) => l.includes("Walk ahead as the scout")), JSON.stringify(roads[1]));
    const sent = t.requests().filter((r) => r.cmd === "scout" || r.cmd === "travel");
    assert.deepEqual(sent.slice(0, 2).map((r) => [r.cmd, r.actor]), [["scout", "bren"], ["travel", "bren"]], "the human walked ahead, then moved the caravan on");
    assert.ok(t.table.scoutOffered, "the AI Blades may scout once the human has seen the line");
  } finally {
    t.close();
  }
});

test("a line on screen is taken by its name typed out, and by its number while the DM's question is open", async () => {
  // Stas's run, 2026-11-04: the DM asked a question, /options listed the road, and "11" and
  // "Move on with the caravan" both reached the DM as words, so the caravan never left.
  // Each answer is asked for once: list the options, then name the road; once the DM asks, list them
  // again and answer with the camp line's number.
  let listed = false;
  let moved = false;
  const seat = new ScriptedSeat("bren", [], (prompt, s) => {
    if (prompt.kind !== "explore" && prompt.kind !== "answer") return ScriptedSeat.pass(prompt, s);
    if (moved && prompt.kind === "explore") return { kind: "text", text: "I wait." };
    if (!listed) {
      listed = true;
      return { kind: "command", name: "options" };
    }
    listed = false;
    if (!moved) {
      moved = true;
      return { kind: "text", text: "move on with the caravan." };
    }
    const camp = s.choices.find((c) => c.label === "Make camp for the night");
    return { kind: "text", text: camp ? String(camp.number) : "I wait." };
  });
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
  try {
    let asked = false;
    const dm = new ScriptedDm({
      table_turn: async (tools) => {
        if (asked || !t.requests().some((r) => r.cmd === "travel")) return;
        asked = true;
        await tools.askHuman("Ready to stop for the night?");
      },
    });
    const loop = new TableLoop({ table: t.table, dm, players: [new ScriptedPlayer("maren")], maxSteps: 200, campaign: { party: ["bren", "maren"], dayLimit: 1 } });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the day limit: day 1 is over", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    assert.equal(t.requests().filter((r) => r.cmd === "travel")[0]?.actor, "bren", "the typed name moved the caravan");
    assert.equal(t.requests().filter((r) => r.cmd === "rest_night")[0]?.actor, "bren", "the number answered the question as the line");
  } finally {
    t.close();
  }
});

test("the DM can't propose the inn where there is none, and the night's line is taken by its name typed out", async () => {
  // Copilot on table #265: an inn proposed in a place without one sent the driver a night the engine refuses.
  const seat = new ScriptedSeat("bren", [], (prompt, s) => {
    if (prompt.kind === "road") return { kind: "text", text: "make camp for the night." };
    return prompt.kind === "explore" ? { kind: "text", text: "We sleep here." } : ScriptedSeat.pass(prompt, s);
  });
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
  try {
    const said: string[] = [];
    const dm = new ScriptedDm({
      table_turn: async (tools) => {
        const inn = await tools.proposeRoad("inn");
        said.push(inn.text);
        if (!inn.ok) await tools.proposeRoad("camp");
      },
    });
    const loop = new TableLoop({ table: t.table, dm, players: [new ScriptedPlayer("maren")], maxSteps: 200, campaign: { party: ["bren", "maren"], dayLimit: 1 } });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the day limit: day 1 is over", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    assert.match(said[0] ?? "", /no inn here/);
    assert.deepEqual(t.requests().filter((r) => r.cmd === "rest_night").map((r) => [r.actor, r.where]), [["bren", "camp"]]);
  } finally {
    t.close();
  }
});

test("an arrival card at the destination is decided before the human's last turn and the closing (ENG-35)", async () => {
  // Fair in Wend with its world carried in the pack, and one arrival card at Saltmouth.
  const pack = mkdtempSync(path.join(tmpdir(), "arrival-"));
  cpSync(path.join(REPO, "scenarios/fair_in_wend"), pack, { recursive: true });
  cpSync(path.join(REPO, "worlds/wend"), path.join(pack, "worlds/wend"), { recursive: true });
  writeFileSync(
    path.join(pack, "worlds/wend/deck/arrival.json"),
    JSON.stringify({
      cards: [
        {
          id: "test_quay",
          zone: "wendmouth",
          when: "arrival",
          target: "blades",
          text: "A boy on the quay offers to carry the sacks.",
          choices: [
            { id: "let_him", text: "Let him carry them.", effects: [{ do: "delay", minutes: 10 }] },
            { id: "wave_off", text: "Wave him off.", effects: [{ do: "remember", deed: "waved_off_the_quay_boy" }] },
          ],
        },
      ],
    }),
  );
  const seat = new ScriptedSeat("bren", [], blade());
  const t = await testTable({ seed: 3, pack, human: "bren", players: ["torva", "maren", "ilsa"], seat });
  try {
    const party = ["bren", "torva", "maren", "ilsa"];
    const dm = new ScriptedDm({});
    const loop = new TableLoop({ table: t.table, dm, players: party.slice(1).map((h) => new ScriptedPlayer(h)), maxSteps: 400, campaign: { party, dayLimit: 3, keepsParty: true } });
    const report = await loop.run("fw_highsteads");
    assert.equal(report.ended, "the escort contract is done", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    const quay = seat.shown.findIndex((e) => e.kind === "options" && e.title === "Your word" && e.lines.some((l) => l.includes("Let him carry them")));
    const end = seat.shown.findIndex((e) => e.kind === "info" && e.title === "Journey's end");
    assert.ok(quay >= 0, "the human was asked about the arrival card");
    assert.ok(quay < end, "the arrival card comes before the journey's last turn");
    const settled = dm.briefings.findIndex((b) => b.wake === "road" && b.briefing.includes("A road card was settled"));
    const paid = dm.briefings.findIndex((b) => b.briefing.includes("the merchant paid the Blades what they are owed"));
    const closing = dm.briefings.findIndex((b) => b.briefing.includes("The journey is over"));
    assert.ok(settled >= 0 && settled < paid && paid < closing, "the DM told the card, then the pay, then the closing");
  } finally {
    t.close();
    rmSync(pack, { recursive: true, force: true });
  }
});
