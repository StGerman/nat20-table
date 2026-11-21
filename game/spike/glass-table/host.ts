// Glass Table spike (CON-20, design §8, scope §6): the stand-in for the table host. Compiled with
// `bun build --compile` and started by the Tauri shell from inside the app bundle, it checks one by
// one what the app needs before any app code is written, and writes a report:
//
//   1. it runs as a compiled Bun file from the bundle, and what PATH the app was given;
//   2. it starts the bundled `nat20-api-server` and gets `hello` with the schema these types expect;
//   3. it finds the player's own Claude Code with no shell PATH (the SDK's bundled copy is never used);
//   4. it makes one live model call through the Agent SDK, under the hardened runtime;
//   5. it serves a WebSocket on 127.0.0.1 with a per-launch token, and the shell's page connects.
//
// Item 4 calls a model on the Claude login of whoever runs it (decision 0036): never in a cloud
// session, and CI sets NAT20_SPIKE_NO_MODEL=1 to skip it. Merges no game code: it reads the game's
// agent environment and the engine client, and changes neither.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { EngineClient } from "../../../packages/engine-client/src/index.ts";
import { agentEnv } from "../../src/agents/env.ts";

// Bun's own API, typed here so `tsc -p game` checks this file without Bun's types.
declare const Bun: {
  version: string;
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request, server: { upgrade(request: Request): boolean }): Response | undefined;
    websocket: { open(ws: Socket): void; message(ws: Socket, data: string): void; close(ws: Socket): void };
  }): { port: number };
};
interface Socket {
  send(data: string): void;
  close(): void;
}

type Item = { id: string; ok: boolean; detail: string; ms?: number };
const items: Item[] = [];
const started = Date.now();
const here = path.dirname(process.execPath);
const reportDir = path.join(homedir(), "Library", "Application Support", "glass-table-spike");
const token = randomBytes(16).toString("hex");
let page: Socket | undefined;

function record(item: Item): void {
  items.push(item);
  console.error(`${item.ok ? "ok  " : "FAIL"} ${item.id}: ${item.detail}`);
  page?.send(JSON.stringify({ type: "item", item }));
}

async function timed(id: string, run: () => Promise<string>): Promise<boolean> {
  const t0 = Date.now();
  try {
    record({ id, ok: true, detail: await run(), ms: Date.now() - t0 });
    return true;
  } catch (error) {
    record({ id, ok: false, detail: (error as Error).message, ms: Date.now() - t0 });
    return false;
  }
}

/**
 * Where the player's own Claude Code may be, when the app has no shell PATH (launched from Finder,
 * PATH is `/usr/bin:/bin:/usr/sbin:/sbin`). In order: an explicit override, the native installer,
 * the old local install, Homebrew, npm's global prefix on Homebrew or /usr/local, then the user's
 * login shell as the last resort. Returns the path and which rule found it.
 */
function findClaude(): { file: string; how: string } | undefined {
  const home = homedir();
  const candidates: Array<[string | undefined, string]> = [
    [process.env.NAT20_CLAUDE_PATH, "NAT20_CLAUDE_PATH"],
    [path.join(home, ".local", "bin", "claude"), "native installer (~/.local/bin)"],
    [path.join(home, ".claude", "local", "claude"), "local install (~/.claude/local)"],
    ["/opt/homebrew/bin/claude", "Homebrew (/opt/homebrew/bin)"],
    ["/usr/local/bin/claude", "/usr/local/bin"],
  ];
  for (const [file, how] of candidates) if (file && existsSync(file)) return { file, how };
  const shell = process.env.SHELL || "/bin/zsh";
  const found = spawnSync(shell, ["-lic", "command -v claude"], { encoding: "utf8", timeout: 10_000 });
  const file = found.stdout?.trim().split("\n").pop();
  if (found.status === 0 && file && existsSync(file)) return { file, how: `login shell (${shell} -lic)` };
  return undefined;
}

function writeReport(): string {
  mkdirSync(reportDir, { recursive: true });
  const file = path.join(reportDir, `report-${new Date(started).toISOString().replace(/[:.]/g, "-")}.json`);
  const report = {
    spike: "CON-20",
    at: new Date(started).toISOString(),
    total_ms: Date.now() - started,
    all_ok: items.every((i) => i.ok),
    items,
  };
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  return file;
}

// 5 first, so the page sees the other items arrive. The shell reads this one stdout line.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request, srv) {
    const url = new URL(request.url);
    if (url.pathname === "/seat" && url.searchParams.get("token") === token && !page) {
      return srv.upgrade(request) ? undefined : new Response("upgrade failed", { status: 400 });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      page = ws;
      ws.send(JSON.stringify({ type: "hello", items }));
    },
    message(ws, data) {
      const message = JSON.parse(String(data)) as { type: string; userAgent?: string };
      if (message.type === "page") {
        record({ id: "5 page connected over WebSocket with the token", ok: true, detail: message.userAgent ?? "" });
      }
      ws.send(JSON.stringify({ type: "ack" }));
    },
    close() {
      page = undefined;
    },
  },
});
console.log(JSON.stringify({ port: server.port, token }));

record({
  id: "1 compiled host runs from the bundle",
  ok: true,
  detail: `bun ${Bun.version}, ${process.platform}-${process.arch}, execPath ${process.execPath}, PATH=${process.env.PATH ?? "(none)"}`,
});

await timed("2 bundled nat20-api-server answers hello", async () => {
  const binary = process.env.NAT20_API_SERVER || path.join(here, "nat20-api-server");
  if (!existsSync(binary)) throw new Error(`no engine at ${binary}`);
  const engine = await EngineClient.start(binary, { timeoutMs: 15_000 });
  const { version, engine_rev, schema_sha256 } = engine.hello;
  engine.close();
  return `${binary}: contract ${version}, core ${engine_rev}, schema ${schema_sha256.slice(0, 12)} matches`;
});

const claude = findClaude();
record(
  claude
    ? { id: "3 Claude Code found with no shell PATH", ok: true, detail: `${claude.file}, by ${claude.how}` }
    : { id: "3 Claude Code found with no shell PATH", ok: false, detail: "not found in any known place, nor by the login shell" },
);

if (process.env.NAT20_SPIKE_NO_MODEL === "1") {
  record({ id: "4 one live model call under the hardened runtime", ok: false, detail: "skipped: NAT20_SPIKE_NO_MODEL=1 (CI)" });
} else if (claude) {
  await timed("4 one live model call under the hardened runtime", async () => {
    const version = spawnSync(claude.file, ["--version"], { encoding: "utf8", timeout: 15_000 });
    let text = "";
    let cost = 0;
    let auth = "";
    for await (const message of query({
      prompt: "Ответь одним словом: да.",
      options: {
        pathToClaudeCodeExecutable: claude.file,
        model: process.env.SPIKE_MODEL || "claude-haiku-5-5",
        maxTurns: 1,
        tools: [],
        settingSources: [],
        cwd: mkdtempSync(path.join(tmpdir(), "glass-table-spike-")),
        env: agentEnv(process.env),
        systemPrompt: "Ты проверка связи.",
      },
    })) {
      if (message.type === "system" && message.subtype === "init") auth = String((message as { apiKeySource?: string }).apiKeySource ?? "");
      if (message.type === "result") {
        if (message.subtype !== "success") throw new Error(`result ${message.subtype}`);
        text = message.result;
        cost = message.total_cost_usd;
      }
    }
    if (!text) throw new Error("no result text");
    return `Claude Code ${version.stdout.trim()}; answer «${text.trim()}»; key source ${auth || "?"}; api-equivalent ${cost.toFixed(4)} USD`;
  });
}

// Give the page a moment to connect, then write the report whatever it shows.
const deadline = Date.now() + 20_000;
while (!items.some((i) => i.id.startsWith("5 ")) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
if (!items.some((i) => i.id.startsWith("5 "))) {
  record({ id: "5 page connected over WebSocket with the token", ok: false, detail: "no page connected in 20 s after the checks" });
}
const file = writeReport();
page?.send(JSON.stringify({ type: "done", report: file, all_ok: items.every((i) => i.ok) }));
console.error(`report: ${file}`);
