// The preflight (runbook Part 1, `npm run preflight`): it reports, never leaks, what the shell holds.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkBinary, engineBinary, engineEnv, prebuiltEngine, REPO } from "../src/paths.ts";

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

test("a fetched engine runs only where the checkout has no cargo build, and names every content directory (CON-19)", () => {
  const fetched = path.join(REPO, ".nat20/engine");
  const has = (...files: string[]) => (file: string) => files.includes(file);
  const bin = path.join(fetched, "bin/nat20-api-server");
  const release = path.join(REPO, "target/release/nat20-api-server");
  const debug = path.join(REPO, "target/debug/nat20-api-server");

  // No cargo build: the fetched engine and its checks, with the content directories set.
  assert.equal(prebuiltEngine({}, has(bin)), fetched);
  assert.equal(engineBinary({}, has(bin)), bin);
  assert.equal(checkBinary("nat20-audit", {}, has(bin)), path.join(fetched, "bin/nat20-audit"));
  const env = engineEnv({}, has(bin));
  assert.equal(env.NAT20_REGISTRY_ROOT, path.join(fetched, "core/registries"));
  assert.deepEqual(Object.keys(env).sort(), ["NAT20_DATA_DIR", "NAT20_MAPS_DIR", "NAT20_PREGENS_DIR", "NAT20_REGISTRY_ROOT", "NAT20_WORLDS_DIR"]);
  assert.equal(engineEnv({ NAT20_MAPS_DIR: "/mine" }, has(bin)).NAT20_MAPS_DIR, "/mine", "a variable already set wins");

  // A cargo build wins, unless asked otherwise; NAT20_API_SERVER and the debug build of check:ts always do.
  assert.equal(engineBinary({}, has(bin, release)), release);
  assert.equal(engineBinary({}, has(bin, debug)), debug);
  assert.equal(checkBinary("nat20-digest", {}, has(bin, debug)), undefined);
  assert.deepEqual(engineEnv({}, has(bin, debug)), {});
  assert.equal(engineBinary({ NAT20_ENGINE_BUILD: "prebuilt" }, has(bin, release)), bin);
  assert.equal(engineBinary({ NAT20_API_SERVER: "/opt/engine" }, has(bin)), "/opt/engine");
  assert.equal(engineBinary({ NAT20_ENGINE_BUILD: "debug" }, has(bin)), debug);
  assert.equal(engineBinary({ NAT20_ENGINE_DIR: "/elsewhere" }, has("/elsewhere/bin/nat20-api-server")), "/elsewhere/bin/nat20-api-server");

  // Nothing fetched: as before.
  assert.equal(prebuiltEngine({}, has()), undefined);
  assert.equal(engineBinary({}, has()), debug);
});
