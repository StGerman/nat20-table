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
  /** Where the run's files go: `engine-log.jsonl`, `engine-stderr.log`, `session-log.jsonl`. */
  runDir: string;
  /** The dice seed; the engine picks one when omitted and logs it. */
  seed?: number;
  /** A pack's own pregens; the repository's `pregens/` when omitted. */
  pregens?: string;
  binary?: string;
  timeoutMs?: number;
}

/** The whole session log as the DM sees it, one event per line: what the audit checks (step 6). */
export const SESSION_LOG = "session-log.jsonl";

export class GameEngine {
  private readonly client: EngineClient;
  /** Where the run's files go. */
  readonly runDir: string;
  /** Where each reader got to in the log. A reader is a viewer, or a viewer and a purpose. */
  private readonly cursors = new Map<string, number>();
  /** The session log's length after the last response. */
  logHead = 0;
  /** The seed the session runs on, as the engine logged it. */
  seed = 0;
  /** Every roll id the engine has reported, so a citation of one it hasn't can be refused. */
  readonly rolls = new Set<string>();
  /** Where a reader that hasn't read yet starts: 0, or the log head when `skipAll` was called. */
  private origin = 0;

  private constructor(client: EngineClient, runDir: string) {
    this.client = client;
    this.runDir = runDir;
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
    const engine = new GameEngine(client, start.runDir);
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
    const listed = response.result?.cmd === "events" ? response.result.events : [];
    for (const event of [...response.events, ...listed]) if (event.kind === "roll") this.rolls.add(event.roll.id);
    return response;
  }

  /**
   * Events `viewer` may see that `reader` hasn't been given yet, projected for `viewer`. One viewer
   * can have several readers: the DM's briefings and the DM's transcript lines advance separately.
   */
  async newEvents(viewer: Viewer, reader: string = viewer): Promise<Event[]> {
    const since = this.cursors.get(reader) ?? this.origin;
    const response = await this.request(viewer, { cmd: "events", since });
    if (!response.ok || response.result?.cmd !== "events") {
      throw new Error(`events for ${viewer} failed: ${response.error?.message}`);
    }
    this.cursors.set(reader, response.result.next);
    return response.result.events;
  }

  /** Marks everything logged so far as given to `reader` (a seat that joins late). */
  skipTo(reader: string, seq: number): void {
    this.cursors.set(reader, seq);
  }

  /**
   * Marks everything logged so far as given to every reader: what a run set up before play (the
   * scenes before the one it starts at) is nobody's news.
   */
  skipAll(): void {
    this.origin = this.logHead;
    this.cursors.clear();
  }

  /**
   * Writes the whole session log as `viewer` sees it, one event per line: the DM's view to
   * `session-log.jsonl` by default, which the transcript audit checks the run against (spec step 6).
   */
  async writeLog(viewer: Viewer = "dm", file: string = path.join(this.runDir, SESSION_LOG)): Promise<void> {
    const response = await this.request(viewer, { cmd: "events", since: 0 });
    if (!response.ok || response.result?.cmd !== "events") throw new Error(`events for ${viewer} failed`);
    writeFileSync(file, response.result.events.map((event) => JSON.stringify(event) + "\n").join(""));
  }

  close(): void {
    this.client.close();
  }
}
