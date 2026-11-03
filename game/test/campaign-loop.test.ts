// The loop plays the living world (M9, AGT-80 step 2): it starts the campaign, the human moves the
// caravan on and makes camp from the numbered options, a road card asks the AI players first and
// the human last (Enter goes with the others), the DM tells the card and the night, the party is
// saved after the night, and the night past the day limit ends the run.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { cardChoices, roadChoices } from "../src/table/choices.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat } from "../src/table/scripted.ts";
import type { HumanPrompt, PlayerIntent } from "../src/table/types.ts";
import { DM_ROAD_PROMPT } from "../src/agents/dm.ts";
import { readCampaign } from "../src/pack/campaign.ts";
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

test("the loop starts the campaign, asks a road card of the AI players first and the human last, tells the night, saves, and stops at the day limit", async () => {
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
    // A card was drawn on the road: maren was woken for it before the human gave a word.
    const cards = t.requests().filter((r) => r.cmd === "choose_card").map((r) => r.viewer);
    // Seed 1 draws a card on the first leg.
    assert.deepEqual(cards, ["maren", "bren"], "the AI player speaks first, the human last");
    assert.ok(maren.briefings.some((b) => b.wake === "card" && /^Choices: /m.test(b.briefing)));
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
    card: null,
  } as never;
  assert.deepEqual(roadChoices(world, 3).map((c) => [c.number, c.label]), [
    [3, "Move on with the caravan"],
    [4, "Make camp for the night"],
    [5, "Take rooms at the inn for the night"],
  ]);
  assert.deepEqual(roadChoices({ ...(world as object), drives: false } as never, 1), []);
  assert.deepEqual(roadChoices({ ...(world as object), card: { text: "x" } } as never, 1), []);
});

test("a campaign pack names its start scene and day limit; the DM reads the world and the road's rules", async () => {
  assert.deepEqual(readCampaign(TEST_PACK), { startScene: "vale_town", startDay: 1 });
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
    const loop = new TableLoop({ table: t.table, dm: new ScriptedDm({}), players: party.slice(1).map((h) => new ScriptedPlayer(h)), maxSteps: 400, campaign: { party, dayLimit: 3 } });
    const report = await loop.run("fw_highsteads");
    assert.equal(report.ended, "the escort contract is done", JSON.stringify(t.table.transcript.records.filter((r) => r.channel === "run").slice(-5)));
    assert.ok(report.scenes.includes("fw_wendford") && report.scenes.at(-1) === "fw_wendmouth", report.scenes.join(", "));
    const state = await t.engine.request("dm", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state" && state.result.state.view === "dm");
    const escort = state.result.state.world?.escort;
    assert.ok(escort?.contract.done);
    // Every Blade is paid at least the advance and the day of arrival, from Odda's purse.
    for (const blade of escort.contract.blades) assert.ok(blade.paid_cp >= 400, `${blade.handle} paid ${blade.paid_cp}`);
    assert.ok(state.result.state.world!.clock.day <= 3, "within the day limit");
  } finally {
    t.close();
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
    const state = await t.engine.request("dm", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state" && state.result.state.view === "dm");
    assert.deepEqual(state.result.state.world?.at, { kind: "at", place: "crossing_inn" });
    for (const blade of state.result.state.world!.escort!.contract.blades) assert.equal(blade.paid_cp, 200, `${blade.handle}: one advance`);
  } finally {
    t.close();
  }
});
