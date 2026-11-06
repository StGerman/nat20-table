// `/map` and the road on the panel (M9, AGT-79, AGT-83): the trip planner, the way ahead in travel
// order with the engine's times as words, from the human's own world view only.
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
  clock: { day: 3, hour: 10, minute: 0, watch: "morning" },
  at: { kind: "at", place: "highsteads" },
  drives: true,
  today: { fast: 30, normal: 24, slow: 18 },
  places: [
    { id: "wendmouth", name: "Wendmouth", kind: "town", market: true, inn_cp: 80 },
    { id: "wendford", name: "Wendford", kind: "village", market: true, inn_cp: 40 },
    { id: "pells_mill", name: "Pell's mill", kind: "mill", market: false },
    { id: "highsteads", name: "The Highsteads", kind: "hamlet", market: true },
  ],
  roads: [
    { id: "slope_track", from: "highsteads", to: "wendford", miles: 8, terrain: "hill", good_road: false, max_pace: "normal", reach: { pace: "normal", minutes: 160, nights: 0, arrives: { day: 3, hour: 12, minute: 40, watch: "afternoon" } } },
    { id: "river_road", from: "wendford", to: "wendmouth", miles: 20, terrain: "grassland", good_road: true, max_pace: "fast" },
    { id: "mill_lane", from: "wendford", to: "pells_mill", miles: 1, terrain: "grassland", good_road: false, max_pace: "fast" },
  ],
  unexplored: [{ id: "barrow_path", from: "highsteads", miles: 2, terrain: "hill", good_road: false, max_pace: "normal", reach: { pace: "normal", minutes: 40, nights: 0, arrives: { day: 3, hour: 10, minute: 40, watch: "morning" } } }],
  caravan: { owner: "npc:odda_vell", wagons: [] },
  card: null,
  escort: { merchant: "npc:odda_vell", destination: "wendmouth", wage_cp: 200, advance_days: 1, blades: [], done: false },
  trip: {
    complete: true,
    legs: [
      { road: "slope_track", to: "wendford", pace: "normal", miles: 8, minutes: 160, nights: 0, arrives: { day: 3, hour: 12, minute: 40, watch: "afternoon" } },
      { road: "river_road", to: "wendmouth", pace: "normal", miles: 20, minutes: 400, nights: 1, arrives: { day: 4, hour: 8, minute: 40, watch: "morning" } },
    ],
  },
} as unknown as WorldPlayer;

test("the map is the way ahead in travel order: the route with rough times and arrival watches, then what is off it, nearest first", () => {
  assert.deepEqual(mapLines(WORLD), [
    "Day 3 · morning · to Wendmouth",
    "",
    "▶ The Highsteads           you are here · hamlet, market",
    "│ slope track · 8 mi · hill country    about 3 hours",
    "● Wendford                 arrive afternoon",
    "│ river road · 20 mi · good road       about 7 hours, one night out",
    "◎ Wendmouth                arrive tomorrow morning · the contract ends",
    "",
    "28 mi to go · about 9 hours on the road",
    "a night on the way, there tomorrow morning",
    "",
    "OFF THE ROUTE",
    "  Pell's mill              1 mi from Wendford",
    "  ? unknown road           2 mi out of here   under an hour",
  ]);
  const pane = mapLines(WORLD, "pane");
  assert.ok(pane.every((l) => l.length <= 49), pane.join("\n"));
  assert.ok(pane.includes("● Wendford           afternoon"), pane.join("\n"));
  // Times are words and watches only: never a clock time, never minutes.
  assert.doesNotMatch([...mapLines(WORLD), ...pane].join("\n"), /\d:\d\d|\bmin\b|\d+ minutes/);
});

test("a road between two stops that the route doesn't take shows off the route, once", () => {
  const ridge = { id: "ridge_way", from: "highsteads", to: "wendmouth", miles: 30, terrain: "hill", good_road: false, max_pace: "normal" };
  const shortcut = { ...WORLD, roads: [...WORLD.roads, ridge] } as unknown as WorldPlayer;
  const off = mapLines(shortcut).filter((l) => /^ {2}Wendmouth +30 mi from here$/.test(l));
  assert.equal(off.length, 1, mapLines(shortcut).join("\n"));
});

test("without a route the map lists the roads out of here nearest first; a trip cut short says the rest is new; on the road no place is marked", () => {
  const free = { ...WORLD, escort: null, trip: null } as unknown as WorldPlayer;
  const lines = mapLines(free);
  assert.equal(lines[0], "Day 3 · morning");
  assert.deepEqual(lines.slice(lines.indexOf("ROADS FROM HERE") + 1), ["  ? unknown road           2 mi out of here   under an hour", "  Wendford                 8 mi from here   about 3 hours"]);
  const cut = { ...WORLD, trip: { complete: false, legs: [WORLD.trip!.legs[0]] } } as unknown as WorldPlayer;
  assert.ok(mapLines(cut).includes("│ … then on, by roads you don't know yet"), mapLines(cut).join("\n"));
  assert.ok(!mapLines(cut).some((l) => l.startsWith("◎")), "no destination mark short of it");
  const onRoad = { ...WORLD, at: { kind: "on_road", road: "river_road", came_from: "wendford", miles_left: 7 }, trip: null } as unknown as WorldPlayer;
  assert.equal(caravanAt(onRoad), "river road, 7 mi to Wendmouth");
  assert.equal(mapLines(onRoad)[2], "▶ on the river road, 7 mi to Wendmouth");
});

test("an unknown road says it is a road and where it starts, and a leg begun on the road shows the miles left (Stas's run, 2026-11-05)", () => {
  // The caravan stopped on the river road, 4 mi short of Wendmouth; the pane said "20 mi" for the
  // leg, and "? somewhere new 4 mi from Wendmouth", which read as the camp.
  const onRoad = {
    ...WORLD,
    at: { kind: "on_road", road: "river_road", came_from: "wendford", miles_left: 4 },
    unexplored: [{ id: "salt_road", from: "wendmouth", miles: 4, terrain: "coast", good_road: false, max_pace: "normal" }],
    trip: { complete: true, legs: [{ road: "river_road", to: "wendmouth", pace: "normal", miles: 4, minutes: 80, nights: 0, arrives: { day: 3, hour: 11, minute: 20, watch: "morning" } }] },
  } as unknown as WorldPlayer;
  const wide = mapLines(onRoad);
  assert.ok(wide.includes("│ river road · 4 mi · good road        about an hour"), wide.join("\n"));
  assert.ok(wide.includes("  ? unknown road           4 mi out of Wendmouth"), wide.join("\n"));
  const pane = mapLines(onRoad, "pane");
  assert.ok(pane.includes("  ? road out of Wendmouth 4 mi"), pane.join("\n"));
  assert.ok(pane.every((l) => l.length <= 49), pane.join("\n"));
  assert.ok(!pane.some((l) => /somewhere new|20 mi/.test(l)), pane.join("\n"));
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
      assert.doesNotMatch(map.text, /purse|zone|crossing_inn|old_tower/i, "nothing from the DM's view: no purse, no deck zone, no place id");
    } finally {
      u.close();
    }
  } finally {
    t.close();
  }
});
