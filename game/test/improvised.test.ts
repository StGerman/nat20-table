// The DM's tools for improvised play (TASKS.md AGT-24, API-33, API-34): a creature comes only from
// the pack's `stat_blocks` list, with the entry's stat block, side and carries, never the DM's; a
// fight no encounter holds starts through the engine. Runs the real engine on m5_s3_yard, seeded.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { packIds } from "../src/table/guards.ts";
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

test("the leak guard keeps the creature list's entry ids and creature_placed from the players", () => {
  const root = mkdtempSync(path.join(tmpdir(), "improvised-"));
  try {
    const pack = path.join(root, "pack");
    cpSync(path.join(REPO, "scenarios/the_silent_mill"), pack, { recursive: true });
    const file = path.join(pack, "adventure.json");
    const skeleton = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...skeleton, format_version: 2, stat_blocks: [{ ...wolf, monster: "nat20_demo::monster.dire_wolf" }] }));
    const { dmOnly } = packIds(pack);
    for (const id of ["road_wolf", "dire_wolf", "creature_placed"]) assert.ok(dmOnly.has(id), id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("give, steal and loot go to the engine as the DM's, out of combat, for any character (ITM-6)", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    assert.equal((await dm.loadScene("m5_s3_yard")).ok, true);
    assert.equal((await dm.move("bren", { kind: "creature", handle: "maren" })).ok, true);
    const gave = await dm.give("bren", "maren", { kind: "coins", coins: { gp: 1 } });
    assert.equal(gave.ok, true, gave.text);
    const stole = await dm.steal("bren", "maren", { kind: "coins", coins: { sp: 1 } });
    assert.match(stole.text, /^\[r\d+\] (unseen: tell bren alone|noticed)/);
    const looted = await dm.loot("bren", "maren");
    assert.equal(looted.ok, false);
    assert.match(looted.text, /not_fallen/);
    const sent = t.requests().filter((r) => ["give", "steal", "loot"].includes(r.cmd as string));
    assert.deepEqual(sent.map((r) => [r.cmd, r.viewer, r.actor]), [["give", "dm", "bren"], ["steal", "dm", "bren"], ["loot", "dm", "bren"]]);
    const unknown = await dm.give("nobody", "maren", { kind: "coins", coins: { gp: 1 } });
    assert.match(unknown.text, /nobody is not in the scene/);
  } finally {
    t.close();
  }
});
