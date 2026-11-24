// Glass Table spike (CON-20, Glass Table design §8, decision 0093): the stand-in for the table host.
// Compiled with `bun build --compile` and started by the Swift Mac app (app/SpikeApp.swift) from
// inside the app bundle, it checks one by one what the Mac app needs before it is built to start the
// table (CON-21), and writes a report:
//
//   1. it runs as a compiled Bun file from the bundle, and what PATH the app was given;
//   2. it starts the bundled `nat20-api-server` and gets `hello` with the schema these types expect;
//   3. it finds the player's own Claude Code with no shell PATH (the SDK's bundled copy is never used);
//   4. it makes one live model call through the Agent SDK, under the hardened runtime;
//   5. it serves a WebSocket on 127.0.0.1 with a per-launch token, and the app's own socket connects.
//
// Item 4 calls a model on the Claude login of whoever runs it (decision 0036): never in a cloud
// session, and CI sets NAT20_SPIKE_NO_MODEL=1 to skip it. Merges no game code: it reads the game's
// agent environment and the engine client, and changes neither.
import { spawnSync } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const logFile = path.join(reportDir, `host-${new Date(started).toISOString().replace(/[:.]/g, "-")}.log`);
let shell: Socket | undefined;
mkdirSync(reportDir, { recursive: true });

/** Launch Services drops an app's stderr, so every line also goes to a file beside the report. */
function log(line: string): void {
  console.error(line);
  appendFileSync(logFile, line + "\n");
}

function record(item: Item): void {
  items.push(item);
  log(`${item.ok ? "ok  " : "FAIL"} ${item.id}: ${item.detail}`);
  shell?.send(JSON.stringify({ type: "item", item }));
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

/**
 * A `claude` from npm is a `#!/usr/bin/env node` script, and a Finder launch has no node on PATH.
 * Returns the PATH the model call needs: the app's own, plus node's folder when the file is a script.
 */
function pathFor(claudeFile: string): { path: string; node?: string } {
  const base = process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin";
  if (readFileSync(claudeFile).subarray(0, 2).toString() !== "#!") return { path: base };
  const shell = process.env.SHELL || "/bin/zsh";
  const known = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].find((f) => existsSync(f));
  const node = known ?? spawnSync(shell, ["-lic", "command -v node"], { encoding: "utf8", timeout: 10_000 }).stdout?.trim().split("\n").pop();
  return node && existsSync(node) ? { path: `${path.dirname(node)}:${base}`, node } : { path: base };
}

function sameToken(given: string | null): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function writeReport(): string {
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

// 5 first, so the app sees the other items arrive. The app reads this one stdout line.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request, srv) {
    const url = new URL(request.url);
    // The app holds the socket itself, as the shell does (decision 0093), and a program's socket names
    // no origin. A page in a browser always names one, and may not take the seat.
    const origin = request.headers.get("origin") ?? "";
    if (url.pathname === "/seat" && sameToken(url.searchParams.get("token")) && !origin && !shell) {
      return srv.upgrade(request) ? undefined : new Response("upgrade failed", { status: 400 });
    }
    if (url.pathname === "/seat") log(`seat refused: origin ${JSON.stringify(origin)}, token ${sameToken(url.searchParams.get("token")) ? "right" : "wrong"}`);
    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      shell = ws;
      ws.send(JSON.stringify({ type: "hello", items }));
    },
    message(ws, data) {
      let message: { type?: string; client?: string };
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (message.type === "shell") {
        record({ id: "5 the app's socket connected with the token", ok: true, detail: message.client ?? "" });
      }
      ws.send(JSON.stringify({ type: "ack" }));
    },
    close() {
      shell = undefined;
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
    const env = { ...process.env, PATH: pathFor(claude.file).path };
    const version = spawnSync(claude.file, ["--version"], { encoding: "utf8", timeout: 15_000, env });
    if (version.status !== 0) throw new Error(`${claude.file} --version failed with PATH=${env.PATH}: ${version.stderr || version.error?.message}`);
    const cwd = mkdtempSync(path.join(tmpdir(), "glass-table-spike-"));
    let text = "";
    let cost = 0;
    let auth = "";
    try {
      for await (const message of query({
        prompt: "Ответь одним словом: да.",
        options: {
          pathToClaudeCodeExecutable: claude.file,
          model: process.env.SPIKE_MODEL || "claude-haiku-5-5",
          maxTurns: 1,
          tools: [],
          settingSources: [],
          cwd,
          env: agentEnv(env),
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
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
    if (!text) throw new Error("no result text");
    return `Claude Code ${version.stdout.trim()}; answer «${text.trim()}»; key source ${auth || "?"}; api-equivalent ${cost.toFixed(4)} USD`;
  });
} else {
  record({ id: "4 one live model call under the hardened runtime", ok: false, detail: "not run: item 3 found no Claude Code" });
}

// Give the app a moment to connect, then write the report whatever it shows.
const deadline = Date.now() + 20_000;
while (!items.some((i) => i.id.startsWith("5 ")) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
if (!items.some((i) => i.id.startsWith("5 "))) {
  record({ id: "5 the app's socket connected with the token", ok: false, detail: "no socket connected in 20 s after the checks" });
}
const file = writeReport();
shell?.send(JSON.stringify({ type: "done", report: file, all_ok: items.every((i) => i.ok) }));
log(`report: ${file}`);
// The app ends the host when it quits; a host whose app is gone (stdin closed) exits by itself.
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
