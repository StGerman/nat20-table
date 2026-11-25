// What the controls show (AGT-153, `docs/design/swiftui-shell-design.md` §2): one pure reading of the page's
// view as a plain value, so a native shell can draw the title, the dock and its sheet without a
// second copy of the page's rules. The page's own dock reads the same helpers (`chipsOf`, `costOf`,
// `placeholder`), so the two cannot choose different chips. Every word in it is the host's or one
// of the page's labels in UI_WORDS; it adds no number the page does not show (Rule 3).
import { UI_WORDS, type UiWords } from "../table/words.ts";
import type { TableEvent } from "../table/types.ts";
import type { Choice } from "../table/choices.ts";
import { PEOPLE_WORDS } from "../ui/people.ts";
import { happened, meOf, type PageView } from "./reduce.ts";

type Situation = NonNullable<Extract<TableEvent, { kind: "situation" }>["situation"]>;

export function ui(view: PageView): UiWords {
  return UI_WORDS[view.hello?.language ?? "en"];
}

export function named(view: PageView, handle: string): string {
  return view.hello?.names?.[handle] ?? handle.charAt(0).toUpperCase() + handle.slice(1);
}

/** A creature's name as the panel shows it: the seat's name for a foe («волк 1»), else the party's. */
export function shownName(view: PageView, s: Situation | undefined, handle: string): string {
  return s?.shown?.[handle] ?? s?.creatures.find((c) => c.handle === handle)?.name ?? named(view, handle);
}

/** A person's initial: the first letter of the name the seat shows. */
function initial(name: string): string {
  return /\p{L}/u.exec(name)?.[0]?.toLocaleUpperCase() ?? "?";
}

/** What a move costs, in the panel's words: the sheet's group and the chip's second line. */
export function costOf(choice: Choice, words: UiWords): { group: "action" | "bonus" | "path" | "free"; label?: string } {
  const c = choice.about?.cost;
  const id = choice.about?.id;
  if (c?.spell_slot) return { group: c.bonus_action > 0 ? "bonus" : "action", label: words.panel.slot(c.spell_slot) };
  if (c && c.action > 0) return { group: "action", label: words.panel.action };
  if (c && c.bonus_action > 0) return { group: "bonus", label: words.panel.bonusAction };
  if (id === "move" || choice.act?.kind === "move" || choice.act?.kind === "dash_move") return { group: "path", label: words.page.path };
  return { group: "free" };
}

/** The few moves the chips offer on a fight turn: a strike at a foe in reach first, then a bonus action, then the rest in the engine's order. */
export function chipsOf(choices: Choice[], fight: boolean): Choice[] {
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

/** What the capsule asks: the question of the open ask, or who the table waits on. */
export function placeholder(view: PageView, words: UiWords): string {
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

/** One numbered move, as a chip or as a row of the sheet. */
export interface ChromeMove {
  n: number;
  id: string;
  label: string;
  /** A chip's second line: what it costs. */
  cost?: string;
  /** The rule's own summary, when the engine gave one. */
  summary?: string;
  /** A row's right side: what is left of a limited use, or its cost out of a fight. */
  side?: string;
}

export interface Chrome {
  /** The last event applied. */
  seq: number;
  language: string;
  title: string;
  /** Where the road is, under the title. */
  where?: string;
  /** The turn pill: the round and whose turn, or the calm word out of a fight. */
  pill?: { text: string; mine: boolean };
  /** The human's own character: the capsule's health. */
  me?: { name: string; initial: string; hp: number; hpMax: number; low: boolean; health: string; hpText: string };
  dock: {
    form: PageView["dock"]["form"];
    /** The open ask's id. */
    ask?: string;
    placeholder: string;
    /** An ask is open: what is typed can be sent. */
    open: boolean;
    refusal?: string;
    /** The engine's why for the moves spent since the last list. */
    spent: string[];
    chips: ChromeMove[];
    endTurn?: ChromeMove;
    /** «Что ещё можно»: the whole sheet is there to open, under this label. */
    more?: string;
    /** The sheet: every move by what it costs, a reaction's yes and no, or the Narrator's question. */
    sheet?: {
      /** It is the ask itself and stands open: a pick, a road choice, a reaction, a question. */
      forced: boolean;
      lead?: string;
      question?: string;
      /**
       * A reaction: yes and no. With one answer on offer `what` names it and yes takes it; with
       * several, `answers` holds each, pressed by its number, and yes is not drawn.
       */
      reaction?: { yes: string; no: string; what?: string; answers?: Array<{ n: number; label: string }> };
      groups: Array<{ title?: string; moves: ChromeMove[] }>;
      closed?: { title: string; rows: Array<{ name: string; message: string }> };
    };
    /** A road card: its choices and the table's word on them. */
    card?: {
      asked: boolean;
      decided?: string;
      choices: Array<{ id: string; text: string; n?: number; votes: Array<{ who: string; name: string; initial: string; mine: boolean }> }>;
      own?: string;
      fell?: string;
    };
    /** What is left of a fight turn. */
    budget?: Array<{ label: string; spent: boolean; value?: number }>;
  };
  /** The tab names, and whether «Где все» has something to show. */
  tabs: { story: string; where: string; sheet: string; people: string; canWhere: boolean };
  /** The human's own roll holds the screen. */
  stage: boolean;
  /** A fight is on, or is not; unsaid until the seat has shown where things stand. A shell that shows the picture of the place turns to «Где все» in a fight (CON-26). */
  fight?: boolean;
  /**
   * The place of the scene (CON-26): its name, the picture of it and the key of its drawn plan,
   * each `<pack>/<name>`. A shell draws the picture from the files it holds, and a placeholder
   * with the name on it when it holds none.
   */
  place?: { name: string; plate: string; plan: string };
  /** «Лист» has no sheet to show, or one from before the character last changed or anything last
   *  happened at the table: a shell asks the seat for a fresh one only then. */
  sheetStale: boolean;
}

export function chromeOf(view: PageView): Chrome {
  const words = ui(view);
  const s = view.situation?.situation;
  const handle = view.hello?.handle ?? "";
  const dock = view.dock;
  const options = "options" in dock ? dock.options : undefined;
  const prompt = dock.form === "moves" ? dock.prompt : undefined;
  const chipForm = (dock.form === "moves" && prompt?.kind === "combat_turn") || dock.form === "input";
  const listed = options?.choices ?? [];
  const fight = options?.budget !== undefined && prompt?.kind !== "pick";
  const chip = (c: Choice): ChromeMove => {
    const cost = costOf(c, words).label?.toLocaleLowerCase();
    return { n: c.number, id: c.about?.id ?? "", label: c.label, ...(cost ? { cost } : {}), ...(c.about?.summary ? { summary: c.about.summary } : {}) };
  };
  const row = (c: Choice): ChromeMove => {
    const use = options?.uses?.find((u) => u.id === c.about?.id?.replace("/", "."));
    const side = use ? words.panel.left(use.remaining) : fight ? undefined : costOf(c, words).label;
    return { n: c.number, id: c.about?.id ?? "", label: c.label, ...(c.about?.summary ? { summary: c.about.summary } : {}), ...(side ? { side } : {}) };
  };
  const endTurn = chipForm ? listed.find((c) => c.about?.id === "end_turn") : undefined;
  const closed = options?.unavailable ?? [];
  const more = chipForm && (listed.length > 0 || closed.length > 0);
  const forced = !view.card && ((dock.form === "moves" && !chipForm && listed.length > 0) || dock.form === "reaction" || (dock.form === "answer" && dock.question !== undefined));

  let sheet: Chrome["dock"]["sheet"];
  if (dock.form === "reaction") {
    const answers = dock.reaction?.options ?? [];
    const several = answers.length > 1 ? { answers: answers.map((label, i) => ({ n: i + 1, label })) } : answers[0] ? { what: answers[0] } : {};
    sheet = { forced, ...(dock.reaction ? { lead: dock.reaction.summary } : {}), reaction: { yes: words.yes, no: words.no, ...several }, groups: [] };
  }
  else if (dock.form === "answer") sheet = dock.question !== undefined ? { forced, question: dock.question, groups: [] } : undefined;
  else if (listed.length > 0 || closed.length > 0) {
    const group = (title: string, which: "action" | "bonus" | "path" | "free") => ({ title, moves: listed.filter((c) => costOf(c, words).group === which && (which !== "free" || c.about?.id !== "end_turn")).map(row) });
    sheet = fight
      ? {
          forced,
          groups: [group(words.panel.action, "action"), group(words.panel.bonusAction, "bonus"), group(words.page.path, "path"), group(words.page.free, "free")].filter((g) => g.moves.length > 0),
          ...(closed.length > 0 ? { closed: { title: words.page.notNow, rows: closed.map((u) => ({ name: u.name, message: u.message })) } } : {}),
        }
      : { forced, ...(options?.title ? { lead: options.title } : {}), groups: [{ moves: listed.map(row) }] };
  }

  const spent = new Map<string, string[]>();
  if (chipForm) for (const x of view.spent) spent.set(x.message, [...(spent.get(x.message) ?? []), x.name]);

  const card = view.card;
  const asked = dock.form === "moves" && dock.prompt.kind === "card";
  const budget = dock.form === "moves" && dock.prompt.kind === "combat_turn" ? dock.options?.budget : undefined;
  const mine = s?.mode === "combat" && s.turn === handle;
  const pill = s?.mode === "combat" ? [s.round !== undefined ? words.panel.round(s.round) : undefined, mine ? words.panel.yourTurn : s.turn ? words.panel.turnOf(shownName(view, s, s.turn)) : undefined].filter(Boolean).join(" · ") : s ? words.panel.explore : undefined;
  const name = named(view, handle);
  const where = s?.road?.where;

  return {
    seq: view.seq,
    language: view.hello?.language ?? "en",
    title: view.hello?.title ?? "",
    ...(where ? { where } : {}),
    ...(pill ? { pill: { text: pill, mine } } : {}),
    ...(s ? { me: { name, initial: initial(name), hp: s.me.hp, hpMax: s.me.hp_max, low: s.me.hp_max > 0 && s.me.hp * 4 <= s.me.hp_max, health: words.page.health, hpText: words.page.hp(s.me.hp, s.me.hp_max) } } : {}),
    dock: {
      form: dock.form,
      ...("ask" in dock ? { ask: dock.ask } : {}),
      placeholder: placeholder(view, words),
      open: view.ask !== undefined,
      ...(view.refusal ? { refusal: view.refusal } : {}),
      spent: [...spent].map(([message, names]) => `${names.join(", ")}: ${message.charAt(0).toLocaleLowerCase()}${message.slice(1)}`),
      chips: chipForm ? chipsOf(listed, dock.form === "moves").map(chip) : [],
      ...(endTurn ? { endTurn: chip(endTurn) } : {}),
      ...(more ? { more: words.page.allMoves } : {}),
      ...(sheet ? { sheet } : {}),
      ...(card
        ? {
            card: {
              asked,
              ...(card.decided ? { decided: card.decided } : {}),
              choices: card.card.choices.map((c) => {
                const n = view.options?.choices?.find((o) => o.about?.id === c.id)?.number;
                return { id: c.id, text: c.text, ...(n !== undefined ? { n } : {}), votes: card.votes.filter((v) => v.choice === c.id).map((v) => ({ who: v.who, name: v.name, initial: initial(v.name), mine: v.who === handle })) };
              }),
              ...(card.own?.words ? { own: `${card.own.name}: «${card.own.words}»` } : {}),
              ...(card.card.fell ? { fell: card.card.fell } : {}),
            },
          }
        : {}),
      ...(budget
        ? {
            budget: [
              { label: words.panel.action, spent: budget.action <= 0 },
              { label: words.panel.bonusAction, spent: budget.bonus_action <= 0 },
              { label: words.page.feet(budget.movement_ft).replace(/^\d+\s*/, ""), spent: budget.movement_ft <= 0, value: budget.movement_ft },
            ],
          }
        : {}),
    },
    tabs: { story: words.page.story, where: words.page.where, sheet: words.page.sheet, people: PEOPLE_WORDS[view.hello?.language ?? "en"].title, canWhere: view.situation?.positions !== undefined || (view.situation?.situation?.road?.map?.length ?? 0) > 0 },
    stage: view.stage !== undefined,
    ...(s ? { fight: s.mode === "combat" } : {}),
    ...(view.situation?.place ? { place: view.situation.place } : {}),
    sheetStale: view.sheet === undefined || view.sheet.me !== meOf(view) || view.sheet.at !== happened(view),
  };
}
