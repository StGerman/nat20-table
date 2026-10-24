// Thin client for nat20-api-server. Wire types come only from ./generated (CLAUDE.md Rule 1).
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { SCHEMA_SHA256, type Command, type Request, type Response, type Viewer } from "./generated/api.ts";

export * from "./generated/api.ts";
/** The scene file types (`SceneFile` and what it holds), as read by the engine and the DM agent. */
export * as scene from "./generated/scene.ts";
/** The pregen file types (`PregenFile` and what it holds): a character a scene names by id. */
export * as pregen from "./generated/pregen.ts";

/**
 * Wraps a command in the request envelope. The envelope fields are set after the command's, so a
 * command carrying its own `viewer`, `v` or `id` (say, tool input from a player agent) cannot
 * override the viewer its caller bound.
 */
export function envelope(viewer: Viewer, command: Command, id: string): Request {
  return { ...command, v: 1, id, viewer };
}

/** How to start the engine. Every field is optional; the defaults run it as a test does. */
export interface StartOptions {
  /**
   * Extra environment for the engine process, on top of this process's: the content directories
   * (`NAT20_DATA_DIR` for a scenario pack, `NAT20_PREGENS_DIR`, `NAT20_MAPS_DIR`; protocol §2.1)
   * and `NAT20_REGISTRY_ROOT`.
   */
  env?: Record<string, string>;
  /**
   * A file to append every exchange to, one JSON line `{"request": …, "response": …}` each, the
   * shape of a conformance fixture. A run's engine log.
   */
  logFile?: string;
  /** A file to append the engine's stderr to. Without one, the last lines are kept for errors. */
  stderrFile?: string;
  /** A request unanswered for this long stops the engine and fails (default 30 s). */
  timeoutMs?: number;
}

/** The engine stopped: it exited, crashed, never started, or was stopped after a timeout. */
export class EngineStopped extends Error {}

const DEFAULT_TIMEOUT_MS = 30_000;
const STDERR_LINES_KEPT = 20;

interface Pending {
  request: Request;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class EngineClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly options: StartOptions;
  private readonly pending = new Map<string, Pending>();
  private readonly stderrTail: string[] = [];
  private nextId = 1;
  private stopped: EngineStopped | undefined;

  private constructor(binary: string, options: StartOptions) {
    this.options = options;
    this.child = spawn(binary, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    });
    createInterface({ input: this.child.stdout }).on("line", (line) => this.answer(line));
    createInterface({ input: this.child.stderr }).on("line", (line) => {
      if (options.stderrFile) appendFileSync(options.stderrFile, line + "\n");
      this.stderrTail.push(line);
      if (this.stderrTail.length > STDERR_LINES_KEPT) this.stderrTail.shift();
    });
    this.child.on("error", (error) => this.stop(`the engine ${binary} could not run: ${error.message}`));
    this.child.on("exit", (code, signal) => this.stop(`the engine exited (${signal ?? `code ${code}`})`));
    // Writing to an engine that just died must not throw out of the event loop.
    this.child.stdin.on("error", () => undefined);
  }

  /** Spawns the engine and checks it serves the schema these types were generated from. */
  static async start(binary: string, options: StartOptions = {}): Promise<EngineClient> {
    const client = new EngineClient(binary, options);
    const hello = await client.request("dm", { cmd: "hello" });
    const result = hello.ok && hello.result?.cmd === "hello" ? hello.result : undefined;
    if (!result || result.schema_sha256 !== SCHEMA_SHA256) {
      client.close();
      throw new Error(`engine schema ${result?.schema_sha256 ?? "unknown"} does not match client schema ${SCHEMA_SHA256}; regenerate with \`npm run gen\``);
    }
    return client;
  }

  /**
   * Sends one command and resolves with its response, projected for `viewer`. The engine answers
   * requests in order. A player agent's tools must pass that agent's own handle as `viewer`.
   * Rejects with `EngineStopped` when the engine is gone or doesn't answer in time.
   */
  request(viewer: Viewer, command: Command, id = `c-${this.nextId++}`): Promise<Response> {
    if (this.stopped) return Promise.reject(this.stopped);
    const request = envelope(viewer, command, id);
    return new Promise((resolve, reject) => {
      const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => {
        this.stop(`the engine did not answer ${request.cmd} (${id}) within ${timeoutMs} ms`);
        this.child.kill();
      }, timeoutMs);
      this.pending.set(id, { request, resolve, reject, timer });
      this.child.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  /** Why the engine stopped, once it has. */
  get stoppedReason(): EngineStopped | undefined {
    return this.stopped;
  }

  close(): void {
    this.child.stdin.end();
  }

  private answer(line: string): void {
    const response = JSON.parse(line) as Response;
    const id = response.id ?? undefined;
    const pending = id === undefined ? undefined : this.pending.get(id);
    if (id === undefined || !pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (this.options.logFile) {
      appendFileSync(this.options.logFile, JSON.stringify({ request: pending.request, response }) + "\n");
    }
    pending.resolve(response);
  }

  private stop(reason: string): void {
    if (this.stopped) return;
    const tail = this.stderrTail.length > 0 ? `; last stderr: ${this.stderrTail.join(" | ")}` : "";
    this.stopped = new EngineStopped(reason + tail);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.stopped);
    }
    this.pending.clear();
  }
}
