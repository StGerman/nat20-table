// Runs the built engine through the client. Build first: cargo build -p nat20-api-server.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EngineClient, SCHEMA_SHA256, envelope, type Command } from "../src/index.ts";

const binary = process.env.NAT20_API_SERVER ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../target/debug/nat20-api-server");

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
    const response = await client.request("dm", {
      cmd: "submit",
      actor: "bren",
      prompt_id: "p1",
      option_id: "melee_attack/longsword",
      targets: [],
      point: { x_ft: 5, y_ft: 0, z_ft: 0 },
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
