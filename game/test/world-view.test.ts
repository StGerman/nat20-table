// The world as the DM reads it (AGT-80, API-48): the place NPCs' notes from the world file reach
// the DM's lines, so the DM can play each NPC's motives and clues.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { WorldDm } from "@nat20-table/engine-client";
import { REPO } from "../src/engine.ts";
import { dmWorldLines } from "../src/view.ts";

test("the DM's world lines carry every place NPC's notes", () => {
  const lines = readFileSync(path.join(REPO, "contract/fixtures/place_npcs.jsonl"), "utf8").split("\n").filter(Boolean);
  const world = (JSON.parse(lines[2]) as { response: { result: { state: { world: WorldDm } } } }).response.result.state.world;
  const npcs = world.npcs ?? [];
  const noted = npcs.filter((n) => n.notes);
  assert.ok(noted.length > 0, "the fixture's world has NPC notes");
  const text = dmWorldLines(world);
  for (const n of noted) assert.ok(text.includes(`${n.name} (${n.id}): ${n.notes}`), `${n.id}'s notes reach the DM`);
});
