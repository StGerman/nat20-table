#!/usr/bin/env node
// A stand-in engine for client tests that a real engine can't stage: it answers `hello` with the
// checked-in schema hash, answers `get_state` never (to test timeouts), and exits on `new_session`
// (to test a crash mid-request).
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const sha = readFileSync(new URL("../../../generated/nat20-api.schema.sha256", import.meta.url), "utf8").trim();
createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.cmd === "hello") {
    const result = { cmd: "hello", protocol: "nat20-api", version: "fake", engine_rev: "fake", schema_sha256: sha };
    const response = { v: 1, id: request.id, ok: true, result, events: [], awaiting: { kind: "no_session" }, log_head: 0 };
    process.stdout.write(JSON.stringify(response) + "\n");
  } else if (request.cmd === "new_session") {
    process.stderr.write("fake engine: crashing on purpose\n");
    process.exit(3);
  }
});
