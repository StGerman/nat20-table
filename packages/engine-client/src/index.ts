// Thin client for nat20-api-server. Wire types come only from ./generated (CLAUDE.md Rule 1).
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { SCHEMA_SHA256, type Command, type Request, type Response, type Viewer } from "./generated/api.ts";

export * from "./generated/api.ts";

/**
 * Wraps a command in the request envelope. The envelope fields are set after the command's, so a
 * command carrying its own `viewer`, `v` or `id` (say, tool input from a player agent) cannot
 * override the viewer its caller bound.
 */
export function envelope(viewer: Viewer, command: Command, id: string): Request {
  return { ...command, v: 1, id, viewer };
}

export class EngineClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, (response: Response) => void>();
  private nextId = 1;

  private constructor(binary: string) {
    this.child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      const response = JSON.parse(line) as Response;
      const id = response.id ?? undefined;
      const resolve = id === undefined ? undefined : this.pending.get(id);
      if (id !== undefined && resolve) {
        this.pending.delete(id);
        resolve(response);
      }
    });
  }

  /** Spawns the engine and checks it serves the schema these types were generated from. */
  static async start(binary: string): Promise<EngineClient> {
    const client = new EngineClient(binary);
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
   */
  request(viewer: Viewer, command: Command, id = `c-${this.nextId++}`): Promise<Response> {
    const request = envelope(viewer, command, id);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.child.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  close(): void {
    this.child.stdin.end();
  }
}
