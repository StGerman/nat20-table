// The Glass Table page, part 1 (AGT-142, design §5.2): the story column, the dock in its forms,
// the turn pill and the roll stage. Every line it draws comes from the reducer, which lays it out
// with the terminal's own `eventLines`; its own labels are the terminal seat's words (UI_WORDS), so
// the page says nothing the terminal does not. It talks to nothing but the seat wire.
import { createElement as h, useEffect, useRef, useState, type ReactNode } from "react";
import { COMMAND_HELP, promptHint, readLine } from "../ui/input.ts";
import { UI_WORDS, type UiWords } from "../table/words.ts";
import type { PlayerIntent } from "../table/types.ts";
import { nameSpans, PEOPLE_WORDS, personCard, type Person, type PersonState } from "../ui/people.ts";
import { FINISHES, mount, type Die, type Finish } from "./d20.ts";
import type { CardView, Dock, PageView, RollToken, StoryLine } from "./reduce.ts";

export interface AppProps {
  view: PageView;
  /** Sends an answer to the open ask, or a command with none open; false when it could not go (no socket, or nothing takes it now). */
  send(intent: PlayerIntent): boolean;
  /** The roll stage has shown the human's roll. */
  settled(): void;
}

function ui(view: PageView): UiWords {
  return UI_WORDS[view.hello?.language ?? "en"];
}

function named(view: PageView, handle: string): string {
  return view.hello?.names?.[handle] ?? handle.charAt(0).toUpperCase() + handle.slice(1);
}

const FINISH_KEY = "nat20.die-finish";

/** The die finish the player chose last on this machine; chrome until they choose. Storage may be missing or refuse. */
function savedFinish(): Finish {
  try {
    const v = localStorage.getItem(FINISH_KEY);
    return FINISHES.find((f) => f === v) ?? "chrome";
  } catch {
    return "chrome";
  }
}

export function App({ view, send, settled }: AppProps): ReactNode {
  const [finish, setFinish] = useState<Finish>(savedFinish);
  /** The person card open, by id, and whether the people list is open. */
  const [person, setPerson] = useState<string>();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const choose = (next: Finish) => {
    setFinish(next);
    try {
      localStorage.setItem(FINISH_KEY, next);
    } catch {
      // The choice lasts for this window only.
    }
  };
  if (view.refused) return h("main", { className: "refused", role: "alert" }, view.refused);
  if (!view.hello) return h("main", { className: "starting", "aria-busy": true });
  return h(
    "main",
    { className: "table", lang: view.hello.language },
    h(Header, { view, finish, choose, peopleOpen, togglePeople: () => setPeopleOpen(!peopleOpen) }),
    h(Story, { view, open: setPerson }),
    peopleOpen ? h(PeopleList, { view, open: setPerson, close: () => setPeopleOpen(false) }) : null,
    person ? h(PersonCard, { key: person, view, id: person, close: () => setPerson(undefined) }) : null,
    view.overlay ? h(Overlay, { key: view.overlay.n, overlay: view.overlay }) : null,
    h(DockView, { view, send }),
    view.stage ? h(Stage, { key: view.stage, roll: view.rolls[view.stage], finish, settled }) : null,
  );
}

/** The title, the turn pill (whose turn it is in a fight, or nothing out of one) and the die finish switch. */
function Header({ view, finish, choose, peopleOpen, togglePeople }: { view: PageView; finish: Finish; choose(next: Finish): void; peopleOpen: boolean; togglePeople(): void }): ReactNode {
  const s = view.situation?.situation;
  const words = ui(view).panel;
  const pill = s?.mode === "combat" ? [s.round !== undefined ? words.round(s.round) : undefined, s.turn === view.hello?.handle ? words.yourTurn : s.turn ? words.turnOf(named(view, s.turn)) : undefined].filter(Boolean).join(" · ") : undefined;
  return h(
    "header",
    { className: "top" },
    h("h1", null, view.hello?.title ?? ""),
    pill ? h("span", { className: `pill${s?.turn === view.hello?.handle ? " mine" : ""}`, role: "status", "data-test": "turn" }, pill) : null,
    h("button", { type: "button", className: "tool", "data-test": "people", "aria-pressed": peopleOpen, onClick: togglePeople }, peopleWords(view).title),
    h(
      "button",
      { type: "button", className: "finish", "data-test": "finish", onClick: () => choose(FINISHES[(FINISHES.indexOf(finish) + 1) % FINISHES.length]) },
      ui(view).dieFinish[finish],
    ),
  );
}

function peopleWords(view: PageView) {
  return PEOPLE_WORDS[view.hello?.language ?? "en"];
}

/** A person's initial: the first letter of the name the seat shows (Stas, scope §9 question 5: initials for the first build). */
function initial(name: string): string {
  return /\p{L}/u.exec(name)?.[0]?.toLocaleUpperCase() ?? "?";
}

function Story({ view, open }: { view: PageView; open(id: string): void }): ReactNode {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [view.story.length]);
  return h(
    "section",
    { className: "story", "aria-live": "polite", "aria-relevant": "additions" },
    view.story.map((line) => h(Row, { key: line.id, line, rolls: view.rolls, people: view.people, open })),
    view.preview ? h("p", { className: "row preview", "aria-hidden": true }, view.preview) : null,
    h("div", { ref: end }),
  );
}

function Row({ line, rolls, people, open }: { line: StoryLine; rolls: Record<string, RollToken>; people: Person[]; open(id: string): void }): ReactNode {
  if (line.text === "") return h("div", { className: "gap" });
  // A listed form of someone the character knows is a name token: it opens their card (rule N1).
  const spans = line.said ? [{ text: line.text.trimStart() }] : nameSpans(line.text.trimStart(), people);
  return h(
    "p",
    { className: `row ${line.tone}${line.said ? " said" : ""}` },
    ...spans.map((span, i) => (span.person ? h("button", { key: i, type: "button", className: "name", "data-person": span.person, onClick: () => open(span.person!) }, span.text) : span.text)),
    line.rolls.map((id) => (rolls[id] ? h(Token, { key: id, roll: rolls[id] }) : null)),
  );
}

/** A roll as a token: its total; the engine's line on hover and to a screen reader. */
function Token({ roll }: { roll: RollToken }): ReactNode {
  return h("span", { className: `token ${roll.outcome}`, title: roll.text, "aria-label": roll.text, "data-roll": roll.id }, String(roll.total));
}

/** A command's answer laid over the story, until the human closes it or the next answer. */
function Overlay({ overlay, onClose }: { overlay: NonNullable<PageView["overlay"]>; onClose?(): void }): ReactNode {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => (onClose ? onClose() : setOpen(false));
  return h(
    "aside",
    { className: "overlay", role: "dialog", "aria-label": overlay.title },
    h("header", null, h("h2", null, overlay.title), h("button", { className: "close", onClick: close, "aria-label": "×" }, "×")),
    h("pre", null, overlay.text),
  );
}

function DockView({ view, send }: { view: PageView; send(intent: PlayerIntent): boolean }): ReactNode {
  const words = ui(view);
  const dock = view.dock;
  const hint = view.ask && view.hello ? promptHint(view.ask.prompt, view.hello.handle, words, named(view, view.hello.handle)) : undefined;
  return h(
    "footer",
    { className: `dock ${dock.form}`, "data-form": dock.form },
    view.card ? h(CardDock, { key: view.card.card.text, view, card: view.card, send }) : null,
    ...dockParts(view, dock, words, send),
    hint ? h("p", { className: "hint" }, hint) : null,
    dock.form !== "ended" ? h(Capsule, { key: "ask" in dock ? dock.ask : "none", view, send }) : null,
  );
}

function dockParts(view: PageView, dock: Dock, words: UiWords, send: (intent: PlayerIntent) => boolean): ReactNode[] {
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
        // A card's choices are the card's own buttons; its list's last line (an own move in words) stays.
        dock.options ? h(Moves, { key: "moves", lines: view.card && dock.form === "moves" && dock.prompt.kind === "card" ? dock.options.lines.filter((l) => !/^\d+\.\s/.test(l)) : dock.options.lines, title: view.card ? undefined : dock.options.title, send }) : null,
      ];
  }
}

/**
 * A road card on the dock (design §4.3): who decides, its choices as buttons while the human's word
 * is asked, and the table's word landing on them as initials as the engine records it; the decided
 * choice marked. Every word on it is the host's.
 */
function CardDock({ view, card, send }: { view: PageView; card: CardView; send(intent: PlayerIntent): boolean }): ReactNode {
  const asked = view.dock.form === "moves" && view.dock.prompt.kind === "card";
  const number = (id: string) => view.options?.choices?.find((c) => c.about?.id === id)?.number;
  return h(
    "section",
    { className: "card", "data-test": "card", ...(card.decided ? { "data-decided": card.decided } : {}) },
    h("p", { className: "decides" }, card.card.decides),
    h(
      "div",
      { className: "choices", role: "group" },
      card.card.choices.map((c) => {
        const n = number(c.id);
        const votes = card.votes.filter((v) => v.choice === c.id);
        return h(
          "button",
          {
            key: c.id,
            type: "button",
            className: `choice${card.decided === c.id ? " decided" : ""}`,
            "data-choice": c.id,
            disabled: !asked || n === undefined,
            onClick: () => n !== undefined && send({ kind: "option", number: n }),
          },
          h("span", { className: "text" }, c.text),
          h(
            "span",
            { className: "votes" },
            votes.map((v) => h("span", { key: v.who, className: `vote${v.who === view.hello?.handle ? " mine" : ""}`, title: v.name, "aria-label": v.name, "data-who": v.who }, initial(v.name))),
          ),
        );
      }),
    ),
    card.own?.words ? h("p", { className: "own" }, h("span", { className: "vote", "aria-hidden": true }, initial(card.own.name)), `${card.own.name}: «${card.own.words}»`) : null,
    card.card.fell ? h("p", { className: "fell" }, card.card.fell) : null,
  );
}

/** The people the character knows, in the `/кто` lists' groups; a name opens the card. */
function PeopleList({ view, open, close }: { view: PageView; open(id: string): void; close(): void }): ReactNode {
  const words = peopleWords(view);
  useEscape(close);
  const groups: Array<[string, PersonState[]]> = [
    [words.lists.companion, ["companion"]],
    [words.lists.met, ["here", "elsewhere", "unconscious"]],
    [words.lists.dead, ["dead"]],
    [words.lists.heard, ["heard"]],
  ];
  const shown = groups.map(([title, states]) => [title, view.people.filter((p) => states.includes(p.state))] as const).filter(([, people]) => people.length > 0);
  return h(
    "aside",
    { className: "inspector", role: "dialog", "aria-label": words.title, "data-test": "people-list" },
    h("header", null, h("h2", null, words.title), h("button", { className: "close", onClick: close, "aria-label": "×" }, "×")),
    shown.length === 0 ? h("p", { className: "line" }, words.nobody) : null,
    shown.map(([title, people]) =>
      h(
        "section",
        { key: title },
        h("h3", null, title),
        people.map((p) => h("button", { key: p.id, type: "button", className: "person", "data-person": p.id, onClick: () => open(p.id) }, h("span", { className: "medal", "aria-hidden": true }, initial(p.name)), p.name)),
      ),
    ),
  );
}

/** "What your character knows" of one person: the terminal's person card, with their initial. */
function PersonCard({ view, id, close }: { view: PageView; id: string; close(): void }): ReactNode {
  useEscape(close);
  const p = view.people.find((q) => q.id === id);
  if (!p) return null;
  // The terminal's last row tells how to close it; the window has its own close.
  const [name, ...rows] = personCard(p, peopleWords(view)).slice(0, -1);
  return h(
    "aside",
    { className: "person-card", role: "dialog", "aria-label": name, "data-test": "person-card", "data-person": id },
    h("header", null, h("span", { className: "medal", "aria-hidden": true }, initial(p.name)), h("h2", null, name), h("button", { className: "close", onClick: close, "aria-label": "×" }, "×")),
    rows.map((row, i) => h("p", { key: i, className: row.startsWith(`${peopleWords(view).remembers}:`) ? "remembers" : "line" }, row)),
  );
}

/** Esc closes what is open on top. */
function useEscape(close: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [close]);
}

/** The numbered list as buttons: a press sends the number, as typing it does. */
function Moves({ lines, title, send }: { lines: string[]; title?: string; send(intent: PlayerIntent): boolean }): ReactNode {
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
function Capsule({ view, send }: { view: PageView; send(intent: PlayerIntent): boolean }): ReactNode {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string>();
  const [help, setHelp] = useState(false);
  const words = ui(view);
  const submit = () => {
    const typed = readLine(draft, view.ask?.prompt, words);
    if (typed.kind === "empty") return;
    if (typed.kind === "error") return setNotice(typed.text);
    setNotice(undefined);
    if (typed.kind === "help") {
      setDraft("");
      return setHelp(true);
    }
    // The window shows the panel, the people and the mouse as a window does: these are the terminal's own.
    if (typed.kind !== "intent") return setDraft("");
    // The line stays until it has gone, so nothing typed is lost while the socket comes back.
    if (send(typed.intent)) setDraft("");
    else setNotice(words.busy);
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
    help ? h(Overlay, { overlay: { title: words.help, text: helpText(words), n: 0 }, onClose: () => setHelp(false) }) : null,
  );
}

/** The commands and what each does, as the terminal's /help lists them. */
function helpText(words: UiWords): string {
  return words.helpText(Object.keys(COMMAND_HELP).map((name) => [name, words.commandHelp[name as keyof UiWords["commandHelp"]]] as const));
}

declare global {
  interface Window {
    /** What the replay test reads: each roll the stage landed, with the faces the dice show. */
    __nat20?: { landed: Array<{ roll: string; faces: number[]; gl: boolean }>; done: boolean };
  }
}

/** The roll stage: one d20 per die the engine rolled, landing on the engine's faces only. */
function Stage({ roll, finish, settled }: { roll: RollToken; finish: Finish; settled(): void }): ReactNode {
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const shadows = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    let gone = false;
    const css = getComputedStyle(document.documentElement);
    const rgb = (name: string, fallback: [number, number, number]): [number, number, number] => {
      const m = /#([0-9a-f]{6})/i.exec(css.getPropertyValue(name));
      return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as [number, number, number] : fallback;
    };
    // The die takes the page's own colours, so it follows light and dark.
    const look = { finish, ink: rgb("--ink", [0.086, 0.086, 0.086]), accent: rgb("--accent", [0.165, 0.349, 0.788]), paper: rgb("--paper", [0.984, 0.98, 0.969]), line: rgb("--line", [0.851, 0.839, 0.812]) };
    // A die that cannot be drawn leaves the engine's line on the stage, as with no WebGL2.
    const dice = canvases.current.map((c, i) => {
      try {
        return c ? mount(c, look, shadows.current[i] ?? undefined) : undefined;
      } catch {
        return undefined;
      }
    });
    void Promise.all(dice.map((die, i) => die?.rollTo(roll.d20[i]))).then(() => {
      if (gone) return;
      const faces = dice.map((die: Die | undefined, i) => die?.face() ?? roll.d20[i]);
      window.__nat20?.landed.push({ roll: roll.id, faces, gl: dice.every((d) => d !== undefined) });
      setTimeout(() => !gone && settled(), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700);
    });
    return () => {
      gone = true;
      for (const die of dice) die?.release();
    };
  }, [roll.id]);
  return h(
    "div",
    { className: "stage", role: "status", "aria-label": roll.text, "data-roll": roll.id },
    h(
      "div",
      { className: "dice" },
      roll.d20.map((face, i) =>
        h(
          "div",
          { key: i, className: "die" },
          h("div", { className: "shadow", ref: (d: HTMLDivElement | null) => void (shadows.current[i] = d) }),
          h("canvas", { ref: (c: HTMLCanvasElement | null) => void (canvases.current[i] = c), width: 360, height: 360, "data-face": face, "data-finish": finish, "aria-hidden": true }),
        ),
      ),
    ),
    h("p", { className: "line" }, roll.text),
  );
}
