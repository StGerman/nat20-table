// The Silent Mill's engine scenes (M6 step 7, TASKS.md MAP-2, MAP-3): every scene loads in order
// with the party carried in, and the yard and the cellar give the two fights the distances they
// need (decision D7: flat terrain with named anchors). Needs `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { State } from "@nat20-table/engine-client";
import { GameEngine, REPO } from "../src/engine.ts";
import { Adventure } from "../src/pack/adventure.ts";
import { peopleBook } from "../src/pack/campaign.ts";
import { skeletonFile } from "../src/pack/read.ts";
import { seatRuNames } from "../src/play/run.ts";
import { SeatNames } from "../src/table/seat-lines.ts";
import { peopleOf } from "../src/ui/people.ts";

const PACK = path.join(REPO, "scenarios/the_silent_mill");
const SCENES = ["s1_village_green", "s2_mill_road", "s3_mill_yard", "s4_captured_goblin", "s5_mill_cellar", "s6_wrap_up"];
const PARTY = ["bren", "torva", "maren", "ilsa"];

/** Goblin Warrior's Shortbow, normal range (SRD 5.2.1 Goblin Warrior). */
const SHORTBOW_FT = 80;
/** Wolf Speed: within two moves, a wolf bites on its second turn at the latest. */
const WOLF_TWO_MOVES_FT = 80;

type DmState = Extract<State, { view: "dm" }>;

/** An engine on the pack, with the party walked from Scene 1 to `scene`. */
async function walkTo(scene: string): Promise<{ engine: GameEngine; state: DmState; close(): void }> {
  const runDir = mkdtempSync(path.join(tmpdir(), "pack-"));
  const engine = await GameEngine.start({ pack: PACK, runDir, seed: 1 });
  const close = () => {
    engine.close();
    rmSync(runDir, { recursive: true });
  };
  try {
    for (const id of SCENES.slice(0, SCENES.indexOf(scene) + 1)) {
      const party = id === SCENES[0] ? undefined : PARTY;
      const loaded = await engine.request("dm", { cmd: "load_scene", scene_id: id, party });
      assert.ok(loaded.ok, `${id}: ${loaded.error?.message}`);
    }
    const state = await engine.request("dm", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state" && state.result.state.view === "dm");
    return { engine, state: state.result.state, close };
  } catch (error) {
    close();
    throw error;
  }
}

function feet(a: { x_ft: number; y_ft: number }, b: { x_ft: number; y_ft: number }): number {
  return Math.hypot(a.x_ft - b.x_ft, a.y_ft - b.y_ft);
}

/** Each hostile's distance to the nearest party member, and the party's closest pair. */
function spacing(state: DmState) {
  const party = state.creatures.filter((c) => c.side === "party");
  const hostile = state.creatures.filter((c) => c.side === "hostile");
  const nearest = new Map(hostile.map((h) => [h.handle, Math.min(...party.map((p) => feet(h.position_ft, p.position_ft)))]));
  const pairs = party.flatMap((p, i) => party.slice(i + 1).map((q) => feet(p.position_ft, q.position_ft)));
  return { party, hostile, nearest, closestPair: Math.min(...pairs) };
}

test("every scene of the pack loads in order with the whole party carried in", async () => {
  assert.deepEqual(readdirSync(path.join(PACK, "scenes")).sort(), SCENES.map((s) => `${s}.json`));
  for (const id of SCENES.slice(1)) {
    const file = JSON.parse(readFileSync(path.join(PACK, "scenes", `${id}.json`), "utf8"));
    assert.ok(file.party_start.length >= PARTY.length, `${id}: each party member gets its own start`);
  }
  const { state, close } = await walkTo("s6_wrap_up");
  try {
    assert.equal(state.scene_id, "s6_wrap_up");
    // The party, and the people of the green the scene places: the reeve, the miller and Wenna.
    assert.deepEqual(state.creatures.map((c) => c.handle).sort(), [...PARTY, "osric_hale", "bertil_pell", "wenna_thorne"].sort());
  } finally {
    close();
  }
});

test("the yard: the party starts at the gate, out of reach, inside bow range, and the fight starts", async () => {
  const { engine, state, close } = await walkTo("s3_mill_yard");
  try {
    const { party, hostile, nearest, closestPair } = spacing(state);
    assert.equal(party.length, 4);
    assert.deepEqual(hostile.map((h) => h.handle), ["goblin_1", "goblin_2", "goblin_3", "goblin_4", "wolf_1", "wolf_2", "wolf_3"]);
    assert.ok(closestPair >= 5, "no two party members share a square");
    for (const [handle, ft] of nearest) {
      assert.ok(ft > 10, `${handle} starts ${ft} ft from the party, in melee`);
      const most = handle.startsWith("goblin") ? SHORTBOW_FT : WOLF_TWO_MOVES_FT;
      assert.ok(ft <= most, `${handle} starts ${ft} ft from the party`);
    }
    const started = await engine.request("dm", { cmd: "start_combat", encounter_id: "yard_fight" });
    assert.ok(started.ok, started.error?.message);
  } finally {
    close();
  }
});

test("the cellar: the party comes down the stairs, the boss holds the millstone, and the fight starts", async () => {
  const { engine, state, close } = await walkTo("s5_mill_cellar");
  try {
    const { party, hostile, nearest, closestPair } = spacing(state);
    assert.equal(party.length, 4);
    assert.ok(closestPair >= 5, "no two party members share a square");
    assert.deepEqual(hostile.map((h) => h.handle), ["boss", "goblin_5", "goblin_6", "goblin_7", "wolf_4", "wolf_5"]);
    const millstone = state.anchors.find((a) => a.id === "millstone")!;
    assert.equal(feet(hostile[0].position_ft, millstone.position_ft), 0);
    for (const [handle, ft] of nearest) {
      assert.ok(ft > 10, `${handle} starts ${ft} ft from the party, in melee`);
      assert.ok(ft <= SHORTBOW_FT, `${handle} starts ${ft} ft from the party`);
    }
    const started = await engine.request("dm", { cmd: "start_combat", encounter_id: "cellar_fight" });
    assert.ok(started.ok, started.error?.message);
  } finally {
    close();
  }
});

test("the green: the reeve and the miller stand in the scene, named in Russian with every form", async () => {
  const adventure = Adventure.parse(JSON.parse(readFileSync(skeletonFile(PACK), "utf8")));
  const names = new SeatNames("ru", seatRuNames(PACK, adventure), peopleBook(PACK, adventure.party, adventure.npcs));
  const { engine, close } = await walkTo("s1_village_green");
  try {
    const seen = await engine.request("bren", { cmd: "get_state" });
    assert.ok(seen.result?.cmd === "get_state");
    const people = new Map(peopleOf(seen.result.state, names).map((p) => [p.id, p]));
    for (const [id, name, form] of [["osric_hale", "Осрик Хейл", "Осрика"], ["bertil_pell", "Бертил Пелл", "мельнику"]] as const) {
      const p = people.get(id);
      assert.ok(p, `${id} is among the people the seat lists`);
      assert.equal(p.state, "here");
      assert.equal(p.inScene, true);
      assert.equal(p.name, name);
      assert.ok(p.forms.includes(form), `${id}: «${form}» is a name token`);
    }
    // Wenna is in the cellar, not on the green.
    assert.equal(people.has("wenna_thorne"), false);
  } finally {
    close();
  }
});

test("a reeve the world remembers dead is not on the green again; the miller still is", async () => {
  const site = { map: "wend", place: "pells_mill" };
  const runDir = mkdtempSync(path.join(tmpdir(), "pack-"));
  const first = await GameEngine.start({ pack: PACK, runDir, seed: 1, site });
  let roster;
  try {
    assert.ok((await first.request("dm", { cmd: "load_scene", scene_id: "s1_village_green" })).ok);
    const saved = await first.request("dm", { cmd: "save_roster" });
    assert.ok(saved.result?.cmd === "save_roster");
    roster = saved.result.roster;
  } finally {
    first.close();
  }
  // The world a party left after the reeve died on an earlier visit.
  const world = roster.world as unknown as { state: { memory: { deeds?: Record<string, unknown> } } };
  world.state.memory.deeds = { killed_osric_hale: { by: ["bren"], day: 1, contract: 1 } };
  const again = await GameEngine.start({ pack: PACK, runDir, seed: 1, site, roster });
  try {
    const loaded = await again.request("dm", { cmd: "load_scene", scene_id: "s1_village_green" });
    assert.ok(loaded.ok, loaded.error?.message);
    const state = await again.request("dm", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state" && state.result.state.view === "dm");
    const here = state.result.state.creatures.map((c) => c.handle);
    assert.ok(!here.includes("osric_hale"), "the dead reeve is not placed");
    assert.ok(here.includes("bertil_pell"), "the miller is");
  } finally {
    again.close();
    rmSync(runDir, { recursive: true });
  }
});
