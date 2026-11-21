// The Glass Table page, part 1 (AGT-142, design §5.2): the story column, the dock in its forms,
// the turn pill and the roll stage. Every line it draws comes from the reducer, which lays it out
// with the terminal's own `eventLines`; its own labels are the terminal seat's words (UI_WORDS), so
// the page says nothing the terminal does not. It talks to nothing but the seat wire.
import { createElement as h, useEffect, useRef, useState, type ReactNode } from "react";
import { promptHint, readLine } from "../ui/input.ts";
import { UI_WORDS, type UiWords } from "../table/words.ts";
import type { PlayerIntent } from "../table/types.ts";
import { mount, type Die } from "./d20.ts";
import type { Dock, PageView, RollToken, StoryLine } from "./reduce.ts";

export interface AppProps {
  view: PageView;
  /** Sends an answer to the open ask, or a command with none open. */
  send(intent: PlayerIntent): void;
  /** The roll stage has shown the human's roll. */
  settled(): void;
}

function ui(view: PageView): UiWords {
  return UI_WORDS[view.hello?.language ?? "en"];
}

function named(view: PageView, handle: string): string {
  return view.hello?.names?.[handle] ?? handle.charAt(0).toUpperCase() + handle.slice(1);
}

export function App({ view, send, settled }: AppProps): ReactNode {
  if (view.refused) return h("main", { className: "refused", role: "alert" }, view.refused);
  if (!view.hello) return h("main", { className: "starting", "aria-busy": true });
  return h(
    "main",
    { className: "table", lang: view.hello.language },
    h(Header, { view }),
    h(Story, { view }),
    view.overlay ? h(Overlay, { key: `${view.overlay.title}-${view.story.length}`, overlay: view.overlay }) : null,
    h(DockView, { view, send }),
    view.stage ? h(Stage, { key: view.stage, roll: view.rolls[view.stage], settled }) : null,
  );
}

/** The title and the turn pill: whose turn it is in a fight, or nothing out of one. */
function Header({ view }: { view: PageView }): ReactNode {
  const s = view.situation?.situation;
  const words = ui(view).panel;
  const pill = s?.mode === "combat" ? [s.round !== undefined ? words.round(s.round) : undefined, s.turn === view.hello?.handle ? words.yourTurn : s.turn ? words.turnOf(named(view, s.turn)) : undefined].filter(Boolean).join(" · ") : undefined;
  return h(
    "header",
    { className: "top" },
    h("h1", null, view.hello?.title ?? ""),
    pill ? h("span", { className: `pill${s?.turn === view.hello?.handle ? " mine" : ""}`, role: "status", "data-test": "turn" }, pill) : null,
  );
}

function Story({ view }: { view: PageView }): ReactNode {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [view.story.length]);
  return h(
    "section",
    { className: "story", "aria-live": "polite", "aria-relevant": "additions" },
    view.story.map((line) => h(Row, { key: line.id, line, rolls: view.rolls })),
    view.preview ? h("p", { className: "row preview", "aria-hidden": true }, view.preview) : null,
    h("div", { ref: end }),
  );
}

function Row({ line, rolls }: { line: StoryLine; rolls: Record<string, RollToken> }): ReactNode {
  if (line.text === "") return h("div", { className: "gap" });
  return h(
    "p",
    { className: `row ${line.tone}${line.said ? " said" : ""}` },
    line.text.trimStart(),
    line.rolls.map((id) => (rolls[id] ? h(Token, { key: id, roll: rolls[id] }) : null)),
  );
}

/** A roll as a token: its total; the engine's line on hover and to a screen reader. */
function Token({ roll }: { roll: RollToken }): ReactNode {
  return h("span", { className: `token ${roll.outcome}`, title: roll.text, "aria-label": roll.text, "data-roll": roll.id }, String(roll.total));
}

/** A command's answer laid over the story, until the human closes it or the next answer. */
function Overlay({ overlay }: { overlay: NonNullable<PageView["overlay"]> }): ReactNode {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return h(
    "aside",
    { className: "overlay", role: "dialog", "aria-label": overlay.title },
    h("header", null, h("h2", null, overlay.title), h("button", { className: "close", onClick: () => setOpen(false), "aria-label": "×" }, "×")),
    h("pre", null, overlay.text),
  );
}

function DockView({ view, send }: { view: PageView; send(intent: PlayerIntent): void }): ReactNode {
  const words = ui(view);
  const dock = view.dock;
  const hint = view.ask && view.hello ? promptHint(view.ask.prompt, view.hello.handle, words, named(view, view.hello.handle)) : undefined;
  return h(
    "footer",
    { className: `dock ${dock.form}`, "data-form": dock.form },
    ...dockParts(view, dock, words, send),
    hint ? h("p", { className: "hint" }, hint) : null,
    dock.form !== "ended" && dock.form !== "waiting" ? h(Capsule, { key: "ask" in dock ? dock.ask : "none", view, send }) : null,
  );
}

function dockParts(view: PageView, dock: Dock, words: UiWords, send: (intent: PlayerIntent) => void): ReactNode[] {
  switch (dock.form) {
    case "waiting":
      return [h("p", { key: "wait", className: "waiting", role: "status" }, words.wait(dock.on, undefined))];
    case "ended":
      return [h("p", { key: "end", className: "ended" }, `${words.runOver}: ${dock.text}`)];
    case "reaction":
      return [
        dock.reaction ? h("p", { key: "summary", className: "summary" }, dock.reaction.summary) : null,
        h(
          "div",
          { key: "yn", className: "moves" },
          h("button", { onClick: () => send({ kind: "reaction", take: true }) }, words.yes),
          h("button", { onClick: () => send({ kind: "reaction", take: false }) }, words.no),
        ),
      ];
    case "answer":
      return [dock.question ? h("p", { key: "q", className: "question" }, dock.question) : null];
    case "paused":
      return [];
    case "moves":
    case "input":
      return [
        view.refusal ? h("p", { key: "refusal", className: "refusal", role: "alert" }, view.refusal) : null,
        ...view.spent.map((s) => h("p", { key: `spent-${s.option}`, className: "spent" }, `${s.name}: ${s.message}`)),
        dock.options ? h(Moves, { key: "moves", lines: dock.options.lines, title: dock.options.title, send }) : null,
      ];
  }
}

/** The numbered list as buttons: a press sends the number, as typing it does. */
function Moves({ lines, title, send }: { lines: string[]; title?: string; send(intent: PlayerIntent): void }): ReactNode {
  return h(
    "div",
    { className: "moves", role: "group", "aria-label": title },
    title ? h("p", { className: "title" }, title) : null,
    lines.map((line) => {
      const n = /^(\d+)\.\s/.exec(line);
      return n ? h("button", { key: line, onClick: () => send({ kind: "option", number: Number(n[1]) }) }, line) : h("p", { key: line, className: "line" }, line);
    }),
  );
}

/** The input capsule: what the human types, read as the terminal reads it. */
function Capsule({ view, send }: { view: PageView; send(intent: PlayerIntent): void }): ReactNode {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string>();
  const words = ui(view);
  const submit = () => {
    const typed = readLine(draft, view.ask?.prompt, words);
    if (typed.kind === "empty") return;
    if (typed.kind === "error") return setNotice(typed.text);
    if (typed.kind !== "intent") return setNotice(undefined);
    setDraft("");
    setNotice(undefined);
    send(typed.intent);
  };
  return h(
    "form",
    {
      className: "capsule",
      onSubmit: (e: { preventDefault(): void }) => {
        e.preventDefault();
        submit();
      },
    },
    h("input", { value: draft, onChange: (e: { target: { value: string } }) => setDraft(e.target.value), autoFocus: true, "aria-label": promptHint(view.ask?.prompt ?? { kind: "explore" }, view.hello?.handle ?? "", words) }),
    h("button", { type: "submit", "aria-label": "↵" }, "↵"),
    notice ? h("p", { className: "notice" }, notice) : null,
  );
}

declare global {
  interface Window {
    /** What the replay test reads: each roll the stage landed, with the faces the dice show. */
    __nat20?: { landed: Array<{ roll: string; faces: number[]; gl: boolean }>; done: boolean };
  }
}

/** The roll stage: one d20 per die the engine rolled, landing on the engine's faces only. */
function Stage({ roll, settled }: { roll: RollToken; settled(): void }): ReactNode {
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  useEffect(() => {
    let gone = false;
    const css = getComputedStyle(document.documentElement);
    const rgb = (name: string, fallback: [number, number, number]): [number, number, number] => {
      const m = /#([0-9a-f]{6})/i.exec(css.getPropertyValue(name));
      return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as [number, number, number] : fallback;
    };
    const colours = { ink: rgb("--die-ink", [0.067, 0.067, 0.067]), paper: rgb("--die-paper", [1, 1, 1]) };
    const dice = canvases.current.map((c) => (c ? mount(c, colours) : undefined));
    void Promise.all(dice.map((die, i) => die?.rollTo(roll.d20[i]))).then(() => {
      if (gone) return;
      const faces = dice.map((die: Die | undefined, i) => die?.face() ?? roll.d20[i]);
      window.__nat20?.landed.push({ roll: roll.id, faces, gl: dice.every((d) => d !== undefined) });
      setTimeout(() => !gone && settled(), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700);
    });
    return () => {
      gone = true;
    };
  }, [roll.id]);
  return h(
    "div",
    { className: "stage", role: "status", "aria-label": roll.text, "data-roll": roll.id },
    h(
      "div",
      { className: "dice" },
      roll.d20.map((face, i) => h("canvas", { key: i, ref: (c: HTMLCanvasElement | null) => void (canvases.current[i] = c), width: 360, height: 360, "data-face": face, "aria-hidden": true })),
    ),
    h("p", { className: "line" }, roll.text),
  );
}
