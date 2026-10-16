// Runs the built engine through the client. Build first: cargo build -p nat20-api-server.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EngineClient, SCHEMA_SHA256 } from "../src/index.ts";

const binary = process.env.NAT20_API_SERVER ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../target/debug/nat20-api-server");

test("hello matches the generated schema hash", async () => {
  const client = await EngineClient.start(binary);
  try {
    const hello = await client.request({ cmd: "hello" });
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
    const first = await client.request({ cmd: "hello" }, "same-id");
    const second = await client.request({ cmd: "hello" }, "same-id");
    assert.deepEqual(second, first);
  } finally {
    client.close();
  }
});
