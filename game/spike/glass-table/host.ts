// Glass Table spike (CON-20, Glass Table design §8, decision 0093): the stand-in for the table host.
// Compiled with `bun build --compile` and started by the Swift Mac app (app/SpikeApp.swift) from
// inside the app bundle, it checks one by one what the Mac app needs before it is built to start the
// table (CON-21), and writes a report:
//
//   1. it runs as a compiled Bun file from the bundle, and what PATH the app was given;
//   2. it starts the bundled `nat20-api-server` and gets `hello` with the schema these types expect;
//   3. it signs in with ChatGPT from inside the bundle (Sign in with ChatGPT, the open-source flow):
//      it opens the system browser itself and takes the callback on 127.0.0.1, or refreshes a sign-in
//      an earlier round saved;
//   4. it makes one streamed `/v1/responses` call on the player's ChatGPT plan, under the hardened runtime;
//   5. it serves a WebSocket on 127.0.0.1 with a per-launch token, and the app's own socket connects;
//   6. the app's window closes and the app and the host go on (decision 0100: the table server lives
//      with the app, not its window).
//
// Items 3 and 4 use the ChatGPT plan of whoever runs it: never in a cloud session. CI sets
// NAT20_SPIKE_NO_MODEL=1: item 3 then checks only that the loopback callback reaches the host, and
// item 4 is skipped. The sign-in follows the spike of 2026-11-21 (project files
// `engine/siwc/spike.mjs`; sign-in design §5.4, §6). Merges no game code.
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { EngineClient } from "../../../packages/engine-client/src/index.ts";

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
 * The model of item 4: `SPIKE_MODEL`, else the one run.sh wrote beside the reports (the app is
 * started with an empty environment, and a Finder launch passes none), else terra.
 */
function spikeModel(): string {
  const file = path.join(reportDir, "spike-model");
  return process.env.SPIKE_MODEL || (existsSync(file) ? readFileSync(file, "utf8").trim() : "") || "gpt-6.1-terra";
}

// Sign in with ChatGPT, the open-source local flow: no secret, a client id issued on first sign-in.
const AUTH = "https://auth.openai.com/api/accounts";
const API = "https://api.openai.com/v1";
const CALLBACK_PORT = 1455;
const REDIRECT = `http://127.0.0.1:${CALLBACK_PORT}/auth/callback`;
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const siwcDir = path.join(reportDir, "siwc");
const b64url = (buf: Buffer): string => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function saveSecret(file: string, value: unknown): void {
  mkdirSync(siwcDir, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(siwcDir, file), JSON.stringify(value, null, 2), { mode: 0o600 });
}
function loadSecret<T>(file: string): T | undefined {
  const at = path.join(siwcDir, file);
  return existsSync(at) ? (JSON.parse(readFileSync(at, "utf8")) as T) : undefined;
}
type Creds = { client_id: string; access_token: string; refresh_token?: string };

/**
 * Waits on the loopback callback, with a deadline, for the request whose `state` is `state`; any
 * other request there (a reloaded tab of an earlier attempt) is refused and the wait goes on.
 * `ready` runs once it listens.
 */
function callback(state: string, ready: () => void, ms: number): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`no callback on ${REDIRECT} in ${ms / 1000} s`));
    }, ms);
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT);
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404).end();
        return;
      }
      if (url.searchParams.get("state") !== state) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("This sign-in link is from an earlier attempt.");
        log("callback with another state refused; still waiting");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Done. You can close this tab.");
      clearTimeout(timer);
      server.close();
      resolve(Object.fromEntries(url.searchParams));
    });
    server.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.listen(CALLBACK_PORT, "127.0.0.1", ready);
  });
}

/** Item 3: a saved sign-in refreshed, or a new one through the system browser. Never logs a token. */
async function signIn(): Promise<{ creds: Creds; how: string }> {
  const host = loadSecret<{ ext_agent_host_id: string }>("host.json") ?? { ext_agent_host_id: `urn:uuid:${randomUUID()}` };
  saveSecret("host.json", host);
  const saved = loadSecret<Creds>("creds.json");
  if (saved?.refresh_token && saved.client_id) {
    const res = await fetch(`${AUTH}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: saved.client_id, refresh_token: saved.refresh_token, resource: API }),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<Creds> & { error?: string };
    if (res.ok && body.access_token) {
      const creds = { ...saved, ...body } as Creds;
      saveSecret("creds.json", creds);
      return { creds, how: "refreshed the sign-in an earlier round saved" };
    }
    log(`refresh refused (${res.status} ${body.error ?? ""}): signing in again`);
  }
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const params = new URLSearchParams({
    client_id: saved?.client_id ?? "dynamic_agent_client",
    ...(saved?.client_id ? {} : { agent_name_hint: "Fine Print" }),
    ext_agent_host_id: host.ext_agent_host_id,
    response_type: "code",
    redirect_uri: REDIRECT,
    scope: SCOPE,
    resource: API,
    state,
    nonce: b64url(randomBytes(16)),
    code_challenge_method: "S256",
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
  });
  const url = `${AUTH}/authorize?${params}`;
  const answer = await callback(state, () => {
    log("opening the system browser for Sign in with ChatGPT");
    execFile("/usr/bin/open", [url], (error) => error && log(`open failed: ${error.message}`));
  }, 240_000);
  if (!answer.code) throw new Error(`the callback brought no code (${answer.error ?? "no error given"})`);
  const clientId = answer.client_id ?? saved?.client_id;
  if (!clientId) throw new Error("the callback named no client id");
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: answer.code, code_verifier: verifier, redirect_uri: REDIRECT, resource: API }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<Creds> & { error?: string };
  if (!res.ok || !body.access_token) throw new Error(`code exchange failed: ${res.status} ${body.error ?? ""}`);
  const creds = { ...body, client_id: clientId } as Creds;
  saveSecret("creds.json", creds);
  return { creds, how: `signed in through the system browser, client ${clientId.slice(0, 10)}…` };
}

/** Item 4: one streamed Responses call; returns the text, the usage and the time to the first delta. */
async function oneCall(token: string, model: string): Promise<string> {
  const t0 = Date.now();
  const res = await fetch(`${API}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model, store: false, stream: true, instructions: "Ты проверка связи.", input: [{ role: "user", content: "Ответь одним словом: да." }] }),
    signal: gone.signal,
  });
  if (!res.ok || !res.body) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  let text = "";
  let first: number | undefined;
  let usage: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | undefined;
  let completed = false;
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let at: number;
    while ((at = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data) as { type: string; delta?: string; response?: { usage?: typeof usage; error?: unknown } };
      if (event.type === "response.output_text.delta") {
        first ??= Date.now() - t0;
        text += event.delta ?? "";
      }
      if (event.type === "response.completed") {
        completed = true;
        usage = event.response?.usage;
      }
      if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") throw new Error(`stream failed: ${JSON.stringify(event).slice(0, 300)}`);
    }
  }
  if (!completed || !usage) throw new Error(`the stream ended without response.completed and its usage (text so far «${text.trim()}»)`);
  if (!text) throw new Error("no text in the stream");
  return `${model}: answer «${text.trim()}»; first text ${first ?? "?"} ms; tokens in ${usage?.input_tokens ?? "?"} (cached ${usage?.input_tokens_details?.cached_tokens ?? "?"}), out ${usage?.output_tokens ?? "?"}`;
}

function sameToken(given: string | null): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

let reportFile: string | undefined;
function writeReport(): string {
  if (reportFile) return reportFile;
  const file = path.join(reportDir, `report-${new Date(started).toISOString().replace(/[:.]/g, "-")}.json`);
  const report = {
    spike: "CON-20",
    at: new Date(started).toISOString(),
    total_ms: Date.now() - started,
    all_ok: items.every((i) => i.ok),
    items,
  };
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  reportFile = file;
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
      if (message.type === "window_closed") windowClosed = Date.now();
      ws.send(JSON.stringify({ type: "ack" }));
    },
    close() {
      shell = undefined;
    },
  },
});
console.log(JSON.stringify({ port: server.port, token }));

// The app holds the other end of standard input and writes nothing to it: when it closes the app is
// gone, however it went, and the host ends what it started (the model call, the engine) and itself.
// Watched from here on, so an app that dies in the middle of a check leaves nothing behind.
const gone = new AbortController();
let engine: EngineClient | undefined;
let windowClosed: number | undefined;
let closeAsked: number | undefined;
function end(): void {
  // The app went while item 6 was waiting on it: closing its window ended it, which decision 0100 rules out.
  if (closeAsked && !items.some((i) => i.id.startsWith("6 "))) {
    record({ id: "6 the app and the host outlive the closed window", ok: false, detail: `the app ended ${Date.now() - closeAsked} ms after its window was asked to close` });
    log(`report: ${writeReport()}`);
  }
  gone.abort();
  engine?.close();
  process.exit(0);
}
process.stdin.on("end", end);
process.on("SIGTERM", end);
process.stdin.resume();

record({
  id: "1 compiled host runs from the bundle",
  ok: true,
  detail: `bun ${Bun.version}, ${process.platform}-${process.arch}, execPath ${process.execPath}, PATH=${process.env.PATH ?? "(none)"}`,
});

await timed("2 bundled nat20-api-server answers hello", async () => {
  const binary = process.env.NAT20_API_SERVER || path.join(here, "nat20-api-server");
  if (!existsSync(binary)) throw new Error(`no engine at ${binary}`);
  // Kept running, as a table's engine is: it has to end when the app does.
  engine = await EngineClient.start(binary, { timeoutMs: 15_000 });
  const { version, engine_rev, schema_sha256 } = engine.hello;
  return `${binary}: contract ${version}, core ${engine_rev}, schema ${schema_sha256.slice(0, 12)} matches`;
});

if (process.env.NAT20_SPIKE_NO_MODEL === "1") {
  // No browser and no account here: only that a signed bundle may listen on the loopback callback.
  await timed("3 Sign in with ChatGPT from the bundle", async () => {
    const got = await callback("ci", () => {
      // A stale callback first, which must be refused without ending the wait, then the right one.
      void fetch(`${REDIRECT}?code=old&state=old`)
        .then(() => fetch(`${REDIRECT}?code=ci&state=ci`))
        .catch(() => undefined);
    }, 10_000);
    if (got.code !== "ci") throw new Error("the loopback callback came back without its query");
    return `loopback callback on ${REDIRECT} reached the host; browser and account not tried (NAT20_SPIKE_NO_MODEL=1, CI)`;
  });
  record({ id: "4 one streamed ChatGPT call under the hardened runtime", ok: false, detail: "skipped: NAT20_SPIKE_NO_MODEL=1 (CI)" });
} else {
  let creds: Creds | undefined;
  await timed("3 Sign in with ChatGPT from the bundle", async () => {
    const got = await signIn();
    creds = got.creds;
    return got.how;
  });
  if (creds) {
    const token = creds.access_token;
    await timed("4 one streamed ChatGPT call under the hardened runtime", () => oneCall(token, spikeModel()));
  } else {
    record({ id: "4 one streamed ChatGPT call under the hardened runtime", ok: false, detail: "not run: item 3 did not sign in" });
  }
}

// Give the app a moment to connect, then write the report whatever it shows.
const deadline = Date.now() + 20_000;
while (!items.some((i) => i.id.startsWith("5 ")) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
if (!items.some((i) => i.id.startsWith("5 "))) {
  record({ id: "5 the app's socket connected with the token", ok: false, detail: "no socket connected in 20 s after the checks" });
}
// 6: the app closes its own window, as the red button does, and must not end with it.
if (shell) {
  closeAsked = Date.now();
  shell.send(JSON.stringify({ type: "close_window" }));
  const wait = Date.now() + 5_000;
  while (!windowClosed && Date.now() < wait) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 3_000));
  record(
    windowClosed
      ? { id: "6 the app and the host outlive the closed window", ok: true, detail: `window closed; app and host still running ${Date.now() - windowClosed} ms later` }
      : { id: "6 the app and the host outlive the closed window", ok: false, detail: "the app did not report its window closed in 5 s" },
  );
} else {
  record({ id: "6 the app and the host outlive the closed window", ok: false, detail: "not run: no app socket" });
}
const file = writeReport();
shell?.send(JSON.stringify({ type: "done", report: file, all_ok: items.every((i) => i.ok) }));
log(`report: ${file}`);
