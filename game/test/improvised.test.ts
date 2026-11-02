// The DM's tools for improvised play (TASKS.md AGT-24, API-33, API-34): a creature comes only from
// the pack's `stat_blocks` list, with the entry's stat block, side and carries, never the DM's; a
// fight no encounter holds starts through the engine. Runs the real engine on m5_s3_yard, seeded.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StatBlockEntry } from "../src/pack/adventure.ts";
import { DmTools, type ScenePasses } from "../src/table/tools.ts";
import { testTable } from "./helpers.ts";

const wolf: StatBlockEntry = { id: "road_wolf", monster: "wolf", side: "hostile", name: "Grey wolf", carries: { coins: { sp: 2 } } };

function passes(statBlocks: StatBlockEntry[]): ScenePasses {
  return { insteadOf: () => undefined, passedOver: () => undefined, statBlocks };
}

test("a placed creature takes its stat block, side, name and carries from the pack's list", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table, passes([wolf]));
    assert.equal((await dm.loadScene("m5_s3_yard")).ok, true);
    const placed = await dm.placeCreature("road_wolf", "grey_1", { near: "bren" });
    assert.equal(placed.ok, true, placed.text);
    const sent = t.requests().find((r) => r.cmd === "place_creature")!;
    assert.equal(sent.viewer, "dm");
    assert.equal(sent.monster, "wolf");
    assert.equal(sent.side, "hostile");
    assert.equal(sent.name, "Grey wolf");
    assert.deepEqual(sent.carries, { coins: { sp: 2 } });
    const state = await t.table.engine.request("dm", { cmd: "get_state" });
    const creature = state.result?.cmd === "get_state" && state.result.state.view === "dm"
      ? state.result.state.creatures.find((c) => c.handle === "grey_1")
      : undefined;
    assert.equal(creature?.name, "Grey wolf");
  } finally {
    t.close();
  }
});

test("an entry the list doesn't have, or no list at all, never reaches the engine", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const listed = new DmTools(t.table, passes([wolf]));
    assert.equal((await listed.loadScene("m5_s3_yard")).ok, true);
    const unknown = await listed.placeCreature("dragon", "dragon_1", { near: "bren" });
    assert.equal(unknown.ok, false);
    assert.match(unknown.text, /road_wolf/);
    const none = new DmTools(t.table);
    assert.match((await none.placeCreature("road_wolf", "grey_1", { near: "bren" })).text, /^not now/);
    assert.match((await none.startFight(["bren", "goblin_2"])).text, /^not now/);
    assert.deepEqual(t.requests().filter((r) => r.cmd === "place_creature" || r.cmd === "start_fight"), []);
  } finally {
    t.close();
  }
});

test("start_fight puts the table in a fight the scene's encounters don't hold", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table, passes([wolf]));
    assert.equal((await dm.loadScene("m5_s3_yard")).ok, true);
    assert.equal((await dm.placeCreature("road_wolf", "grey_1", { near: "bren" })).ok, true);
    const fight = await dm.startFight(["bren", "grey_1"]);
    assert.equal(fight.ok, true, fight.text);
    assert.equal(t.table.inCombat, true);
  } finally {
    t.close();
  }
});
