// The window's seat (AGT-141, Glass Table design §4, decision 0090): a third `Seat` beside `InkSeat`
// and `ScriptedSeat`. The loop does not learn that a window exists. Every event is numbered and
// appended to `seat-wire.jsonl` in the run folder before it is sent, so a reload or a dropped socket
// replays from `seq`, and a recorded run is the page's test fixture. `seat.jsonl` is still written,
// by a headless terminal seat fed the same events, so the language scan and Vera read an app run as
// they read a terminal run.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { Handle } from "@nat20-table/engine-client";
import type { Language } from "../agents/language.ts";
import type { SeatNames } from "../table/seat-lines.ts";
import type { HumanPrompt, PlayerIntent, Seat, SuggestUpdate, TableEvent } from "../table/types.ts";
import { InkSeat } from "../ui/ink-seat.ts";
import { HostMessageSchema, PageMessageSchema, WIRE_HASH, WIRE_VERSION, type HostMessage } from "./schema.ts";

/** The file of every event the window was sent, one `{seq, seat, event}` per line. */
export const SEAT_WIRE_JSONL = "seat-wire.jsonl";

/** The origins a window may connect from: the Tauri shell's page (design §3). A client with no origin is a local program, as in the tests. */
export const SHELL_ORIGINS = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];

export interface WebSeatOptions {
  /** The run folder: `seat-wire.jsonl` goes here. */
  runDir: string;
  /** The run's id, for `hello`. */
  run: string;
  language?: Language;
  names?: SeatNames;
  /** The adventure's title, in the run's language. */
  title?: string;
  /** Each thing the terminal seat would draw, for `seat.jsonl` (as `InkSeatOptions.record`). */
  record?: (drawn: { kind: string; text: string }) => void;
  /** The window asked to stop (a `quit` with no ask open): the run command ends the table between decisions. */
  onQuit?: () => void;
  /** The port to listen on; 0 (default) takes a free one. */
  port?: number;
  /** Origins allowed besides none; default the shell's. */
  origins?: readonly string[];
}

interface OpenAsk {
  id: string;
  prompt: HumanPrompt;
  resolve: (intent: PlayerIntent) => void;
}

export class WebSeat implements Seat {
  readonly handle: Handle;
  /** The per-launch token: a client that does not name it is refused. */
  readonly token = randomBytes(16).toString("hex");
  private readonly options: WebSeatOptions;
  private readonly ink: InkSeat;
  private readonly file: string;
  private readonly events: Array<{ seq: number; event: TableEvent }> = [];
  private open: OpenAsk | undefined;
  private asks = 0;
  private server: WebSocketServer | undefined;
  private client: WebSocket | undefined;
  /** `pause` commands the window sent with no ask open, for the loop's next look (`takeCommands`). */
  private readonly commands: Array<"pause"> = [];
  /** The state of the optional seat methods, sent again on resume. */
  private last: { busy?: string; preview?: string; answering?: boolean } = {};

  constructor(handle: Handle, options: WebSeatOptions) {
    this.handle = handle;
    this.options = options;
    this.file = path.join(options.runDir, SEAT_WIRE_JSONL);
    this.ink = new InkSeat(handle, {
      animate: false,
      ...(options.language ? { language: options.language } : {}),
      ...(options.names ? { names: options.names } : {}),
      ...(options.title ? { title: options.title } : {}),
      ...(options.record ? { record: options.record } : {}),
    });
  }

  /** Starts listening on 127.0.0.1 and gives the port and the token the shell opens the page with. */
  listen(): Promise<{ port: number; token: string }> {
    const origins = this.options.origins ?? SHELL_ORIGINS;
    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: this.options.port ?? 0,
      maxPayload: 64 * 1024,
      verifyClient: ({ req, origin }: { req: IncomingMessage; origin: string }) => {
        const token = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("token") ?? "";
        const allowed = !origin || origins.includes(origin);
        return allowed && sameToken(token, this.token) && this.client === undefined;
      },
    });
    this.server = server;
    server.on("connection", (ws) => this.connected(ws));
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.once("listening", () => {
        const address = server.address();
        resolve({ port: typeof address === "object" && address ? address.port : 0, token: this.token });
      });
    });
  }

  /** Stops listening and closes the window's socket. An open ask stays unanswered. */
  close(): Promise<void> {
    this.client?.close();
    this.ink.stop();
    const server = this.server;
    this.server = undefined;
    return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
  }

  // --- Seat -------------------------------------------------------------------------------------

  show(event: TableEvent): void {
    const seq = this.events.length + 1;
    this.events.push({ seq, event });
    appendFileSync(this.file, JSON.stringify({ seq, seat: this.handle, event }) + "\n");
    this.ink.show(event);
    this.send({ type: "event", seq, event });
  }

  ask(prompt: HumanPrompt): Promise<PlayerIntent> {
    // The terminal seat releases held lines for its record when the human is asked.
    void this.ink.ask(prompt);
    const id = `a${++this.asks}`;
    return new Promise((resolve) => {
      this.open = { id, prompt, resolve };
      this.send({ type: "ask", id, prompt });
    });
  }

  busy(on: string | undefined): void {
    this.last.busy = on;
    this.send({ type: "busy", ...(on !== undefined ? { on } : {}) });
  }

  preview(text: string | undefined): void {
    this.last.preview = text;
    this.ink.preview(text);
    this.send({ type: "preview", ...(text !== undefined ? { text } : {}) });
  }

  unnarrated(): void {
    this.ink.unnarrated();
    this.send({ type: "unnarrated" });
  }

  answering(on: boolean): void {
    this.last.answering = on;
    this.ink.answering(on);
    this.send({ type: "answering", on });
  }

  suggest(update: SuggestUpdate): void {
    this.send(update.kind === "rows" ? { type: "suggest", state: "rows", rows: update.rows } : { type: "suggest", state: update.kind });
  }

  /** The `pause` commands the window sent with no ask open, taken once (the loop reads them between wakes). */
  takeCommands(): Array<"pause"> {
    return this.commands.splice(0);
  }

  // --- The socket -------------------------------------------------------------------------------

  private connected(ws: WebSocket): void {
    this.client = ws;
    this.send({ type: "hello", wire: WIRE_VERSION, hash: WIRE_HASH, run: this.options.run, language: this.options.language ?? "en", handle: this.handle, title: this.options.title ?? "" });
    ws.on("message", (data) => this.received(String(data)));
    ws.on("close", () => {
      if (this.client === ws) this.client = undefined;
    });
  }

  private received(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return this.send({ type: "refused", why: "not JSON" });
    }
    const message = PageMessageSchema.safeParse(parsed);
    if (!message.success) return this.send({ type: "refused", why: "not a seat-wire message" });
    const m = message.data;
    switch (m.type) {
      case "resume":
        for (const e of this.events) if (e.seq > m.seq) this.send({ type: "event", seq: e.seq, event: e.event });
        if (this.last.busy !== undefined) this.send({ type: "busy", on: this.last.busy });
        if (this.last.preview !== undefined) this.send({ type: "preview", text: this.last.preview });
        if (this.open) this.send({ type: "ask", id: this.open.id, prompt: this.open.prompt });
        return;
      case "intent": {
        const open = this.open;
        if (!open || open.id !== m.id) return this.send({ type: "refused", why: `no open ask ${m.id}` });
        this.open = undefined;
        open.resolve(m.intent as PlayerIntent);
        return;
      }
      case "command":
        if (m.name === "quit") {
          this.options.onQuit?.();
          // An open ask ends as the terminal's Ctrl+C does: the loop reads quit there.
          const open = this.open;
          this.open = undefined;
          open?.resolve({ kind: "command", name: "quit" });
        } else if (this.open) {
          const open = this.open;
          this.open = undefined;
          open.resolve({ kind: "command", name: "pause" });
        } else this.commands.push("pause");
        return;
    }
  }

  private send(message: HostMessage): void {
    const client = this.client;
    if (!client || client.readyState !== client.OPEN) return;
    // The host checks its own messages too: a message the page can't read is a bug here.
    HostMessageSchema.parse(message);
    client.send(JSON.stringify(message));
  }
}

function sameToken(given: string, token: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
