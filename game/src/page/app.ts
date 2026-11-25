// The Glass Table page (AGT-142, AGT-143, design §5.2): the story column as the content layer, and
// over it the control layer in glass: the title, turn pill and tools on top («Рассказ | Где все»,
// «Лист», «Люди»), the portrait rail on the left, the dock at the bottom (chips, the sheet of moves,
// the capsule with health and the turn's budget), the roll stage over all. It
// draws from the wire's data, not from the terminal's lines (Stas, 2026-11-21); every word it shows
// is the host's or one of the page's labels in UI_WORDS. It talks to nothing but the seat wire.
import { createElement as h, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { COMMAND_HELP, readLine } from "../ui/input.ts";
import { UI_WORDS, type UiWords } from "../table/words.ts";
import type { HumanPrompt, PlayerIntent, TableEvent } from "../table/types.ts";
import type { Choice } from "../table/choices.ts";
import { nameSpans, PEOPLE_WORDS, personCard, type Person, type PersonState } from "../ui/people.ts";
import { FINISHES, mount, type Die, type Finish } from "./d20.ts";
import { faceFile, faceOf } from "./portraits.ts";
import { chipsOf, costOf, named, placeholder, shownName, ui } from "./chrome.ts";
import { meOf, placed, type CardView, type Dock, type PageView, type RollToken, type StoryLine } from "./reduce.ts";

export interface AppProps {
  view: PageView;
  /** Sends an answer to the open ask, or a command with none open; false when it could not go (no socket, or nothing takes it now). */
  send(intent: PlayerIntent): boolean;
  /** The roll stage has shown the human's roll. */
  settled(): void;
  /** Inside a native shell (decision 0093): the page draws content only, and the shell draws every control. */
  shell?: Shell;
}

/** What a native shell asks of the page, and what the page tells it was touched. */
export interface Shell {
  /** Which content this web view draws. */
  show: "story" | "where" | "sheet" | "people";
  open(what: { what: "rolls"; rolls: RollToken[] } | { what: "person"; name: string; rows: string[] } | { what: "lines"; title: string; rows: string[] } | { what: "none" }): void;
}

type Options = Extract<TableEvent, { kind: "options" }>;
type Situation = NonNullable<Extract<TableEvent, { kind: "situation" }>["situation"]>;
/** The roll tokens a popover shows, and where it opens. */
type Pop = { ids: string[]; x: number; y: number };

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

export function App({ view, send, settled, shell }: AppProps): ReactNode {
  const [finish, setFinish] = useState<Finish>(savedFinish);
  /** The person card open, by id; the inspector open («Люди» or «Лист»); the lens over the story. */
  const [person, setPerson] = useState<string>();
  const [panel, setPanel] = useState<Panel>();
  const [lens, setLens] = useState(false);
  const [pop, setPop] = useState<Pop>();
  // Esc closes what is open on top: a roll's popover, the person card, the inspector, then the lens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pop) setPop(undefined);
      else if (person !== undefined) setPerson(undefined);
      else if (panel) setPanel(undefined);
      else if (lens) setLens(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [person, panel, lens, pop]);
  // A sheet the human asked for, by «Лист» or by typing /sheet, opens in «Лист» when it comes.
  const wantSheet = useRef(false);
  const sheetN = view.sheet?.n ?? 0;
  useEffect(() => {
    if (sheetN > 0 && wantSheet.current) {
      wantSheet.current = false;
      setPanel("sheet");
    }
  }, [sheetN]);
  // Inside a native shell what the seat answered a command with (/options, /where) is the shell's
  // sheet, and it goes when the page's own overlay would: the table moved on.
  const overlayN = view.overlay ? view.overlay.n : 0;
  useEffect(() => {
    if (shell?.show !== "story") return;
    if (view.overlay) shell.open({ what: "lines", title: view.overlay.title, rows: view.overlay.text.split("\n").filter((row) => row.trim() !== "") });
    else shell.open({ what: "none" });
  }, [overlayN]);
  // On a phone the yard is drawn wider than the screen and panned with a finger: it opens on the
  // human's own character, and follows them when they walk.
  const at = view.situation?.positions?.me;
  useEffect(() => {
    if (shell?.show === "where") document.querySelector(".lens.yard .who.me")?.scrollIntoView({ block: "center", inline: "center" });
  }, [at?.x_ft, at?.y_ft, view.hello !== undefined]);
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
  const s = view.situation?.situation;
  const toggle = (which: Panel) => setPanel(panel === which ? undefined : which);
  const ask = (intent: PlayerIntent): boolean => {
    if (intent.kind === "command" && intent.name === "sheet") wantSheet.current = true;
    return send(intent);
  };
  // «Лист» asks the seat for a fresh sheet when the table waits on the human, as /sheet does.
  const openSheet = () => {
    if (panel === "sheet") return setPanel(undefined);
    setPanel("sheet");
    if (view.ask) ask({ kind: "command", name: "sheet" });
  };
  const looks = lensOf(view);
  if (shell) {
    // The shell opens what the content was touched on: a roll's lines, a person's card.
    const rolls = (p: Pop) => shell.open({ what: "rolls", rolls: p.ids.map((id) => view.rolls[id]).filter((r) => r !== undefined) });
    const who = (id: string) => {
      const p = view.people.find((q) => q.id === id);
      if (!p) return;
      const [name, ...rows] = personCard(p, peopleWords(view)).slice(0, -1);
      shell.open({ what: "person", name, rows });
    };
    const content =
      shell.show === "where" ? (looks ? h(Lens, { view, looks }) : null)
      : shell.show === "sheet" ? h(CharSheet, { view, finish, choose, close: () => undefined })
      : shell.show === "people" ? h(PeopleList, { view, open: who, close: () => undefined })
      : h(Story, { view, open: who, pop: rolls });
    return h(
      "main",
      { className: `win native show-${shell.show} ${s?.mode === "combat" ? "scene-fight" : "scene-road"}`, lang: view.hello.language },
      h("div", { className: "ambient", "aria-hidden": true }),
      content,
      // The finish is chosen on «Лист», which is another page in a native shell: the story's page
      // reads the choice as each roll takes the stage, not once when it was loaded.
      view.stage && shell.show === "story" ? h(Stage, { key: view.stage, roll: view.rolls[view.stage], finish: savedFinish(), settled }) : null,
    );
  }
  return h(
    "main",
    { className: `win ${s?.mode === "combat" ? "scene-fight" : "scene-road"}`, lang: view.hello.language },
    h("div", { className: "ambient", "aria-hidden": true }),
    lens && looks ? h(Lens, { view, looks }) : h(Story, { view, open: setPerson, pop: setPop }),
    h("div", { className: "edge top", "aria-hidden": true }),
    h("div", { className: "edge bottom", "aria-hidden": true }),
    h(Top, { view, panel, lens: lens && looks !== undefined, canLens: looks !== undefined, setLens, openSheet, togglePeople: () => toggle("people") }),
    h(Rail, { view, openSheet, lens: () => setLens(true) }),
    panel === "people" ? h(PeopleList, { view, open: setPerson, close: () => setPanel(undefined) }) : null,
    panel === "sheet" ? h(CharSheet, { view, finish, choose, close: () => setPanel(undefined) }) : null,
    person ? h(PersonCard, { key: person, view, id: person, close: () => setPerson(undefined) }) : null,
    view.overlay ? h(Overlay, { key: view.overlay.n, overlay: view.overlay, words: ui(view) }) : null,
    pop ? h(RollPop, { pop, rolls: view.rolls, close: () => setPop(undefined) }) : null,
    h(DockView, { view, send: ask }),
    view.stage ? h(Stage, { key: view.stage, roll: view.rolls[view.stage], finish, settled }) : null,
  );
}

type Panel = "people" | "sheet";

/** The title with where the story is, the turn pill, the «Рассказ | Где все» switch, «Лист» and «Люди». */
function Top({ view, panel, lens, canLens, setLens, openSheet, togglePeople }: { view: PageView; panel?: Panel; lens: boolean; canLens: boolean; setLens(on: boolean): void; openSheet(): void; togglePeople(): void }): ReactNode {
  const s = view.situation?.situation;
  const words = ui(view).panel;
  const mine = s?.mode === "combat" && s.turn === view.hello?.handle;
  const pill = s?.mode === "combat" ? [s.round !== undefined ? words.round(s.round) : undefined, mine ? words.yourTurn : s.turn ? words.turnOf(shownName(view, s, s.turn)) : undefined].filter(Boolean).join(" · ") : s ? words.explore : undefined;
  // Who acts now and next, in initiative order.
  const order = s?.mode === "combat" ? [s.turn, ...s.next].filter((x): x is string => x !== undefined).slice(0, 5) : [];
  // The road's place line already leads with the day.
  const where = s?.road?.where;
  return h(
    "header",
    { className: "topbar" },
    h("div", { className: "wintitle" }, h("b", null, view.hello?.title ?? ""), where ? h("span", null, where) : null),
    pill
      ? h(
          "div",
          { className: `turnpill pill glass${mine ? " mine" : " calm"}`, role: "status", "data-test": "turn" },
          h("i", { className: "mark", "aria-hidden": true }),
          h("span", null, pill),
          order.length > 0 ? h("span", { className: "stack", "aria-hidden": true }, order.map((handle) => h(Medal, { key: handle, handle, name: shownName(view, s, handle), className: `small${handle === view.hello?.handle ? " me" : ""}`, title: shownName(view, s, handle) }))) : null,
        )
      : h("span"),
    h(
      "div",
      { className: "toolset" },
      h(
        "div",
        { className: "tools glass", role: "group" },
        h("button", { type: "button", "data-test": "story", "aria-pressed": !lens, onClick: () => setLens(false) }, ui(view).page.story),
        h("button", { type: "button", "data-test": "where", "aria-pressed": lens, disabled: !canLens, onClick: () => setLens(true) }, ui(view).page.where),
      ),
      h(
        "div",
        { className: "tools glass" },
        h("button", { type: "button", "data-test": "sheet", "aria-pressed": panel === "sheet", onClick: openSheet }, ui(view).page.sheet),
        h("button", { type: "button", "data-test": "people", "aria-pressed": panel === "people", onClick: togglePeople }, peopleWords(view).title),
      ),
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

/** A round face: the portrait when the page has one for the handle, else the initial. */
function Medal({ handle, name, className, title }: { handle?: string; name: string; className?: string; title?: string }): ReactNode {
  const face = faceOf(handle);
  return h("span", { className: ["medal", className, face ? "face" : undefined].filter(Boolean).join(" "), "aria-hidden": true, ...(title ? { title } : {}) }, face ? h("img", { src: face, alt: "", draggable: false }) : initial(name));
}

/** The portrait rail (design §5.2, the control layer's side): the human, then the party, each ringed
 *  by how they are; under it «Рядом», the foes still up, nearest first. Health is
 *  the panel's: the human's own numbers, the others' bands. The frame waits for its narration, as the
 *  panel does, so nobody falls on the rail before the story tells it. */
function Rail({ view, openSheet, lens }: { view: PageView; openSheet(): void; lens(): void }): ReactNode {
  const s = view.situation?.situation;
  if (!s) return null;
  const words = ui(view);
  const me = view.hello?.handle ?? "";
  const fight = s.mode === "combat";
  const mine = s.me.hp_max > 0 && s.me.hp * 4 <= s.me.hp_max ? (s.me.hp <= 0 ? "down" : "low") : "";
  const party = s.creatures.filter((c) => c.side === "party");
  const near = s.creatures.filter((c) => c.side === "hostile" && c.health !== "down").sort((a, b) => a.distance_ft - b.distance_ft);
  const ring = (health: string) => (health === "down" ? "down" : health === "bloodied" ? "low" : "");
  const now = (handle: string) => (fight && s.turn === handle ? " now" : "");
  const myName = named(view, me);
  const myLabel = `${myName} · ${words.page.health} ${words.page.hp(s.me.hp, s.me.hp_max)}`;
  return h(
    "nav",
    { className: "rail", "aria-label": words.panel.party.replace(/[·:\s]/g, "") || myName, "data-test": "rail" },
    h(
      "div",
      { className: "rail-party glass" },
      h("button", { type: "button", className: `face-btn ${mine}${now(me)}`.trim(), "data-handle": me, title: myLabel, "aria-label": myLabel, onClick: openSheet }, h(Medal, { handle: me, name: myName })),
      party.map((c) => {
        const label = `${c.name} · ${words.panel.health[c.health]}`;
        return h("span", { key: c.handle, className: `face-btn ${ring(c.health)}${now(c.handle)}`.trim(), "data-handle": c.handle, "data-health": c.health, title: label, role: "img", "aria-label": label }, h(Medal, { handle: c.handle, name: c.name }));
      }),
    ),
    near.length > 0
      ? h(
          "button",
          { type: "button", className: "near glass", "data-test": "near", title: `${words.page.near}: ${near.map((c) => shownName(view, s, c.handle)).join(", ")}`, "aria-label": `${words.page.near}: ${near.length}`, onClick: lens },
          h(Medal, { handle: near[0].handle, name: shownName(view, s, near[0].handle) }),
          near.length > 1 ? h("b", { className: "count" }, near.length) : null,
        )
      : null,
  );
}

/** What «Где все» shows now: the yard in a fight or wherever positions came, else the road. */
type Looks = { kind: "yard"; positions: NonNullable<NonNullable<PageView["situation"]>["positions"]> } | { kind: "road"; map: string[] };

function lensOf(view: PageView): Looks | undefined {
  const s = view.situation;
  const positions = s?.positions;
  const road = s?.situation?.road?.map;
  if (positions && (s?.situation?.mode === "combat" || !road)) return { kind: "yard", positions };
  if (road && road.length > 0) return { kind: "road", map: road };
  return undefined;
}

/** «Где все» (design §5.2): the yard drawn from the engine's positions and the scene's anchors, in
 *  feet, with nothing invented between them; out of a fight, the road as the seat lays it out. */
function Lens({ view, looks }: { view: PageView; looks: Looks }): ReactNode {
  const words = ui(view).page;
  if (looks.kind === "road") return h("section", { className: "lens road", "data-test": "lens" }, h("pre", { className: "route glass" }, looks.map.join("\n")));
  const s = view.situation?.situation;
  const me = view.hello?.handle ?? "";
  const p = looks.positions;
  const who = Object.entries(p.creatures).map(([handle, at]) => ({ handle, at, c: s?.creatures.find((x) => x.handle === handle) }));
  const budget = view.dock.form === "moves" && view.dock.prompt.kind === "combat_turn" ? view.dock.options?.budget : undefined;
  const walk = budget?.movement_ft ?? 0;
  const xs = [p.me.x_ft - walk, p.me.x_ft + walk, ...who.map((w) => w.at.x_ft), ...p.anchors.map((a) => a.position_ft.x_ft)];
  const ys = [p.me.y_ft - walk, p.me.y_ft + walk, ...who.map((w) => w.at.y_ft), ...p.anchors.map((a) => a.position_ft.y_ft)];
  const pad = 8;
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  // North is up: the engine's y grows away from the viewer, the screen's grows down.
  const X = (x: number) => x - x0;
  const Y = (y: number) => y1 - y;
  const token = (handle: string, name: string, at: { x_ft: number; y_ft: number }, cls: string, title: string, label: string) => {
    const face = faceOf(handle);
    const id = `clip-${handle}`;
    return h(
      "g",
      { key: handle, className: `who ${cls}${face ? "" : " noface"}`, "data-handle": handle, transform: `translate(${X(at.x_ft)} ${Y(at.y_ft)})` },
      h("title", null, title),
      h("circle", { r: 1.9, className: "disc" }),
      face ? [h("clipPath", { key: "c", id }, h("circle", { r: 1.65 })), h("image", { key: "i", href: face, x: -1.65, y: -1.65, width: 3.3, height: 3.3, clipPath: `url(#${id})` })] : h("text", { className: "ini", dy: "0.35em" }, initial(name)),
      h("text", { className: "label", y: cls === "me" ? -2.6 : 3.6 }, label),
    );
  };
  return h(
    "section",
    { className: "lens yard", "data-test": "lens" },
    h(
      "svg",
      // The yard's size in feet, for the native shell's scale (page.css).
      { viewBox: `0 0 ${x1 - x0} ${y1 - y0}`, role: "img", "aria-label": words.where, style: { "--ft": x1 - x0, "--ft-h": y1 - y0 } as CSSProperties },
      walk > 0
        ? h(
            "g",
            { className: "walk" },
            h("circle", { cx: X(p.me.x_ft), cy: Y(p.me.y_ft), r: walk }),
            h("text", { x: X(p.me.x_ft), y: Y(p.me.y_ft) - walk - 1.2 }, words.walk),
          )
        : null,
      p.anchors.map((a) => {
        // A place someone stands on keeps its name above them, clear of theirs below (and of «вы» above the human).
        const near = (at: { x_ft: number; y_ft: number }) => Math.hypot(at.x_ft - a.position_ft.x_ft, at.y_ft - a.position_ft.y_ft) < 4;
        const y = near(p.me) ? -4.3 : who.some((w) => near(w.at)) ? -2.6 : 2.6;
        return h("g", { key: a.id, className: "anchor", transform: `translate(${X(a.position_ft.x_ft)} ${Y(a.position_ft.y_ft)})` }, h("rect", { x: -0.75, y: -0.75, width: 1.5, height: 1.5, rx: 0.3 }), h("text", { y }, a.name));
      }),
      who.map(({ handle, at, c }) => {
        const name = shownName(view, s, handle);
        // One the panel no longer lists has left the fight: drawn faded where it was last.
        return token(handle, name, at, `${c?.side ?? "gone"}${!c || c.health === "down" ? " down" : ""}`, [name, c ? ui(view).panel.health[c.health] : undefined].filter(Boolean).join(" · "), name);
      }),
      token(me, named(view, me), p.me, "me", named(view, me), words.you),
    ),
    h(Missing, { view, handles: [me, ...who.map((w) => w.handle)] }),
  );
}

/**
 * What is not drawn yet, by its type and its own name (CON-26, Stas 2026-11-25): the place's plan
 * under «Где все», and the portraits of those standing here. Read off a picture of the window, it
 * says which file to draw.
 */
function Missing({ view, handles }: { view: PageView; handles: string[] }): ReactNode {
  const words = ui(view).page;
  const plan = view.situation?.place?.plan;
  const faces = [...new Set(handles.filter((handle) => !faceOf(handle)).map(faceFile))].sort();
  if (!plan && faces.length === 0) return null;
  return h(
    "div",
    { className: "missing", "data-test": "missing" },
    plan ? h("p", { "data-missing": "plan" }, h("b", null, words.noPlan), " ", plan) : null,
    faces.length > 0 ? h("p", { "data-missing": "faces" }, h("b", null, words.noFaces), " ", faces.join(", ")) : null,
  );
}

/** «Лист» (design §5.2): the character sheet the seat showed last, in its own words, and the die's finish. */
function CharSheet({ view, finish, choose, close }: { view: PageView; finish: Finish; choose(next: Finish): void; close(): void }): ReactNode {
  const words = ui(view).page;
  const [head, ...rows] = (view.sheet?.text ?? "").split("\n").filter((r) => r.trim() !== "");
  const old = view.sheet !== undefined && view.sheet.me !== meOf(view);
  const me = view.situation?.situation?.me;
  // The seat's first line is the name, then who the character is: «Брен: человек, воин, уровень 2», "Bren, level 2 human fighter".
  const cut = head ? /^(.+?)(?::|,)\s+(.+)$/.exec(head) : null;
  const [title, sub] = cut ? [cut[1], cut[2]] : [head, undefined];
  return h(
    "aside",
    { className: "inspector charsheet glass", role: "dialog", "aria-label": words.sheet, "data-test": "charsheet" },
    h(
      "header",
      null,
      h(Medal, { handle: view.hello?.handle, name: named(view, view.hello?.handle ?? "") }),
      h("hgroup", null, h("h2", null, title ?? words.sheet), sub ? h("p", null, sub) : null),
      h("button", { className: "close", onClick: close, "aria-label": words.close }, "×"),
    ),
    !view.sheet || old ? h("p", { className: "line", "data-test": "sheet-later" }, words.sheetLater) : null,
    view.sheet
      ? h(
          "dl",
          null,
          rows.map((row, i) => {
            // "Label: value" rows read as a label over their parts; the stats line is parts alone.
            const m = /^([^:·]{1,40}):\s+(.*)$/.exec(row);
            const parts = (m ? m[2] : row).split(" · ");
            // The stats line («Здоровье 20 из 20 · Защита 19 · …») reads as tiles: a word over its number.
            const tiles = !m && parts.length > 1 ? parts.map((part) => /^(\D+?)\s+([-+]?\d.*)$/.exec(part)) : [];
            // The seat's sheet leads that line with Hit Points: on an old sheet they are the panel's, as
            // the capsule shows them, so the window never says two healths at once (Vera, 2026-11-21).
            if (tiles.length > 0 && tiles.every(Boolean))
              return h(
                "div",
                { key: i, className: "tiles" },
                tiles.map((t, j) => h("div", { key: j, className: "tile", ...(j === 0 ? { "data-test": "sheet-hp" } : {}) }, h("small", null, t![1]), h("b", null, j === 0 && old && me ? words.hp(me.hp, me.hp_max) : t![2]))),
              );
            return h("div", { key: i, className: "row" }, m ? h("dt", null, m[1]) : null, h("dd", null, parts.length > 1 ? parts.map((part, j) => h("span", { key: j, className: "part" }, part)) : parts[0]));
          }),
        )
      : null,
    h(
      "div",
      { className: "die-row", role: "group", "aria-label": words.die, "data-test": "finish" },
      h("span", null, words.die),
      FINISHES.map((f) => h("button", { key: f, type: "button", "data-finish": f, "aria-pressed": f === finish, onClick: () => choose(f) }, words.finish[f])),
    ),
  );
}

function Story({ view, open, pop }: { view: PageView; open(id: string): void; pop(p: Pop): void }): ReactNode {
  const box = useRef<HTMLElement>(null);
  // The newest line sits just above the dock: the column's bottom padding is the dock's height.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Inside a native shell the document scrolls, so the shell's bars can follow it.
    const down = () => (document.documentElement.classList.contains("native") ? scrollTo({ top: document.documentElement.scrollHeight }) : el.scrollTo?.({ top: el.scrollHeight }));
    down();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(down);
    ro.observe(el.firstElementChild ?? el);
    return () => ro.disconnect();
  }, [view.story.length, view.preview]);
  return h(
    "section",
    { ref: box, className: "story", "aria-live": "polite", "aria-relevant": "additions" },
    h(
      "div",
      { className: "story-col" },
      view.story.map((line) => h(Row, { key: line.id, line, now: line.id >= view.fresh, view, open, pop })),
      view.preview ? h("p", { className: "beat narration preview", "aria-hidden": true }, view.preview) : null,
    ),
  );
}

/** Words with the names of people the character knows as tokens that open their card (rule N1). */
function spans(text: string, people: Person[], open: (id: string) => void): ReactNode[] {
  return nameSpans(text, people).map((span, i) => (span.person ? h("button", { key: i, type: "button", className: "name", "data-person": span.person, onClick: () => open(span.person!) }, span.text) : span.text));
}

function Row({ line, now, view, open, pop }: { line: StoryLine; now: boolean; view: PageView; open(id: string): void; pop(p: Pop): void }): ReactNode {
  const cls = `beat ${line.beat}${now ? " now" : ""}${line.asks ? " asks" : ""}${line.cont ? " cont" : ""}`;
  const tokens = (ids: string[]) => h(Tokens, { ids, rolls: view.rolls, pop, order: ui(view).page.order });
  switch (line.beat) {
    case "narration":
      return h(
        "p",
        { className: cls, "data-row": line.id },
        // A roll goes into the sentence that tells it.
        placed(line.text, line.rolls, view.rolls).map((part, i, all) => h("span", { key: i }, spans(part.text, view.people, open), tokens(part.rolls), i < all.length - 1 ? " " : null)),
      );
    case "speech":
    case "words":
    case "act":
      return h(
        "div",
        { className: `${cls} say${line.beat === "words" ? " mine" : ""}`, "data-row": line.id, ...(line.person ? { "data-who": line.person } : {}) },
        line.cont ? h("span", { className: "medal gapped", "aria-hidden": true }) : h(Medal, { handle: line.person, name: line.who ?? "" }),
        line.cont ? null : h("span", { className: "say-who" }, line.to ? `${line.who} → ${line.to}` : line.who),
        h("span", { className: "say-text" }, line.beat === "words" ? line.text : spans(line.text, view.people, open), tokens(line.rolls)),
      );
    case "place":
      return h("p", { className: cls, "data-row": line.id }, line.text);
    case "info":
      return h("div", { className: cls, "data-row": line.id }, line.title ? h("p", { className: "place" }, line.title) : null, line.text.split("\n").map((t, i) => h("p", { key: i }, spans(t, view.people, open))));
    case "fact":
    case "end":
      return h("p", { className: cls, "data-row": line.id }, spans(line.text, view.people, open), tokens(line.rolls));
  }
}

/**
 * A row's roll tokens: each a hexagon with its total that opens the engine's line. A fight's
 * turn-order rolls are one token, so a narration that tells them all does not end in a row of
 * numbers; it opens every one of them.
 */
function Tokens({ ids, rolls, pop, order: orderWord }: { ids: string[]; rolls: Record<string, RollToken>; pop(p: Pop): void; order: string }): ReactNode {
  const known = ids.filter((id) => rolls[id]);
  if (known.length === 0) return null;
  const order = known.filter((id) => rolls[id].kind === "initiative");
  const grouped = order.length > 1;
  const open = (list: string[]) => (e: { currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    pop({ ids: list, x: r.left + r.width / 2, y: r.bottom });
  };
  const items: ReactNode[] = [];
  let groupShown = false;
  for (const id of known) {
    const roll = rolls[id];
    if (grouped && roll.kind === "initiative") {
      if (groupShown) continue;
      groupShown = true;
      items.push(h("button", { key: "order", type: "button", className: "roll num", "data-rolls": order.join(" "), "aria-label": order.map((x) => rolls[x].text).join("; "), onClick: open(order) }, orderWord));
      continue;
    }
    const tone = roll.kind === "healing" ? " heal" : roll.kind === "damage" ? " harm" : roll.outcome === "miss" || roll.outcome === "failure" ? " miss" : "";
    items.push(h("button", { key: id, type: "button", className: `roll ${roll.outcome}${tone}`, "data-roll": id, "data-rolls": id, title: roll.text, "aria-label": roll.text, onClick: open([id]) }, String(roll.total)));
  }
  return h("span", { className: "tokens" }, items);
}

/** A roll token's popover: who rolled, and the engine's line for each roll in it. */
function RollPop({ pop, rolls, close }: { pop: Pop; rolls: Record<string, RollToken>; close(): void }): ReactNode {
  useEffect(() => {
    const away = (e: MouseEvent) => !(e.target as Element | null)?.closest?.(".pop, .roll") && close();
    addEventListener("mousedown", away);
    return () => removeEventListener("mousedown", away);
  }, []);
  const left = Math.max(16, Math.min(pop.x - 150, innerWidth - 316));
  return h(
    "aside",
    { className: "pop glass", role: "dialog", style: { left, top: pop.y + 8 }, "data-test": "roll-pop" },
    h("ul", null, pop.ids.map((id) => h("li", { key: id }, rolls[id].text))),
  );
}

/** A command's answer laid over the story, until the human closes it or the next answer. */
function Overlay({ overlay, words, onClose }: { overlay: NonNullable<PageView["overlay"]>; words: UiWords; onClose?(): void }): ReactNode {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => (onClose ? onClose() : setOpen(false));
  return h(
    "aside",
    { className: "overlay glass", role: "dialog", "aria-label": overlay.title },
    h("header", null, h("h2", null, overlay.title), h("button", { className: "close", onClick: close, "aria-label": words.page.close }, "×")),
    h("pre", null, overlay.text),
  );
}

function DockView({ view, send }: { view: PageView; send(intent: PlayerIntent): boolean }): ReactNode {
  const words = ui(view);
  const dock = view.dock;
  const [all, setAll] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // The story keeps its last line above the dock, however tall the dock is.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--dock-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const askId = "ask" in dock ? dock.ask : undefined;
  useEffect(() => setAll(false), [askId]);
  const options = "options" in dock ? dock.options : undefined;
  const prompt = dock.form === "moves" ? dock.prompt : undefined;
  const choose = (n: number) => send({ kind: "option", number: n });
  // A fight turn and a list out of a fight offer a few chips and the whole sheet; a pick, a road
  // choice, a level-up or a surrender is the sheet itself.
  const chipForm = (dock.form === "moves" && prompt?.kind === "combat_turn") || dock.form === "input";
  const listed = options?.choices ?? [];
  const sheetOpen = !view.card && ((dock.form === "moves" && !chipForm && listed.length > 0) || (chipForm && all) || dock.form === "reaction" || (dock.form === "answer" && dock.question !== undefined));
  const chips = chipForm && !all ? chipsOf(listed, dock.form === "moves") : [];
  const endTurn = chipForm ? listed.find((c) => c.about?.id === "end_turn") : undefined;
  // The sheet is always there on a list: it also holds what is left of a use and what is not open now.
  const more = chipForm && (listed.length > 0 || (options?.unavailable?.length ?? 0) > 0);
  return h(
    "footer",
    { ref, className: `dock ${dock.form}${sheetOpen || view.card ? " open" : ""}`, "data-form": dock.form },
    view.refusal ? h("p", { className: "refusal glass", role: "alert" }, view.refusal) : null,
    view.spent.length > 0 && chipForm ? h(SpentLine, { view }) : null,
    chips.length > 0 || endTurn || more
      ? h(
          "div",
          { className: "chips moves", role: "group" },
          chips.map((c) => h(Chip, { key: c.number, choice: c, words, choose })),
          endTurn ? h("button", { type: "button", className: "chip glass", "data-move": "end_turn", onClick: () => choose(endTurn.number) }, h("b", null, endTurn.label)) : null,
          more || all ? h("button", { type: "button", className: "chip glass", "data-test": "all-moves", "aria-pressed": all, onClick: () => setAll(!all) }, h("b", null, all ? words.page.fewerMoves : words.page.allMoves)) : null,
        )
      : null,
    h(
      "div",
      { className: "dock-glass glass" },
      view.card ? h(CardDock, { key: view.card.card.text, view, card: view.card, send }) : null,
      sheetOpen ? h(Sheet, { view, dock, options, prompt, words, send, choose }) : null,
      h(Bar, { view, send }),
    ),
  );
}

/** The engine's why for the moves spent since the last list, said once (design §5.1). */
function SpentLine({ view }: { view: PageView }): ReactNode {
  const by = new Map<string, string[]>();
  for (const s of view.spent) by.set(s.message, [...(by.get(s.message) ?? []), s.name]);
  return h(
    "p",
    { className: "spent", "data-test": "spent" },
    // The engine's why follows a colon, so it starts in lower case (Vera read «…: На это» as a slip).
    [...by].map(([message, names]) => h("span", { key: message, title: names.join(", ") }, `${names.join(", ")}: ${message.charAt(0).toLocaleLowerCase()}${message.slice(1)}`)),
  );
}

function Chip({ choice, words, choose }: { choice: Choice; words: UiWords; choose(n: number): void }): ReactNode {
  const cost = costOf(choice, words);
  return h(
    "button",
    { type: "button", className: "chip glass", "data-move": choice.about?.id ?? "", title: choice.about?.summary, onClick: () => choose(choice.number) },
    h("b", null, choice.label),
    cost.label ? h("span", null, cost.label.toLocaleLowerCase()) : null,
  );
}

/** The sheet of moves: every choice of the list, by what it costs on a fight turn, and what the engine says is not open now. */
function Sheet({ view, dock, options, prompt, words, send, choose }: { view: PageView; dock: Dock; options?: Options; prompt?: HumanPrompt; words: UiWords; send(intent: PlayerIntent): boolean; choose(n: number): void }): ReactNode {
  if (dock.form === "reaction") {
    // One answer on offer: yes takes it, and the button says what it is. Several: each is its own
    // button, sent by its number, as the terminal takes a reaction's number.
    const answers = dock.reaction?.options ?? [];
    return h(
      "div",
      { className: "sheet moves" },
      dock.reaction ? h("p", { className: "sheet-lead" }, dock.reaction.summary) : null,
      answers.length > 1
        ? answers.map((label, i) => h("button", { key: i, type: "button", className: "move", "data-answer": i + 1, onClick: () => send({ kind: "option", number: i + 1 }) }, h("span", { className: "move-text" }, h("b", null, label))))
        : h("button", { type: "button", className: "move", "data-answer": "yes", onClick: () => send({ kind: "reaction", take: true }) }, h("span", { className: "move-text" }, h("b", null, words.yes), answers[0] ? h("span", null, answers[0]) : null)),
      h("button", { type: "button", className: "move", "data-answer": "no", onClick: () => send({ kind: "reaction", take: false }) }, h("span", { className: "move-text" }, h("b", null, words.no))),
    );
  }
  if (dock.form === "answer") return h("div", { className: "sheet" }, h("p", { className: "sheet-lead question" }, dock.question));
  const choices = options?.choices ?? [];
  const fight = options?.budget !== undefined && prompt?.kind !== "pick";
  // On the right: what is left of a limited use; out of a fight's groups, what the move costs.
  const side = (c: Choice) => {
    const use = options?.uses?.find((u) => u.id === c.about?.id?.replace("/", "."));
    if (use) return words.panel.left(use.remaining);
    return fight ? undefined : costOf(c, words).label;
  };
  const row = (c: Choice) =>
    h(
      "button",
      { key: c.number, type: "button", className: "move", "data-move": c.about?.id ?? "", onClick: () => choose(c.number) },
      h("span", { className: "move-text" }, h("b", null, c.label), c.about?.summary ? h("span", null, c.about.summary) : null),
      side(c) ? h("span", { className: "left" }, side(c)) : null,
    );
  const lead = options?.title && !fight ? h("p", { className: "sheet-lead" }, options.title) : null;
  if (!fight) return h("div", { className: "sheet moves" }, lead, choices.map(row));
  const groups: Array<[string, Choice[]]> = [
    [words.panel.action, choices.filter((c) => costOf(c, words).group === "action")],
    [words.panel.bonusAction, choices.filter((c) => costOf(c, words).group === "bonus")],
    [words.page.path, choices.filter((c) => costOf(c, words).group === "path")],
    [words.page.free, choices.filter((c) => costOf(c, words).group === "free" && c.about?.id !== "end_turn")],
  ];
  const closed = options?.unavailable ?? [];
  return h(
    "div",
    { className: "sheet moves" },
    groups.filter(([, list]) => list.length > 0).map(([title, list]) => h("section", { key: title, className: "group" }, h("h3", null, title), list.map(row))),
    closed.length > 0
      ? h(
          "section",
          { className: "group" },
          h("h3", null, words.page.notNow),
          closed.map((u) => h("div", { key: u.option, className: "move", "aria-disabled": true }, h("span", { className: "move-text" }, h("b", null, u.name), h("span", null, u.message)))),
        )
      : null,
  );
}

/** The capsule bar: the human's initial and health, the line they type in, and on a fight turn what is left of it. */
function Bar({ view, send }: { view: PageView; send(intent: PlayerIntent): boolean }): ReactNode {
  const words = ui(view);
  const me = view.situation?.situation?.me;
  const handle = view.hello?.handle ?? "";
  const name = named(view, handle);
  const budget = view.dock.form === "moves" && view.dock.prompt.kind === "combat_turn" ? view.dock.options?.budget : undefined;
  // The story's last line says the run is over; the bar does not say it twice (the stop card is AGT-144).
  if (view.dock.form === "ended") return h("div", { className: "dock-bar ended" }, h(Medal, { handle, name, className: "me" }), me ? h(Health, { me, words }) : null);
  return h(
    "div",
    { className: "dock-bar" },
    h(Medal, { handle, name, className: "me" }),
    me ? h(Health, { me, words }) : null,
    h(Capsule, { key: "ask" in view.dock ? view.dock.ask : "none", view, send }),
    budget
      ? h(
          "span",
          { className: "budget", "data-test": "budget" },
          h("span", { className: `b${budget.action > 0 ? "" : " spent"}` }, h("i"), words.panel.action),
          h("span", { className: `b${budget.bonus_action > 0 ? "" : " spent"}` }, h("i"), words.panel.bonusAction),
          h("span", { className: `b path${budget.movement_ft > 0 ? "" : " spent"}` }, h("i", null, budget.movement_ft), words.page.feet(budget.movement_ft).replace(/^\d+\s*/, "")),
        )
      : null,
  );
}

/** The human's Hit Points as the capsule shows them: the number and a bar, red at a quarter or less. */
function Health({ me, words }: { me: Situation["me"]; words: UiWords }): ReactNode {
  const low = me.hp_max > 0 && me.hp * 4 <= me.hp_max;
  return h(
    "span",
    { className: `hp${low ? " low" : ""}`, "data-test": "hp" },
    h("small", null, words.page.health),
    h("b", null, words.page.hp(me.hp, me.hp_max)),
    h("span", { className: "lvl" }, h("i", { style: { width: `${Math.max(0, Math.min(100, (100 * me.hp) / Math.max(1, me.hp_max)))}%` } })),
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
  const asked = placeholder(view, words);
  return h(
    "form",
    {
      className: `capsule${view.ask ? "" : " waiting"}`,
      onSubmit: (e: { preventDefault(): void }) => {
        e.preventDefault();
        submit();
      },
    },
    h("input", { className: "ask", value: draft, placeholder: asked, onChange: (e: { target: { value: string } }) => setDraft(e.target.value), autoFocus: true, "aria-label": asked }),
    notice ? h("p", { className: "notice" }, notice) : null,
    help ? h(Overlay, { overlay: { title: words.help, text: helpText(words), n: 0 }, words, onClose: () => setHelp(false) }) : null,
  );
}

/**
 * A road card on the dock (design §4.3): its choices as the sheet's rows (who decides is the story's
 * line just above) while the human's word is asked, and the table's word landing on them as
 * initials as the engine records it; the decided choice marked. Every word on it is the host's.
 */
function CardDock({ view, card, send }: { view: PageView; card: CardView; send(intent: PlayerIntent): boolean }): ReactNode {
  const asked = view.dock.form === "moves" && view.dock.prompt.kind === "card";
  const number = (id: string) => view.options?.choices?.find((c) => c.about?.id === id)?.number;
  return h(
    "section",
    { className: "card sheet", "data-test": "card", ...(card.decided ? { "data-decided": card.decided } : {}) },
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
            className: `choice move${card.decided === c.id ? " decided picked" : ""}`,
            "data-choice": c.id,
            disabled: !asked || n === undefined,
            onClick: () => n !== undefined && send({ kind: "option", number: n }),
          },
          h("span", { className: "text move-text" }, h("b", null, c.text)),
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
  const groups: Array<[string, PersonState[]]> = [
    [words.lists.companion, ["companion"]],
    [words.lists.met, ["here", "elsewhere", "unconscious"]],
    [words.lists.dead, ["dead"]],
    [words.lists.heard, ["heard"]],
  ];
  const shown = groups.map(([title, states]) => [title, view.people.filter((p) => states.includes(p.state))] as const).filter(([, people]) => people.length > 0);
  return h(
    "aside",
    { className: "inspector glass", role: "dialog", "aria-label": words.title, "data-test": "people-list" },
    h("header", null, h("h2", null, words.title), h("button", { className: "close", onClick: close, "aria-label": ui(view).page.close }, "×")),
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
  const p = view.people.find((q) => q.id === id);
  if (!p) return null;
  // The terminal's last row tells how to close it; the window has its own close.
  const [name, ...rows] = personCard(p, peopleWords(view)).slice(0, -1);
  return h(
    "aside",
    { className: "person-card glass", role: "dialog", "aria-label": name, "data-test": "person-card", "data-person": id },
    h("header", null, h("span", { className: "medal", "aria-hidden": true }, initial(p.name)), h("h2", null, name), h("button", { className: "close", onClick: close, "aria-label": ui(view).page.close }, "×")),
    rows.map((row, i) => h("p", { key: i, className: row.startsWith(`${peopleWords(view).remembers}:`) ? "remembers" : "line" }, row)),
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
      return m ? ([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as [number, number, number]) : fallback;
    };
    // The die takes the page's own colours, so it follows light and dark.
    const look = { finish, ink: rgb("--ink", [0.075, 0.094, 0.125]), accent: rgb("--accent", [0.69, 0.267, 0.059]), paper: rgb("--ground", [0.957, 0.949, 0.929]), line: rgb("--line", [0.851, 0.839, 0.812]) };
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
    h("p", { className: "stage-title" }, roll.label),
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
