// The game loop's handle on the engine (M6 step 3, TASKS.md AGT-2). Only the orchestrator holds
// one (spec §3.1); agents and the UI never see it. It starts one engine process per session with a
// scenario pack as its data directory (API-18), writes the run's engine log, and keeps an event
// cursor per viewer so each seat is shown each event once.
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EngineClient, type Command, type Event, type Response, type Viewer } from "@nat20-table/engine-client";

/** The repository root. */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The engine binary: `$NAT20_API_SERVER`, else the release build, else the debug build. */
export function engineBinary(): string {
  if (process.env.NAT20_API_SERVER) return process.env.NAT20_API_SERVER;
  const release = path.join(REPO, "target/release/nat20-api-server");
  return existsSync(release) ? release : path.join(REPO, "target/debug/nat20-api-server");
}

export interface EngineStart {
  /** The scenario pack: its `scenes/` are the engine's scenes. */
  pack: string;
  /** Where the run's files go: `engine-log.jsonl`, `engine-stderr.log`. */
  runDir: string;
  /** The dice seed; the engine picks one when omitted and logs it. */
  seed?: number;
  /** A pack's own pregens; the repository's `pregens/` when omitted. */
  pregens?: string;
  binary?: string;
  timeoutMs?: number;
}

export class GameEngine {
  private readonly client: EngineClient;
  private readonly cursors = new Map<Viewer, number>();
  /** The session log's length after the last response. */
  logHead = 0;
  /** The seed the session runs on, as the engine logged it. */
  seed = 0;

  private constructor(client: EngineClient) {
    this.client = client;
  }

  /** Starts the engine on a pack and opens a session. */
  static async start(start: EngineStart): Promise<GameEngine> {
    const env: Record<string, string> = { NAT20_DATA_DIR: path.resolve(start.pack) };
    if (start.pregens) env.NAT20_PREGENS_DIR = path.resolve(start.pregens);
    const client = await EngineClient.start(start.binary ?? engineBinary(), {
      env,
      logFile: path.join(start.runDir, "engine-log.jsonl"),
      stderrFile: path.join(start.runDir, "engine-stderr.log"),
      timeoutMs: start.timeoutMs,
    });
    const engine = new GameEngine(client);
    const session = await engine.request("dm", { cmd: "new_session", seed: start.seed });
    if (!session.ok || session.result?.cmd !== "new_session") {
      client.close();
      throw new Error(`the engine refused a new session: ${session.error?.message}`);
    }
    engine.seed = session.result.seed;
    return engine;
  }

  /** Sends one command as `viewer`. Every caller binds the viewer; nothing here chooses it. */
  async request(viewer: Viewer, command: Command): Promise<Response> {
    const response = await this.client.request(viewer, command);
    this.logHead = response.log_head;
    return response;
  }

  /** Events `viewer` may see that it hasn't been shown yet, projected for it. */
  async newEvents(viewer: Viewer): Promise<Event[]> {
    const since = this.cursors.get(viewer) ?? 0;
    const response = await this.request(viewer, { cmd: "events", since });
    if (!response.ok || response.result?.cmd !== "events") {
      throw new Error(`events for ${viewer} failed: ${response.error?.message}`);
    }
    this.cursors.set(viewer, response.result.next);
    return response.result.events;
  }

  /** Marks everything logged so far as shown to `viewer` (a seat that joins late). */
  skipTo(viewer: Viewer, seq: number): void {
    this.cursors.set(viewer, seq);
  }

  /** Writes the whole session log as `viewer` sees it, for the audit (spec step 6). */
  async writeLog(viewer: Viewer, file: string): Promise<void> {
    const response = await this.request(viewer, { cmd: "events", since: 0 });
    if (!response.ok || response.result?.cmd !== "events") throw new Error(`events for ${viewer} failed`);
    writeFileSync(file, JSON.stringify(response.result.events, null, 2) + "\n");
  }

  close(): void {
    this.client.close();
  }
}
