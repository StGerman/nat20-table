// The page's entry (AGT-142): it reads its host from the address and keeps one view through the
// reducer. `?port=…&token=…` is a live table over the seat wire on 127.0.0.1 (the shell opens the
// page so); `?replay=<url of a seat-wire.jsonl>` plays a recorded run, which is how it is tested.
// The wire's version and hash are written in at build time (build.ts), so a page refuses a host
// built from another wire.
import { createElement as h, useEffect, useReducer, useRef } from "react";
import { createRoot } from "react-dom/client";
import { HostMessageSchema, type HostMessage, type PageMessage } from "../seat-wire/messages.ts";
import type { PlayerIntent } from "../table/types.ts";
import { App } from "./app.ts";
import { answered, EMPTY, reduce, settle, type Built, type PageView } from "./reduce.ts";

declare const __WIRE__: Built;

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

function Page(): ReturnType<typeof h> {
  const params = new URLSearchParams(location.search);
  const [view, dispatch] = useReducer(step, EMPTY);
  const socket = useRef<WebSocket | undefined>(undefined);
  const seq = useRef(0);
  const stage = useRef<string | undefined>(undefined);
  seq.current = view.seq;
  stage.current = view.stage;

  useEffect(() => {
    const replay = params.get("replay");
    window.__nat20 = { landed: [], done: false };
    if (replay) {
      let stopped = false;
      void (async () => {
        const messages = recorded(await (await fetch(replay)).text());
        dispatch({ type: "host", message: { type: "hello", ...__WIRE__, run: replay, language: params.get("language") === "ru" ? "ru" : "en", handle: params.get("handle") ?? "bren", title: params.get("title") ?? "" } });
        const to = Number(params.get("to") ?? Infinity);
        for (const message of messages) {
          if (stopped || (message.type === "event" && message.seq > to)) break;
          dispatch({ type: "host", message });
          // The stage holds the story while the die lands, as it does at the table.
          do await new Promise((r) => requestAnimationFrame(r));
          while (stage.current !== undefined && !stopped);
        }
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

  const send = (intent: PlayerIntent) => {
    const ask = view.ask;
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (ask) {
      ws.send(JSON.stringify({ type: "intent", id: ask.id, intent } satisfies PageMessage));
      dispatch({ type: "answered" });
    } else if (intent.kind === "command" && (intent.name === "pause" || intent.name === "quit")) {
      ws.send(JSON.stringify({ type: "command", name: intent.name } satisfies PageMessage));
    }
  };
  return h(App, { view, send, settled: () => dispatch({ type: "settled" }) });
}

createRoot(document.getElementById("page")!).render(h(Page));
