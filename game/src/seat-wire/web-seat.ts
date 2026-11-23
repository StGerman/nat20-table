// The window's seat (AGT-141, Glass Table design §4, decision 0090): a third `Seat` beside `InkSeat`
// and `ScriptedSeat`. The loop does not learn that a window exists. Every event is numbered and
// appended to `seat-wire.jsonl` in the run folder before it is sent, so a reload or a dropped socket
// replays from `seq`, and a recorded run is the page's test fixture. `seat.jsonl` is still written,
// by a headless terminal seat fed the same events, so the language scan and Vera read an app run as
// they read a terminal run.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { Handle } from "@nat20-table/engine-client";
import type { Language } from "../agents/language.ts";
import type { SeatNames } from "../table/seat-lines.ts";
import type { HumanPrompt, PlayerIntent, Seat, SuggestUpdate, TableEvent } from "../table/types.ts";
import { UI_WORDS } from "../table/words.ts";
import { InkSeat } from "../ui/ink-seat.ts";
import { CLOSE_REPLACED, HostMessageSchema, PageMessageSchema, WIRE_HASH, WIRE_VERSION, type HostMessage } from "./schema.ts";

/** The file of everything the window was sent: one `{seq, seat, event}` per event, one `{seat, message}` per other message (an ask, a preview, suggestions), in order. A resend on resume is not written again. */
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
  /** The party's handles: `hello` names each as the terminal seat does. */
  party?: readonly Handle[];
  /** Each thing the terminal seat would draw, for `seat.jsonl` (as `InkSeatOptions.record`). */
  record?: (drawn: { kind: string; text: string }) => void;
  /** The window asked to stop (a `quit` with no ask open): the run command ends the table between decisions. */
  onQuit?: () => void;
  /** The port to listen on; 0 (default) takes a free one. */
  port?: number;
  /** Origins allowed besides none; default the shell's. */
  origins?: readonly string[];
  /**
   * The address to listen on; default 127.0.0.1, this machine only. `0.0.0.0` lets a phone on the
   * same network sit at the table (decision 0093). The token is then the only guard and it crosses
   * that network unencrypted, so a caller that widens this allows no origin at all (`origins: []`).
   */
  host?: string;
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
  private last: { busy?: string; preview?: string; answering?: boolean; suggest?: HostMessage } = {};
  /** The window asked to stop with no ask open: the next ask answers quit at once, as the terminal's Ctrl+C does. */
  private quitting = false;

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

  /** Starts listening (on 127.0.0.1 unless `host` says otherwise) and gives the port and the token a window connects with. */
  listen(): Promise<{ port: number; token: string }> {
    const origins = this.options.origins ?? SHELL_ORIGINS;
    const server = new WebSocketServer({
      host: this.options.host ?? "127.0.0.1",
      port: this.options.port ?? 0,
      maxPayload: 64 * 1024,
      verifyClient: ({ req, origin }: { req: IncomingMessage; origin: string }) => {
        const token = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("token") ?? "";
        const allowed = !origin || origins.includes(origin);
        return allowed && sameToken(token, this.token);
      },
    });
    this.server = server;
    server.on("connection", (ws) => this.connected(ws));
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.once("listening", () => {
        // After startup a server error is logged, never thrown: the table goes on without a window.
        server.off("error", reject);
        server.on("error", (error) => console.error(`seat wire: ${error.message}`));
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
    if (this.quitting) return Promise.resolve({ kind: "command", name: "quit" });
    const id = `a${++this.asks}`;
    this.last.suggest = undefined;
    return new Promise((resolve) => {
      this.open = { id, prompt, resolve };
      this.emit({ type: "ask", id, prompt });
    });
  }

  busy(on: string | undefined): void {
    this.last.busy = on;
    this.emit({ type: "busy", ...(on !== undefined ? { on } : {}) });
  }

  preview(text: string | undefined): void {
    this.last.preview = text;
    this.ink.preview(text);
    this.emit({ type: "preview", ...(text !== undefined ? { text } : {}) });
  }

  unnarrated(): void {
    this.ink.unnarrated();
    this.emit({ type: "unnarrated" });
  }

  answering(on: boolean): void {
    this.last.answering = on;
    this.ink.answering(on);
    this.emit({ type: "answering", on });
  }

  suggest(update: SuggestUpdate): void {
    const message: HostMessage = update.kind === "rows" ? { type: "suggest", state: "rows", rows: update.rows } : { type: "suggest", state: update.kind };
    this.last.suggest = message;
    this.emit(message);
  }

  /**
   * The host stops the table (Ctrl+C, the time limit): an open ask ends as quit, as at the terminal,
   * and a later one answers quit at once; the window is told why while it waits.
   */
  stopAsking(why: string): void {
    this.ink.stopAsking(why);
    this.quitting = true;
    const open = this.open;
    this.open = undefined;
    this.busy(UI_WORDS[this.options.language ?? "en"].stoppingFor(why));
    open?.resolve({ kind: "command", name: "quit" });
  }

  /** The `pause` commands the window sent with no ask open, taken once (the loop reads them between wakes). */
  takeCommands(): Array<"pause"> {
    return this.commands.splice(0);
  }

  // --- The socket -------------------------------------------------------------------------------

  private connected(ws: WebSocket): void {
    // A window with the token replaces the one before it. The old one is told so by its close code,
    // so it stops asking for the seat: two live windows would otherwise take it from each other
    // every second. A socket left half open by a sleeping laptop never answers a close, so it is
    // cut after a moment.
    const before = this.client;
    if (before && before !== ws) {
      before.close(CLOSE_REPLACED, "replaced");
      setTimeout(() => before.terminate(), 1000).unref();
    }
    this.client = ws;
    this.send({ type: "hello", wire: WIRE_VERSION, hash: WIRE_HASH, run: this.options.run, language: this.options.language ?? "en", handle: this.handle, title: this.options.title ?? "", ...(this.options.party ? { names: Object.fromEntries(this.options.party.map((h) => [h, this.ink.named(h)])) } : {}) });
    // A window that was replaced may still deliver a frame before it closes: only the current one is heard.
    ws.on("message", (data) => {
      if (this.client === ws) this.received(String(data));
    });
    ws.on("error", (error) => {
      // An oversized or broken frame drops this window, never the table: the page resumes from its seq.
      console.error(`seat wire: ${error.message}`);
      ws.terminate();
    });
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
        if (this.last.answering) this.send({ type: "answering", on: true });
        if (this.open) this.send({ type: "ask", id: this.open.id, prompt: this.open.prompt });
        if (this.open && this.last.suggest) this.send(this.last.suggest);
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
          if (open) open.resolve({ kind: "command", name: "quit" });
          else this.quitting = true;
        } else if (this.open) {
          const open = this.open;
          this.open = undefined;
          open.resolve({ kind: "command", name: "pause" });
        } else this.commands.push("pause");
        return;
    }
  }

  /** Writes a message other than an event to `seat-wire.jsonl` before it is sent, so the audit scans everything the window saw. */
  private emit(message: HostMessage): void {
    appendFileSync(this.file, JSON.stringify({ seat: this.handle, message }) + "\n");
    this.send(message);
  }

  private send(message: HostMessage): void {
    const client = this.client;
    if (!client || client.readyState !== client.OPEN) return;
    // The host checks its own messages too: a message the page can't read is a bug here.
    HostMessageSchema.parse(message);
    client.send(JSON.stringify(message));
  }
}

/** This machine's IPv4 addresses on the networks it is on, for the link a phone connects with. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((rows) => rows ?? [])
    .filter((row) => row.family === "IPv4" && !row.internal)
    .map((row) => row.address);
}

function sameToken(given: string, token: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
