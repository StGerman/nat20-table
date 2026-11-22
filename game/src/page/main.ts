// The page's entry (AGT-142): it reads its host from the address and keeps one view through the
// reducer. `?port=…&token=…` is a live table over the seat wire on 127.0.0.1 (the shell opens the
// page so); `?replay=<url of a seat-wire.jsonl>` plays a recorded run, which is how it is tested.
// The wire's version and hash are written in at build time (build.ts), so a page refuses a host
// built from another wire.
import { createElement as h, useEffect, useReducer, useRef } from "react";
import { createRoot } from "react-dom/client";
import { HostMessageSchema, type HostMessage, type PageMessage } from "../seat-wire/messages.ts";
import type { PlayerIntent } from "../table/types.ts";
import { readLine } from "../ui/input.ts";
import { App, type Shell } from "./app.ts";
import { chromeOf, ui } from "./chrome.ts";
import { answered, EMPTY, reduce, settle, type Built, type PageView } from "./reduce.ts";

declare const __WIRE__: Built;

/** What a native shell does at the page (hybrid shell spike): a pressed move, a typed line, a command. */
type ShellAct = { kind: "option"; n: number } | { kind: "typed"; text: string } | { kind: "reaction"; take: boolean } | { kind: "command"; name: "pause" | "quit" | "sheet" };

declare global {
  interface Window {
    /** The native shell's way in: a host message as it came off the socket, and what the human did on a control. */
    __nat20Shell?: { host(line: string): void; act(a: ShellAct): { ok: boolean; notice?: string }; under(on: boolean): void };
    /** What the page told the shell, kept where there is no shell to tell (the page's tests). */
    __nat20Posted?: unknown[];
    webkit?: { messageHandlers?: { shell?: { postMessage(message: unknown): void } } };
  }
}

/** Tells the native shell; with none (a browser, a test) the message is kept on the window. */
function post(message: unknown): void {
  const shell = window.webkit?.messageHandlers?.shell;
  if (shell) shell.postMessage(message);
  else (window.__nat20Posted ??= []).push(message);
}

type Action = { type: "host"; message: HostMessage } | { type: "settled" } | { type: "answered" };

function step(view: PageView, action: Action): PageView {
  switch (action.type) {
    case "host":
      return reduce(view, action.message, __WIRE__);
    case "settled":
      return settle(view);
    case "answered":
      return answered(view);
  }
}

/** A recorded wire's lines, as the host sent them: events numbered, the rest as messages. */
function recorded(text: string): HostMessage[] {
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as { seq?: number; event?: unknown; message?: unknown })
    .map((r) => HostMessageSchema.parse(r.event !== undefined ? { type: "event", seq: r.seq, event: r.event } : r.message));
}

/** `names=bren:Брен,torva:Торва`: the names a live host sends at `hello`, for a replay that should read as the table does. */
function namesParam(raw: string | null): { names?: Record<string, string> } {
  if (!raw) return {};
  return { names: Object.fromEntries(raw.split(",").map((pair) => pair.split(":")).filter((p) => p.length === 2 && p[0] && p[1])) };
}

function Page(): ReturnType<typeof h> {
  const params = new URLSearchParams(location.search);
  const [view, dispatch] = useReducer(step, EMPTY);
  const socket = useRef<WebSocket | undefined>(undefined);
  const seq = useRef(0);
  const stage = useRef<string | undefined>(undefined);
  seq.current = view.seq;
  stage.current = view.stage;
  // Inside a native shell (`shell=native`) the page opens no socket and draws no control: the shell
  // feeds it the host's lines and is told what its controls show after each.
  const native = params.get("shell") === "native";
  const show = (["where", "sheet", "people"].find((x) => x === params.get("show")) ?? "story") as Shell["show"];
  const now = useRef(view);
  now.current = view;
  const told = useRef("");
  useEffect(() => {
    if (!native || !view.hello) return;
    const chrome = JSON.stringify(chromeOf(view));
    if (chrome === told.current) return;
    told.current = chrome;
    post({ type: "chrome", json: chrome });
  }, [view]);

  useEffect(() => {
    const replay = params.get("replay");
    window.__nat20 = { landed: [], done: false };
    if (replay) {
      let stopped = false;
      void (async () => {
        const messages = recorded(await (await fetch(replay)).text());
        dispatch({ type: "host", message: { type: "hello", ...__WIRE__, run: replay, language: params.get("language") === "ru" ? "ru" : "en", handle: params.get("handle") ?? "bren", title: params.get("title") ?? "", ...namesParam(params.get("names")) } });
        const to = Number(params.get("to") ?? Infinity);
        let unpainted = 0;
        for (const message of messages) {
          if (stopped || (message.type === "event" && message.seq > to)) break;
          dispatch({ type: "host", message });
          // The window paints after the human's own roll, so its die takes the stage, and every few
          // messages between; a frame per message made a long wire slower to replay than the run was.
          const e = message.type === "event" ? (message.event as { kind?: string; own?: boolean; roll?: string }) : undefined;
          if (!(e?.kind === "engine" && e.own && e.roll) && ++unpainted < 24) continue;
          unpainted = 0;
          // The stage holds the story while the die lands, as it does at the table.
          do await new Promise((r) => requestAnimationFrame(r));
          while (stage.current !== undefined && !stopped);
        }
        await new Promise((r) => requestAnimationFrame(r));
        if (window.__nat20) window.__nat20.done = true;
      })();
      return () => {
        stopped = true;
      };
    }
    const port = params.get("port");
    if (!port) return;
    let closed = false;
    const open = () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(params.get("token") ?? "")}`);
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "resume", seq: seq.current } satisfies PageMessage));
      ws.onmessage = (e) => {
        const parsed = HostMessageSchema.safeParse(JSON.parse(String(e.data)));
        if (parsed.success) dispatch({ type: "host", message: parsed.data });
      };
      // A dropped socket comes back and asks for what it missed.
      ws.onclose = () => !closed && setTimeout(open, 1000);
    };
    open();
    return () => {
      closed = true;
      socket.current?.close();
    };
  }, []);

  const send = (intent: PlayerIntent): boolean => {
    const ask = now.current.ask;
    if (native) {
      // The shell holds the socket: it is handed the message as the page would have sent it.
      if (ask) {
        post({ type: "send", message: { type: "intent", id: ask.id, intent } satisfies PageMessage });
        dispatch({ type: "answered" });
        return true;
      }
      if (intent.kind === "command" && (intent.name === "pause" || intent.name === "quit")) {
        post({ type: "send", message: { type: "command", name: intent.name } satisfies PageMessage });
        return true;
      }
      return false;
    }
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    if (ask) {
      ws.send(JSON.stringify({ type: "intent", id: ask.id, intent } satisfies PageMessage));
      dispatch({ type: "answered" });
      return true;
    }
    if (intent.kind === "command" && (intent.name === "pause" || intent.name === "quit")) {
      ws.send(JSON.stringify({ type: "command", name: intent.name } satisfies PageMessage));
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (!native) return;
    document.documentElement.classList.add("native");
    window.__nat20Shell = {
      host(line) {
        const parsed = HostMessageSchema.safeParse(JSON.parse(line));
        if (parsed.success) dispatch({ type: "host", message: parsed.data });
      },
      act(a) {
        const v = now.current;
        const words = ui(v);
        if (a.kind === "option") return { ok: send({ kind: "option", number: a.n }) };
        if (a.kind === "reaction") return { ok: send({ kind: "reaction", take: a.take }) };
        if (a.kind === "command") return { ok: send({ kind: "command", name: a.name }) };
        // A typed line is read as the terminal reads it, as the page's own capsule does.
        const typed = readLine(a.text, v.ask?.prompt, words);
        if (typed.kind === "empty") return { ok: false };
        if (typed.kind === "error") return { ok: false, notice: typed.text };
        if (typed.kind !== "intent") return { ok: true };
        return send(typed.intent) ? { ok: true } : { ok: false, notice: words.busy };
      },
      // The shell's sheet stands over the lower half of the story: the story's end stays above it.
      under(on) {
        document.documentElement.classList.toggle("under-sheet", on);
        if (on) scrollTo({ top: document.documentElement.scrollHeight });
      },
    };
    post({ type: "ready" });
  }, []);
  const shell: Shell | undefined = native ? { show, open: (what) => post({ type: "open", ...what }) } : undefined;
  return h(App, { view, send, settled: () => dispatch({ type: "settled" }), ...(shell ? { shell } : {}) });
}

createRoot(document.getElementById("page")!).render(h(Page));
