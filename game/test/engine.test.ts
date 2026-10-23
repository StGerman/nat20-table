// The game's engine handle against the built engine (`cargo build -p nat20-api-server` first).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GameEngine, REPO, SESSION_LOG } from "../src/engine.ts";

const pack = path.join(REPO, "crates/nat20-api-server/data");

test("each viewer is shown each event once, projected for it", async () => {
  const runDir = mkdtempSync(path.join(tmpdir(), "game-engine-"));
  const engine = await GameEngine.start({ pack, runDir, seed: 1 });
  try {
    assert.equal(engine.seed, 1);
    await engine.request("dm", { cmd: "load_scene", scene_id: "duel" });
    await engine.request("dm", { cmd: "start_combat", encounter_id: "duel" });
    const dm = await engine.newEvents("dm");
    const bren = await engine.newEvents("bren");
    assert.ok(dm.some((e) => e.kind === "session_started"), "the DM sees the seed");
    assert.ok(!bren.some((e) => e.kind === "session_started"), "a player doesn't");
    assert.ok(bren.some((e) => e.kind === "roll"));
    for (const event of bren) {
      if (event.kind === "roll") assert.equal(event.roll.view, "player");
    }
    assert.deepEqual(await engine.newEvents("bren"), [], "nothing is shown twice");
    assert.equal(dm.at(-1)?.seq, engine.logHead);
    await engine.writeLog();
  } finally {
    engine.close();
  }
  const log = readFileSync(path.join(runDir, "engine-log.jsonl"), "utf8").trim().split("\n");
  assert.equal(JSON.parse(log[0]).request.cmd, "hello");
  const events = readFileSync(path.join(runDir, SESSION_LOG), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events[0].kind, "session_started", "the session log is the DM's view, one event per line");
  rmSync(runDir, { recursive: true });
});
