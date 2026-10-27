// The spike's start (`npm run spike`, M6 step 1) up to its first model call, which only Stas's Mac makes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/paths.ts";

const spikeFolders = () => (existsSync(path.join(REPO, "runs")) ? readdirSync(path.join(REPO, "runs")).filter((name) => name.startsWith("spike-")) : []);

function spike(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(REPO, "game/spike/spike.ts"), ...args], {
    env,
    encoding: "utf8",
  });
}

test("the spike refuses an API key before it makes a run folder, and never prints the key", () => {
  const key = "sk-ant-spike-test-key";
  const before = spikeFolders();
  // No turns: should the refusal ever break, the spike still sends no message to a model.
  const run = spike(["--turns", "0"], { ...process.env, ANTHROPIC_API_KEY: key });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /ANTHROPIC_API_KEY is set, so the run would bill the API instead of your Claude plan/);
  assert.doesNotMatch(run.stdout + run.stderr, new RegExp(key));
  assert.deepEqual(spikeFolders(), before);
});

test("a dry run of the spike prints both seats' options and writes nothing", () => {
  const before = spikeFolders();
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const run = spike(["--dry-run"], env);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^dm \{/m);
  assert.deepEqual(spikeFolders(), before);
});
