// Runs the built engine through the client. Build first: cargo build -p nat20-api-server.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EngineClient, EngineStopped, SCHEMA_SHA256, envelope, type Command } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const binary = process.env.NAT20_API_SERVER ?? path.resolve(here, "../../../target/debug/nat20-api-server");
const fake = path.join(here, "fake-engine.mjs");

test("hello matches the generated schema hash", async () => {
  const client = await EngineClient.start(binary);
  try {
    const hello = await client.request("dm", { cmd: "hello" });
    assert.equal(hello.ok, true);
    assert.equal(hello.result?.cmd, "hello");
    if (hello.result?.cmd === "hello") assert.equal(hello.result.schema_sha256, SCHEMA_SHA256);
  } finally {
    client.close();
  }
});

test("a repeated request id returns the stored response", async () => {
  const client = await EngineClient.start(binary);
  try {
    const first = await client.request("dm", { cmd: "hello" }, "same-id");
    const second = await client.request("dm", { cmd: "hello" }, "same-id");
    assert.deepEqual(second, first);
  } finally {
    client.close();
  }
});

test("a command the engine does not implement yet fails with not_implemented", async () => {
  const client = await EngineClient.start(binary);
  try {
    const started = await client.request("dm", { cmd: "new_session" });
    assert.equal(started.ok, true);
    const loaded = await client.request("dm", { cmd: "load_scene", scene_id: "duel" });
    assert.equal(loaded.ok, true);
    // A ladder check without a skill (a plain ability check) is not served yet.
    const response = await client.request("dm", {
      cmd: "request_check",
      actor: "bren",
      check: { kind: "ladder", ability: "strength", dc: 10 },
    });
    assert.equal(response.ok, false);
    assert.equal(response.error?.code, "not_implemented");
    assert.equal(response.error?.retryable, false);
    assert.deepEqual(response.awaiting, { kind: "none" });
  } finally {
    client.close();
  }
});

test("a command cannot override the bound viewer, version or id", () => {
  const smuggled = { cmd: "get_state", viewer: "dm", v: 2, id: "other" } as Command;
  assert.deepEqual(envelope("bren", smuggled, "c-9"), { cmd: "get_state", v: 1, id: "c-9", viewer: "bren" });
});

test("every exchange is appended to the log file as a request and its response", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "engine-log-"));
  const logFile = path.join(dir, "engine-log.jsonl");
  const client = await EngineClient.start(binary, { logFile });
  try {
    await client.request("dm", { cmd: "new_session", seed: 1 });
  } finally {
    client.close();
  }
  const lines = readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.request.cmd), ["hello", "new_session"]);
  assert.equal(lines[1].request.seed, 1);
  assert.equal(lines[1].response.result.seed, 1);
  rmSync(dir, { recursive: true });
});

test("the engine reads scenes from the data directory it is started with", async () => {
  const pack = mkdtempSync(path.join(tmpdir(), "engine-pack-"));
  cpSync(path.resolve(here, "../../../crates/nat20-api-server/data/scenes/duel.json"), path.join(pack, "scenes/duel.json"));
  const client = await EngineClient.start(binary, { env: { NAT20_DATA_DIR: pack } });
  try {
    await client.request("dm", { cmd: "new_session" });
    assert.equal((await client.request("dm", { cmd: "load_scene", scene_id: "duel" })).ok, true);
    // Only the pack's scenes exist for this engine.
    const other = await client.request("dm", { cmd: "load_scene", scene_id: "m3_s1_green" });
    assert.equal(other.error?.code, "bad_scene");
  } finally {
    client.close();
  }
  rmSync(pack, { recursive: true });
});

test("an engine that exits fails the pending request and every later one", async () => {
  const client = await EngineClient.start(fake);
  await assert.rejects(client.request("dm", { cmd: "new_session" }), (error: Error) => {
    assert.ok(error instanceof EngineStopped);
    // The stderr tail may or may not be read before the exit is seen, so only the exit is checked.
    assert.match(error.message, /exited \(code 3\)/);
    return true;
  });
  await assert.rejects(client.request("dm", { cmd: "hello" }), EngineStopped);
});

test("an engine that doesn't answer in time is stopped", async () => {
  const client = await EngineClient.start(fake, { timeoutMs: 200 });
  await assert.rejects(client.request("dm", { cmd: "get_state" }), /did not answer get_state/);
  await assert.rejects(client.request("dm", { cmd: "hello" }), EngineStopped);
});

test("a binary that doesn't exist fails to start", async () => {
  await assert.rejects(EngineClient.start(path.join(here, "no-such-engine")), /could not run/);
});
