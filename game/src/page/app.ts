// The Glass Table page, part 1 (AGT-142, design §5.2): the story column as the content layer, and
// over it the control layer in glass: the title and turn pill on top, the dock at the bottom (chips,
// the sheet of moves, the capsule with health and the turn's budget), the roll stage over all. It
// draws from the wire's data, not from the terminal's lines (Stas, 2026-11-21); every word it shows
// is the host's or one of the page's labels in UI_WORDS. It talks to nothing but the seat wire.
import { createElement as h, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { COMMAND_HELP, readLine } from "../ui/input.ts";
import { UI_WORDS, type UiWords } from "../table/words.ts";
import type { HumanPrompt, PlayerIntent, TableEvent } from "../table/types.ts";
import type { Choice } from "../table/choices.ts";
import { nameSpans, PEOPLE_WORDS, personCard, type Person, type PersonState } from "../ui/people.ts";
import { FINISHES, mount, type Die, type Finish } from "./d20.ts";
import { placed, type CardView, type Dock, type PageView, type RollToken, type StoryLine } from "./reduce.ts";

export interface AppProps {
  view: PageView;
  /** Sends an answer to the open ask, or a command with none open; false when it could not go (no socket, or nothing takes it now). */
  send(intent: PlayerIntent): boolean;
  /** The roll stage has shown the human's roll. */
  settled(): void;
}

type Options = Extract<TableEvent, { kind: "options" }>;
type Situation = NonNullable<Extract<TableEvent, { kind: "situation" }>["situation"]>;
/** The roll tokens a popover shows, and where it opens. */
type Pop = { ids: string[]; x: number; y: number };

function ui(view: PageView): UiWords {
  return UI_WORDS[view.hello?.language ?? "en"];
}

function named(view: PageView, handle: string): string {
  return view.hello?.names?.[handle] ?? handle.charAt(0).toUpperCase() + handle.slice(1);
}

/** A creature's name as the panel shows it: the seat's name for a foe («волк 1»), else the party's. */
function shownName(view: PageView, s: Situation | undefined, handle: string): string {
  return s?.shown?.[handle] ?? s?.creatures.find((c) => c.handle === handle)?.name ?? named(view, handle);
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
  const [pop, setPop] = useState<Pop>();
  // Esc closes what is open on top: a roll's popover, the person card, then the people list under it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pop) setPop(undefined);
      else if (person !== undefined) setPerson(undefined);
      else if (peopleOpen) setPeopleOpen(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [person, peopleOpen, pop]);
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
  return h(
    "main",
    { className: `win ${s?.mode === "combat" ? "scene-fight" : "scene-road"}`, lang: view.hello.language },
    h("div", { className: "ambient", "aria-hidden": true }),
    h(Story, { view, open: setPerson, pop: setPop }),
    h("div", { className: "edge top", "aria-hidden": true }),
    h("div", { className: "edge bottom", "aria-hidden": true }),
    h(Top, { view, finish, choose, peopleOpen, togglePeople: () => setPeopleOpen(!peopleOpen) }),
    peopleOpen ? h(PeopleList, { view, open: setPerson, close: () => setPeopleOpen(false) }) : null,
    person ? h(PersonCard, { key: person, view, id: person, close: () => setPerson(undefined) }) : null,
    view.overlay ? h(Overlay, { key: view.overlay.n, overlay: view.overlay, words: ui(view) }) : null,
    pop ? h(RollPop, { pop, rolls: view.rolls, close: () => setPop(undefined) }) : null,
    h(DockView, { view, send }),
    view.stage ? h(Stage, { key: view.stage, roll: view.rolls[view.stage], finish, settled }) : null,
  );
}

/** The title with where the story is, the turn pill, «Люди» and the die finish. */
function Top({ view, finish, choose, peopleOpen, togglePeople }: { view: PageView; finish: Finish; choose(next: Finish): void; peopleOpen: boolean; togglePeople(): void }): ReactNode {
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
          order.length > 0 ? h("span", { className: "stack", "aria-hidden": true }, order.map((handle) => h("span", { key: handle, className: `medal small${handle === view.hello?.handle ? " me" : ""}`, title: shownName(view, s, handle) }, initial(shownName(view, s, handle))))) : null,
        )
      : h("span"),
    h(
      "div",
      { className: "toolset" },
      h(
        "div",
        { className: "tools glass" },
        h("button", { type: "button", className: "tool", "data-test": "people", "aria-pressed": peopleOpen, onClick: togglePeople }, peopleWords(view).title),
        h("button", { type: "button", className: "tool finish", "data-test": "finish", onClick: () => choose(FINISHES[(FINISHES.indexOf(finish) + 1) % FINISHES.length]) }, ui(view).dieFinish[finish]),
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

function Story({ view, open, pop }: { view: PageView; open(id: string): void; pop(p: Pop): void }): ReactNode {
  const box = useRef<HTMLElement>(null);
  // The newest line sits just above the dock: the column's bottom padding is the dock's height.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const down = () => el.scrollTo?.({ top: el.scrollHeight });
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
        line.cont ? h("span", { className: "medal gapped", "aria-hidden": true }) : h("span", { className: "medal", "aria-hidden": true }, initial(line.who ?? "")),
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

/** What a move costs, in the panel's words: the sheet's group and the chip's second line. */
function costOf(choice: Choice, words: UiWords): { group: "action" | "bonus" | "path" | "free"; label?: string } {
  const c = choice.about?.cost;
  const id = choice.about?.id;
  if (c?.spell_slot) return { group: c.bonus_action > 0 ? "bonus" : "action", label: words.panel.slot(c.spell_slot) };
  if (c && c.action > 0) return { group: "action", label: words.panel.action };
  if (c && c.bonus_action > 0) return { group: "bonus", label: words.panel.bonusAction };
  if (id === "move" || choice.act?.kind === "move" || choice.act?.kind === "dash_move") return { group: "path", label: words.page.path };
  return { group: "free" };
}

/** The few moves the chips offer on a fight turn: a strike at a foe in reach first, then a bonus action, then the rest in the engine's order. */
function chipsOf(choices: Choice[], fight: boolean): Choice[] {
  const rest = choices.filter((c) => c.about?.id !== "end_turn");
  if (!fight) return rest.length <= 4 ? rest : rest.slice(0, 3);
  const rank = (c: Choice) => {
    const id = c.about?.id ?? "";
    const direct = c.act !== undefined;
    if (/^(melee_attack|ranged_attack)(\/|$)/.test(id) && direct && c.target?.side === "hostile") return 0;
    if (c.about?.cost?.spell_slot !== undefined && direct) return 1;
    if ((c.about?.cost?.bonus_action ?? 0) > 0) return 2;
    if (id === "move") return 4;
    return 3;
  };
  return rest
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .slice(0, 3)
    .map(({ c }) => c);
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
  const more = chipForm && listed.filter((c) => c.about?.id !== "end_turn").length > chips.length;
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
  if (dock.form === "reaction")
    return h(
      "div",
      { className: "sheet moves" },
      dock.reaction ? h("p", { className: "sheet-lead" }, dock.reaction.summary) : null,
      h("button", { type: "button", className: "move", onClick: () => send({ kind: "reaction", take: true }) }, h("span", { className: "move-text" }, h("b", null, words.yes))),
      h("button", { type: "button", className: "move", onClick: () => send({ kind: "reaction", take: false }) }, h("span", { className: "move-text" }, h("b", null, words.no))),
    );
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
  if (view.dock.form === "ended") return h("div", { className: "dock-bar ended" }, h("span", { className: "medal me", "aria-hidden": true }, initial(name)), me ? h(Health, { me, words }) : null);
  return h(
    "div",
    { className: "dock-bar" },
    h("span", { className: "medal me", "aria-hidden": true }, initial(name)),
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

/** What the capsule asks: the question of the open ask, or who the table waits on. */
function placeholder(view: PageView, words: UiWords): string {
  const name = named(view, view.hello?.handle ?? "");
  const dock = view.dock;
  switch (dock.form) {
    case "waiting":
      return words.page.waiting(dock.on);
    case "paused":
      return words.panel.paused;
    case "answer":
      return words.page.answer;
    case "input":
      return words.page.ask(name);
    case "reaction":
      return words.page.orOwn;
    case "moves":
      return dock.prompt.kind === "combat_turn" || dock.prompt.kind === "surrender" ? words.page.ask(name) : words.page.orOwn;
    case "ended":
      return "";
  }
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
