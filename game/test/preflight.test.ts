// The preflight (runbook Part 1, `npm run preflight`): it reports, never leaks, what the shell holds.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { engineBinary, REPO } from "../src/paths.ts";

test("the preflight fails on an API key in the shell, says how to fix it, and never prints the key", () => {
  const key = "sk-ant-preflight-test-key";
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(REPO, "game/src/play/preflight.ts")], {
    // The engine named, so the preflight doesn't build it here.
    env: { ...process.env, ANTHROPIC_API_KEY: key, NAT20_API_SERVER: engineBinary() },
    encoding: "utf8",
  });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stdout, /✗ No API key in the shell: ANTHROPIC_API_KEY is set, so a run would bill the API\n {4}fix: unset ANTHROPIC_API_KEY/);
  assert.match(run.stdout, /check(s)? failed/);
  assert.doesNotMatch(run.stdout + run.stderr, new RegExp(key));
});

test("the preflight loads with no package installed: it imports Node built-ins and our own such modules only", () => {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, from] of readFileSync(file, "utf8").matchAll(/^import\s[^;]*?from "([^"]+)";/gm)) {
      if (from.startsWith(".")) visit(path.resolve(path.dirname(file), from));
      else assert.match(from, /^node:/, `${path.relative(REPO, file)} imports ${from}, which needs npm ci`);
    }
  };
  visit(path.join(REPO, "game/src/play/preflight.ts"));
  assert.ok(seen.size > 1);
});

test("check:ts runs the debug engine, never a release build a pin bump left stale; play prefers the release build (AGT-75)", () => {
  const debug = path.join(REPO, "target/debug/nat20-api-server");
  assert.equal(engineBinary({ NAT20_ENGINE_BUILD: "debug" }), debug);
  assert.equal(engineBinary({ NAT20_ENGINE_BUILD: "debug", NAT20_API_SERVER: "/opt/engine" }), "/opt/engine", "NAT20_API_SERVER still wins");
  const release = path.join(REPO, "target/release/nat20-api-server");
  assert.equal(engineBinary({}), existsSync(release) ? release : debug);
  const pkg = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts["check:ts"], /NAT20_ENGINE_BUILD=debug node .*--test/);
});
