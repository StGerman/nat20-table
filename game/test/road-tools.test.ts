// The road and level-up tools of an AI player (M9, AGT-80 step 1): the tools join the seat only in
// a living-world pack, `look` shows the world in words, and each tool sends its bound command.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import type { LevelUpChoice } from "@nat20-table/engine-client";
import { ModelPlayer, ROAD_PROMPT } from "../src/agents/player.ts";
import { REPO } from "../src/engine.ts";
import { castParty } from "../src/play/run.ts";
import { BarkTools, duration, formatLevelUpChoice, HandTools, PlayerTools, ReactionFloor } from "../src/table/tools.ts";
import { customsTag, formatState } from "../src/view.ts";
import { testTable } from "./helpers.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");
const CHOICE = { model: "claude-sonnet-5-5", effort: "low" } as const;
const SEAT = ["my_sheet", "look", "legal_actions", "submit_decision", "move", "end_turn", "react", "say"];
const ROAD = ["travel", "rest_night", "scout", "choose_card", "own_move", "level_up", "answer_level_up"];

test("the road and level-up tools join a player's seat only in a living-world pack, before note", () => {
  const party = castParty(MILL);
  const make = (livingWorld?: boolean) =>
    new ModelPlayer({ handle: "maren", card: party.cards.get("maren")!, characterClass: "cleric", choice: CHOICE, ...(livingWorld === undefined ? {} : { livingWorld }) });
  assert.deepEqual(make().seatTools.map((t) => t.name), [...SEAT, "note"]);
  assert.deepEqual(make(false).seatTools.map((t) => t.name), [...SEAT, "note"]);
  assert.deepEqual(make(true).seatTools.map((t) => t.name), [...SEAT, ...ROAD, "note"]);
  for (const tool of make(true).seatTools) {
    for (const field of ["viewer", "actor", "prompt_id"]) assert.ok(!(field in tool.inputSchema), `${tool.name} takes ${field}`);
  }
});

test("a leg's time reads in hours and minutes, never 0 hours", () => {
  assert.deepEqual([40, 60, 200, 0].map(duration), ["40 minutes", "1 hour", "3 hours 20 minutes", "0 minutes"]);
});

test("a level-up choice reads as plain lines with the recommended pick marked", () => {
  const choice = {
    prompt_id: "p1",
    level: 3,
    label: "Choose a subclass",
    picks: 1,
    options: [
      { id: "life_domain", name: "Life Domain", summary: "Healing grows stronger." },
      { id: "light_domain", name: "Light Domain" },
    ],
    recommended: ["life_domain"],
  } as unknown as LevelUpChoice;
  assert.equal(
    formatLevelUpChoice(choice),
    "Level 3: Choose a subclass (pick 1).\n- life_domain: Life Domain. Healing grows stronger. (recommended)\n- light_domain: Light Domain",
  );
});

test("on the road a player looks at the world in words, gives a word on the card, travels and rests; without an open level-up there is nothing to answer", async () => {
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    assert.ok((await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" })).ok);
    assert.ok((await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] })).ok);
    const bren = new PlayerTools("bren", t.table);
    const maren = new PlayerTools("maren", t.table);

    const state = await t.engine.request("maren", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state");
    const seen = formatState(state.result.state);
    assert.match(seen, /Day 1, .*The caravan is at /);
    assert.match(seen, /Known places: /);
    assert.match(seen, /Escort contract: to /);
    assert.doesNotMatch(seen, /purse_cp|\bAC\b|\bDC\b/, "no merchant's purse, no target numbers");

    const went = await bren.travel("fast", "crossing_inn");
    assert.ok(went.ok, went.text);
    assert.match(went.text, /miles in \d+ (hour|minute)/);
    // The road card the fixture meets on this leg: both Blades give their word.
    for (const [who, tools] of [["bren", bren], ["maren", maren]] as const) {
      const said = await tools.chooseCard("clear");
      assert.ok(said.ok, `${who}: ${said.text}`);
    }
    const night = await bren.restNight("camp");
    assert.ok(night.ok, night.text);
    assert.match(night.text, /^the night passes; rested: /);

    const none = await maren.answerLevelUp(["life_domain"]);
    assert.equal(none.ok, false);
    assert.match(none.text, /no level-up choice open; call level_up/);
    const sent = t.requests().map((r) => [r.cmd, r.viewer, r.actor]);
    for (const cmd of ["travel", "choose_card", "rest_night"]) assert.ok(sent.some(([c, v, a]) => c === cmd && v === a), `${cmd} is sent as the player, for the player`);
  } finally {
    t.close();
  }
});

test("a living-world player's prompt tells it about the road, and only then", () => {
  const party = castParty(MILL);
  const make = (livingWorld: boolean) => new ModelPlayer({ handle: "ilsa", card: party.cards.get("ilsa")!, characterClass: "wizard", choice: CHOICE, livingWorld });
  assert.ok(make(true).systemPrompt.endsWith(ROAD_PROMPT));
  assert.ok(!make(false).systemPrompt.includes("## On the road"));
  assert.doesNotMatch(ROAD_PROMPT, /Wend|Mill|crossing|vale/i, "no pack's places in the generic prompt");
});

test("the road waits for the floor and for an open level-up: a hand or bark wake can't move the caravan, end the day, give a card word or level up", async () => {
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    assert.ok((await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" })).ok);
    assert.ok((await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] })).ok);
    const before = t.requests().length;
    const wakes: PlayerTools[] = [new HandTools("maren", t.table), new BarkTools("maren", t.table, new ReactionFloor(() => undefined))];
    for (const tools of wakes) {
      const outcomes = [
        await tools.travel("normal"),
        await tools.restNight("camp"),
        await tools.chooseCard("clear"),
        await tools.levelUp(),
        await tools.answerLevelUp(["aid"]),
      ];
      for (const o of outcomes) {
        assert.equal(o.ok, false);
        assert.match(o.text, /^not now: /);
      }
    }
    assert.equal(t.requests().length, before, "nothing reached the engine");
    // Another character's level-up is open: the caravan and the night wait for it.
    t.table.awaiting = { kind: "level_up", actor: "maren", prompt_id: "l1" };
    const bren = new PlayerTools("bren", t.table);
    assert.match((await bren.travel("normal")).text, /once maren's level-up is done/);
    assert.match((await bren.restNight("camp")).text, /until maren's level-up is done/);
    assert.match((await new PlayerTools("maren", t.table).travel("normal")).text, /once your level-up is done/);
    assert.equal(t.requests().length, before, "still nothing reached the engine");
  } finally {
    t.close();
  }
});

test("the DM reads which customs a card choice keeps or breaks; a choice that touches none reads as before (API-55)", () => {
  assert.equal(customsTag({}), "");
  assert.equal(customsTag({ keeps: [], breaks: [] }), "");
  assert.equal(customsTag({ keeps: ["word_kept"] }), " (keeps word_kept)");
  assert.equal(customsTag({ keeps: ["bread_shared"], breaks: ["debt_paid", "word_kept"] }), " (keeps bread_shared; breaks debt_paid, word_kept)");
});

test("the scout's walk is a change: an open surrender holds it, and the engine never sees it (AGT-90)", async () => {
  // Copilot on table #314: `scout` was missing from the changes, so it skipped the surrender hold and the retry budget.
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" });
    await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"], human: "bren" });
    t.table.scoutOffered = true;
    t.table.surrender = { handles: ["goblin_1"], words: false };
    const before = t.requests().filter((r) => r.cmd === "scout").length;
    const held = await new PlayerTools("maren", t.table).scout();
    assert.ok(!held.ok && held.text.includes("surrender"), held.text);
    assert.equal(t.requests().filter((r) => r.cmd === "scout").length, before);
    t.table.surrender = undefined;
    const walked = await new PlayerTools("maren", t.table).scout();
    assert.ok(walked.ok, walked.text);
  } finally {
    t.close();
  }
});
