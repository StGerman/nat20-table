// `/map` and the road on the panel (M9, AGT-79): a text sketch of the places the party knows and
// the roads between them, the caravan marked, from the human's own world view only.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorldPlayer } from "@nat20-table/engine-client";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat } from "../src/table/scripted.ts";
import { situationOf } from "../src/table/situation.ts";
import { situationRows } from "../src/ui/panel.ts";
import { caravanAt, mapLines } from "../src/view.ts";
import { testTable } from "./helpers.ts";

const WORLD = {
  clock: { day: 2, hour: 7, minute: 0, watch: "early_morning" },
  at: { kind: "at", place: "wendford" },
  drives: true,
  today: { fast: 30, normal: 24, slow: 18 },
  places: [
    { id: "wendford", name: "Wendford", kind: "village", market: true, inn_cp: 40 },
    { id: "wendmouth", name: "Wendmouth", kind: "town", market: true, inn_cp: 80 },
  ],
  roads: [{ id: "river_road", from: "wendford", to: "wendmouth", miles: 20, terrain: "grassland", good_road: true, max_pace: "fast" }],
  unexplored: [{ id: "slope_track", from: "wendford", miles: 8 }],
  caravan: { owner: "npc:odda_vell", wagons: [] },
  card: null,
} as unknown as WorldPlayer;

test("the map lists the known places with their roads, marks the caravan, and names no unknown place", () => {
  assert.deepEqual(mapLines(WORLD), [
    "Day 2, early morning. The caravan: at Wendford.",
    "▶ Wendford (village, market, inn)",
    "    river road · 20 mi · Wendmouth",
    "    slope track · 8 mi · somewhere you don't know yet",
    "  Wendmouth (town, market, inn)",
    "    river road · 20 mi · Wendford",
  ]);
  const onRoad = { ...WORLD, at: { kind: "on_road", road: "river_road", came_from: "wendford", miles_left: 7 } } as unknown as WorldPlayer;
  assert.equal(caravanAt(onRoad), "river road, 7 mi to Wendmouth");
  assert.equal(mapLines(onRoad)[0], "Day 2, early morning. The caravan: on the river road, 7 mi to Wendmouth.");
  assert.ok(!mapLines(onRoad).some((l) => l.startsWith("▶")), "no place is marked on the road");
});

test("the panel's bar says the day and where the caravan is, and the side pane draws the map out of a fight", async () => {
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" });
    await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"], human: "bren" });
    const state = await t.engine.request("bren", { cmd: "get_state" });
    assert.ok(state.result?.cmd === "get_state");
    const situation = situationOf(state.result.state, undefined)!;
    assert.match(situation.road?.where ?? "", /^Day 1, .* · Vale Town$/);
    const text = (rows: ReturnType<typeof situationRows>) => rows.map((r) => r.map((s) => s.text).join(""));
    assert.match(text(situationRows(situation, { columns: 80, rows: 30 }))[0], /^Day 1, .* · Vale Town/);
    const pane = text(situationRows(situation, { columns: 140, rows: 40 }, { pane: true }));
    assert.ok(pane.some((l) => l.startsWith("▶ Vale Town")), pane.join("\n"));

    // /map at the table: the human's own map, as an info card.
    const seat = new ScriptedSeat("bren", [{ kind: "command", name: "map" }, { kind: "command", name: "quit" }]);
    const u = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
    try {
      await new TableLoop({ table: u.table, dm: new ScriptedDm({}), players: [new ScriptedPlayer("maren")], maxSteps: 20, campaign: { party: ["bren", "maren"] } }).run("vale_town");
      const map = seat.shown.find((e) => e.kind === "info" && e.title === "Map");
      assert.ok(map?.kind === "info" && map.text.includes("▶ Vale Town"), JSON.stringify(map));
      assert.doesNotMatch(map.text, /purse|route|zone/i, "nothing from the DM's view");
    } finally {
      u.close();
    }
  } finally {
    t.close();
  }
});
