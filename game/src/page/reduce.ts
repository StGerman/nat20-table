// The window's screen as one pure function (AGT-142, Glass Table design §5.1): every message the
// host sends goes through `reduce`, and what comes out is all the page draws. No DOM, no clock, no
// network: a recorded `seat-wire.jsonl` replayed through it gives the exact screen at any `seq`.
// It keeps the terminal seat's rules (game/src/ui/ink-seat.ts): other characters' engine lines wait
// for the narration that tells them and become its roll tokens, `unnarrated`, an ask and the kinds in
// RELEASES show them as they are; the human's own line shows at once and its roll takes the stage
// first; nobody is shown dead before the story has told it (`asTold`). The story is drawn from the
// data, not from the terminal's lines (Stas, 2026-11-21): a roll joins the line it belongs to, the
// human's press is not echoed (the engine's line says what it did), and a turn's bookkeeping the
// turn pill shows stays out. Every word is still the host's: the page composes no sentence.
import type { Event } from "@nat20-table/engine-client";
import type { HumanPrompt, TableEvent } from "../table/types.ts";
import type { SeatCard } from "../table/seat-data.ts";
import { SEAT_WORDS } from "../table/words.ts";
import { speakerOf } from "../ui/lines.ts";
import { asTold, nameSpans, type Person } from "../ui/people.ts";
import type { HostMessage } from "../seat-wire/messages.ts";

/** A roll the seat was shown: the engine's player view, never a target number (Rule 3). */
export interface RollToken {
  id: string;
  /** Who rolled, as the seat names them, and their handle. */
  roller: string;
  by: string;
  label: string;
  kind: string;
  /** Each d20's faces, kept and dropped: the stage shows these and nothing else (Rule 4). */
  d20: number[];
  total: number;
  outcome: string;
  /** The engine line as the seat reads it. */
  text: string;
  /** It happened on the human's own turn. */
  own: boolean;
}

/** What a story row is (design §5.2, content layer): the page lays each out its own way. */
export type Beat =
  /** The Narrator's paragraph; `asks` when it is a question to the human. */
  | "narration"
  /** A character speaks: `who` and the words. */
  | "speech"
  /** The human's own words, as they sent them. */
  | "words"
  /** What a character sets out to do, as its player declared it. */
  | "act"
  /** An engine line no narration told: the record as the host wrote it. */
  | "fact"
  /** A heading in the story: a round, a scene, where the road is. */
  | "place"
  /** The picture a new place opens with (CON-27): `text` is the place's name, `title` the picture, `<pack>/<file>`. */
  | "plate"
  /** Words the table shows as they are: a road card's, the road's. */
  | "info"
  /** The run is over. */
  | "end";

/** One row of the story column. Every word in it is the host's: the page composes no sentence. */
export interface StoryLine {
  id: number;
  beat: Beat;
  text: string;
  /** The roll tokens drawn in it: a narration's rolls, or the rolls of an engine line and of the rolls that joined it. */
  rolls: string[];
  /** Who speaks or acts, as the seat names them, and their handle. */
  who?: string;
  person?: string;
  /** Whom it is said to, as the seat names them; the human's own name when it is said to them. */
  to?: string;
  /** An info row's title. */
  title?: string;
  /** The Narrator asks the human. */
  asks?: true;
  /** The same speaker as the row above: no second name over it. */
  cont?: true;
  /** A fact's engine event kind and who did it, so the rolls that belong to it can join it. */
  event?: string;
  actor?: string;
}

/** A row before it is numbered. */
type Row = Omit<StoryLine, "id">;

type Options = Extract<TableEvent, { kind: "options" }>;

/** A road card on the dock (design §4.3, AGT-143): the card as the seat read it, and the table's word on it as it comes. */
export interface CardView {
  card: SeatCard;
  /** Who said which choice, in order: the human first (0062), then the others as the engine records them. */
  votes: Array<{ who: string; name: string; choice: string }>;
  /** An own move on the card: whose, and its words. */
  own?: { who: string; name: string; words?: string };
  /** The choice the card was decided on. */
  decided?: string;
}
type Reaction = Extract<TableEvent, { kind: "reaction" }>;
type Situation = Extract<TableEvent, { kind: "situation" }>;

/** The dock's form (design §5.2): what the bottom of the window offers now. */
export type Dock =
  /** Nobody asks the human: who the table waits on, if anyone is named. */
  | { form: "waiting"; on?: string }
  /** Numbered moves: a combat turn, a pick inside one, a card, a level-up, the road, a surrender. */
  | { form: "moves"; ask: string; prompt: HumanPrompt; options?: Options }
  /** A reaction the engine offers: take it or not. */
  | { form: "reaction"; ask: string; reaction?: Reaction }
  /** The Narrator's question, answered in words. */
  | { form: "answer"; ask: string; question?: string }
  /** Out of a fight: the human says what their character does. */
  | { form: "input"; ask: string; options?: Options }
  /** `/pause` is on: only commands. */
  | { form: "paused"; ask: string }
  /** The run is over. */
  | { form: "ended"; text: string };

export interface PageView {
  /** The host's `hello`; nothing is drawn before it. */
  hello?: Extract<HostMessage, { type: "hello" }>;
  /** Why the page will not play with this host (another wire). */
  refused?: string;
  /** The last event's number: a resume asks for what follows it. */
  seq: number;
  story: StoryLine[];
  /** Other characters' engine lines waiting for their narration, with their rolls. */
  held: Row[];
  /** Every roll the seat was shown, by id. */
  rolls: Record<string, RollToken>;
  /** The human's own roll on the stage, until the page has shown it (`settle`). */
  stage?: string;
  /** The open ask: its id and prompt. */
  ask?: { id: string; prompt: HumanPrompt };
  /** The ask the page last answered, until the host takes the answer (its `said`, or a new ask): a `refused` reopens it. */
  sent?: { id: string; prompt: HumanPrompt };
  dock: Dock;
  /** The last numbered list the table showed, while it is the human's. */
  options?: Options;
  /** The road card on the table, until the human is asked something else. */
  card?: CardView;
  /** Options of the list before that the engine now lists as not open, each with why (design §5.1: a spent move leaves the dock with one line). */
  spent: Array<{ option: string; name: string; message: string }>;
  reaction?: Reaction;
  question?: string;
  /** Why the engine refused the last decision, over the moves until the next list. */
  refusal?: string;
  /** A command's answer laid over the story (/sheet, /where, /log, /usage). */
  overlay?: { title: string; text: string; data?: Extract<TableEvent, { kind: "info" }>; n: number };
  /** The character sheet the seat showed last (/sheet): «Лист» draws it, and `n` counts each new one.
   *  `me` is the panel's line on the character when it came: once that changes, the sheet is old.
   *  `at` is how much had happened by then (`happened`), for what that line does not hold. */
  sheet?: { title: string; text: string; n: number; me: string; at: number };
  /** What the human's character perceives: the panel, positions, the road. */
  situation?: Situation;
  /** The newest panel frame, waiting for the narration of the step before it or for the next decision. */
  frame?: Situation;
  /** Everyone the character knows, the dead only as the story has told them. */
  people: Person[];
  busy?: string;
  preview?: string;
  /** The table is answering a command the human typed. */
  answering: boolean;
  suggest?: { state: "waiting" | "rows" | "none"; rows?: string[] };
  /** The rule state behind `people`: the dead the story told, the dead not yet told, each as last seen alive. */
  told: string[];
  untold: string[];
  alive: Record<string, Person>;
  /** A frame with people in it was seen: the dead in the first such frame were told of before (ink-seat.ts `sawPeople`). */
  sawPeople: boolean;
  /** How many story rows there were when the panel was last refreshed. */
  looked: number;
  /** The picture of the place the story last opened with, `<pack>/<file>`: the same place opens once. */
  plate?: string;
  /** The speaker of the message the last row belongs to. */
  speaker?: string;
  /** The first row since the human last answered: the rows before it are read (the story dims them). */
  fresh: number;
  next: number;
}

export const EMPTY: PageView = { seq: 0, story: [], held: [], rolls: {}, dock: { form: "waiting" }, spent: [], people: [], answering: false, told: [], untold: [], alive: {}, sawPeople: false, looked: 0, next: 0, fresh: 0 };

/** The kinds that show the held engine lines above them; a narration tells them instead (ink-seat.ts RELEASES). */
const RELEASES = new Set<TableEvent["kind"]>(["options", "reaction", "question", "end"]);
/** A command's answers, shown over the story (/options too: the dock holds the list). */
const SHEETS = new Set((["en", "ru"] as const).map((l) => SEAT_WORDS[l].sheet));
const OVERLAYS = new Set((["en", "ru"] as const).flatMap((l) => [SEAT_WORDS[l].where, SEAT_WORDS[l].log, SEAT_WORDS[l].usage, SEAT_WORDS[l].options]));
const REFUSED = new Set([SEAT_WORDS.en.notAccepted, SEAT_WORDS.ru.notAccepted]);
/** The beats whose rows tell a death (ink-seat.ts TELLING). */
const TELLING = new Set<Beat>(["narration", "speech", "fact", "place", "end"]);
/** Engine lines the page leaves out: whose turn starts and ends is the turn pill's, and each word on a card lands on the card. */
const UNSHOWN = new Set(["turn_start", "turn_end", "card_advice"]);
/** The facts a roll joins: an action and its attack and damage, a fight's start and its turn order. */
const JOINS = new Set(["action", "combat_started"]);

/** The page's wire: it refuses a host built from another (as the engine client refuses another engine). */
export interface Built {
  wire: number;
  hash: string;
}

export function reduce(view: PageView, message: HostMessage, built?: Built): PageView {
  if (message.type === "hello") {
    if (built && (message.wire !== built.wire || message.hash !== built.hash)) return { ...EMPTY, refused: `wire ${message.wire} ${message.hash.slice(0, 12)}, page ${built.wire} ${built.hash.slice(0, 12)}` };
    // Another run starts from nothing.
    if (view.hello && view.hello.run !== message.run) return { ...EMPTY, hello: message };
    // A new connection: the host replays from the page's `seq`, then sends what stands now (busy, answering, the open ask).
    // What was drawn stays; what only stood at the moment goes until the host says it again.
    const { busy: _b, preview: _p, ask: _a, suggest: _s, refused: _r, ...kept } = view;
    return { ...kept, hello: message, answering: false, dock: view.dock.form === "ended" ? view.dock : { form: "waiting" } };
  }
  // Nothing is drawn before an accepted `hello`.
  if (!view.hello || view.refused) return view;
  const v = { ...view };
  switch (message.type) {
    case "event":
      if (message.seq <= v.seq) return view;
      v.seq = message.seq;
      return shown(v, message.event as unknown as TableEvent);
    case "ask": {
      // Nothing waits for a narration while the human decides.
      const r = release(v);
      const prompt = message.prompt as unknown as HumanPrompt;
      // A fight's options belong to the human's own turn: any other prompt means it is over.
      const turnOver = r.options?.budget && prompt.kind !== "combat_turn" && prompt.kind !== "pick";
      const next = { ...r, ask: { id: message.id, prompt }, sent: undefined, ...(turnOver ? { options: undefined } : {}), ...(prompt.kind !== "card" ? { card: undefined } : {}), suggest: undefined };
      return { ...next, dock: dockFor(next) };
    }
    case "busy":
      return { ...v, busy: message.on, dock: v.ask ? v.dock : v.dock.form === "ended" ? v.dock : { form: "waiting", ...(message.on ? { on: message.on } : {}) } };
    case "preview":
      return { ...v, preview: message.text };
    case "unnarrated":
      return release(v);
    case "answering":
      return { ...v, answering: message.on };
    case "suggest":
      return { ...v, suggest: { state: message.state, ...(message.rows ? { rows: message.rows } : {}) } };
    case "refused":
      // The host would not take the answer and keeps its ask open: the dock offers it again.
      if (!v.sent || v.ask) return v;
      return { ...v, ask: v.sent, sent: undefined, dock: dockFor({ ...v, ask: v.sent }) };
  }
}

/** The page has shown the roll on the stage: the token stays in the story. */
export function settle(view: PageView): PageView {
  return view.stage ? { ...view, stage: undefined } : view;
}

/** The human sent an answer: the ask is closed until the host asks again. */
export function answered(view: PageView): PageView {
  if (!view.ask) return view;
  const v = { ...view, ask: undefined, sent: view.ask };
  return { ...v, dock: v.dock.form === "ended" ? v.dock : { form: "waiting", ...(v.busy ? { on: v.busy } : {}) } };
}

/**
 * Another window took the seat (`CLOSE_REPLACED`): this one offers no move, since none would reach
 * the table, and says where the game is. The story stays as it was.
 */
export function replaced(view: PageView, text: string): PageView {
  return { ...view, ask: undefined, sent: undefined, busy: text, dock: view.dock.form === "ended" ? view.dock : { form: "waiting", on: text } };
}

/** How the seat labels a character: the host's names, else the handle as the terminal shows it. */
function namer(view: PageView): (handle: string) => string {
  const names = view.hello?.names ?? {};
  return (handle) => names[handle] ?? handle.charAt(0).toUpperCase() + handle.slice(1);
}

/** The row a message makes: the Narrator's paragraph, a character's words, a declared intent, a question. */
function rowOf(v: PageView, event: TableEvent): Row | undefined {
  const named = namer(v);
  const to = (handle: string | undefined) => (handle ? { to: named(handle) } : {});
  switch (event.kind) {
    case "narration":
      return event.speaker === "dm" ? { beat: "narration", text: event.text, rolls: [], ...to(event.to) } : { beat: "speech", text: event.text, rolls: [], who: named(event.speaker), person: event.speaker, ...to(event.to) };
    case "speech":
      return { beat: "speech", text: event.text, rolls: [], who: named(event.speaker), person: event.speaker, ...to(event.to) };
    case "intent":
      return { beat: "act", text: event.text, rolls: [], who: named(event.speaker), person: event.speaker };
    case "question":
      return { beat: "narration", text: event.text, rolls: [], asks: true };
    default:
      return undefined;
  }
}

/** An engine line's row, or none for the lines the page leaves out. */
function factOf(event: Extract<TableEvent, { kind: "engine" }>): Row | undefined {
  const e = event.event as (Event & { actor?: string }) | undefined;
  if (e && UNSHOWN.has(e.kind)) return undefined;
  if (e?.kind === "round") return { beat: "place", text: event.text, rolls: [] };
  return { beat: "fact", text: event.text, rolls: event.roll ? [event.roll] : [], ...(e ? { event: e.kind } : {}), ...(e?.actor ? { actor: e.actor } : {}) };
}

/** The rows that are not messages: a status, an info, the end. */
function othersOf(v: PageView, event: TableEvent): Row[] {
  switch (event.kind) {
    case "status":
      // "Your turn: pick a number…" is the terminal's prompt: the turn pill and the dock say it here.
      return event.text === SEAT_WORDS[v.hello?.language ?? "en"].yourTurn ? [] : [{ beat: "place", text: event.text, rolls: [] }];
    case "info":
      return [{ beat: "info", title: event.title, text: event.text, rolls: [] }];
    case "end":
      return [{ beat: "end", text: event.text, rolls: [] }];
    default:
      return [];
  }
}

function shown(v: PageView, event: TableEvent): PageView {
  if (RELEASES.has(event.kind)) v = release(v);
  switch (event.kind) {
    case "said": {
      // What it settles leaves the dock; a command leaves it standing. Out of a fight a pick or words
      // answer the list; in a fight it stays until the turn ends. Only words show in the story: a
      // press is told by the engine's own line, and a command by its answer.
      const intent = event.intent;
      const settles = intent.kind !== "command";
      const done = v.options && !v.options.budget && v.ask?.prompt.kind !== "pick" && (intent.kind === "option" || intent.kind === "text");
      const base = { ...v, ...(settles ? { reaction: undefined, question: undefined, refusal: undefined, overlay: undefined, fresh: v.next } : {}), ...(done ? { options: undefined } : {}) };
      const handle = v.hello?.handle ?? "";
      const next = intent.kind === "text" ? add(base, [{ beat: "words", text: intent.text, rolls: [], who: namer(v)(handle), person: handle }]) : base;
      return { ...answered(next), sent: undefined };
    }
    case "situation":
      // The panel frame waits for the narration of the step before it, or for the next decision.
      // A turn block the frame shows is over goes at once.
      return { ...v, frame: event, ...(endsTurn(v, event) ? { options: undefined } : {}) };
    case "options": {
      const spent = spentMoves(v.options, event);
      const next = { ...v, options: event, spent, refusal: undefined, ...(event.card ? { card: cardOf(v.card, event.card) } : {}) };
      return { ...next, dock: dockFor(next) };
    }
    case "engine": {
      if (v.card) v = { ...v, card: onCard(v.card, event) };
      const roll = rollOf(event, v);
      const rolls = roll ? { ...v.rolls, [roll.id]: roll } : v.rolls;
      const row = factOf(event);
      // The human's own line shows at once, its roll on the stage first; others' wait for their narration.
      if (event.own) return { ...add({ ...v, rolls }, row ? [row] : []), ...(roll && roll.d20.length > 0 ? { stage: roll.id } : {}) };
      return { ...v, rolls, held: row ? joined(v.held, [row], rolls) : v.held };
    }
    case "narration": {
      // The lines it narrates go nowhere: the narration tells them, and their rolls are its tokens.
      const told = new Set([...(event.rolls ?? []), ...v.held.flatMap((l) => l.rolls)]);
      const next = message({ ...v, held: [], preview: undefined }, event, [...told].filter((id) => id in v.rolls));
      return release(next);
    }
    case "info":
      // A sheet is a command's answer too: it takes the place of the one laid over the story.
      if (SHEETS.has(event.title)) return { ...v, overlay: undefined, sheet: { title: event.title, text: event.text, n: (v.sheet?.n ?? 0) + 1, me: meOf(v), at: happened(v) } };
      if (OVERLAYS.has(event.title)) return { ...v, overlay: { title: event.title, text: event.text, data: event, n: (v.overlay?.n ?? 0) + 1 } };
      if (REFUSED.has(event.title)) return { ...v, refusal: event.text };
      if (event.card) v = { ...v, card: cardOf(v.card, event.card) };
      break;
    case "reaction": {
      const next = { ...v, reaction: event };
      return { ...next, dock: dockFor(next) };
    }
    case "question": {
      const next = message({ ...v, question: event.text }, event, []);
      return { ...next, dock: dockFor(next) };
    }
    case "end": {
      const next = add({ ...v, overlay: undefined, reaction: undefined, question: undefined, ask: undefined }, othersOf(v, event));
      return { ...next, dock: { form: "ended", text: event.text } };
    }
  }
  if (speakerOf(event) !== undefined) return message(v, event, []);
  return add(v, othersOf(v, event));
}

/** The card the seat sent, keeping what the table already said on it when it is the same card. */
function cardOf(before: CardView | undefined, card: SeatCard): CardView {
  const same = before !== undefined && before.card.text === card.text;
  const votes = card.said.map((s) => ({ who: s.who, name: s.name, choice: s.choice }));
  return {
    card,
    votes: same && before.votes.length > votes.length ? before.votes : votes,
    ...(card.own_move ? { own: card.own_move } : same && before.own ? { own: before.own } : {}),
    ...(same && before.decided ? { decided: before.decided } : {}),
  };
}

/** The engine's record of the table's word on the card: a choice said, an own move, the decision. */
function onCard(view: CardView, event: Extract<TableEvent, { kind: "engine" }>): CardView {
  const e = event.event as Event | undefined;
  const name = (who: string) => event.names?.[who] ?? who;
  switch (e?.kind) {
    case "card_advice":
      // One word per person: a later round's advice (after an own move fell, say) replaces the earlier one.
      return view.votes.some((x) => x.who === e.actor && x.choice === e.choice)
        ? view
        : { ...view, votes: [...view.votes.filter((x) => x.who !== e.actor), { who: e.actor, name: name(e.actor), choice: e.choice }] };
    case "card_own_move":
      return { ...view, own: { who: e.actor, name: name(e.actor), words: e.words } };
    case "card_resolved":
      return { ...view, decided: e.choice };
    default:
      return view;
  }
}

/** The options of `before` that `now` lists as not open, each with the engine's why. */
function spentMoves(before: Options | undefined, now: Options): PageView["spent"] {
  if (!before?.choices || !now.unavailable) return [];
  const had = new Set(before.choices.flatMap((c) => (c.about ? [c.about.id] : [])));
  return now.unavailable.filter((u) => had.has(u.option));
}

function rollOf(event: Extract<TableEvent, { kind: "engine" }>, view: PageView): RollToken | undefined {
  const e = event.event as Event | undefined;
  if (!event.roll || e?.kind !== "roll" || e.roll.view !== "player") return undefined;
  const r = e.roll;
  return {
    id: r.id,
    roller: event.names?.[r.roller] ?? namer(view)(r.roller),
    by: r.roller,
    label: r.label,
    kind: r.kind,
    d20: r.dice.filter((d) => d.dice.endsWith("d20")).flatMap((d) => d.results),
    total: r.total,
    outcome: r.outcome,
    text: event.text,
    own: event.own === true,
  };
}

/** A message: no second name over it when the speaker is the same as the row above's. */
function message(v: PageView, event: TableEvent, rolls: string[]): PageView {
  const speaker = speakerOf(event);
  const row = rowOf(v, event);
  if (!row) return v;
  const next = print(v, [{ ...row, rolls, ...(speaker === v.speaker ? { cont: true as const } : {}) }]);
  return { ...next, speaker };
}

/** Rows that are not a message's: they end the message above. */
function add(v: PageView, rows: Row[]): PageView {
  if (rows.length === 0) return v;
  return { ...print(v, rows), speaker: undefined };
}

/**
 * `rows` after `before`, each roll line joined to the line it belongs to: an attack and its damage
 * to the action, a fight's turn-order rolls to its start. The joined line's own words stay with its
 * token (the token shows them), so no roll is lost.
 */
export function joined<T extends Row>(before: T[], rows: Row[], rolls: Record<string, RollToken>): T[] {
  const out = [...before];
  for (const row of rows) {
    const last = out.at(-1);
    if (last && joins(last, row, rolls)) out[out.length - 1] = { ...last, rolls: [...last.rolls, ...row.rolls] };
    else out.push(row as T);
  }
  return out;
}

function joins(last: Row, row: Row, rolls: Record<string, RollToken>): boolean {
  if (last.beat !== "fact" || row.beat !== "fact" || row.event !== "roll" || row.rolls.length !== 1) return false;
  const roll = rolls[row.rolls[0]];
  if (!roll || !JOINS.has(last.event ?? "")) return false;
  if (last.event === "combat_started") return roll.kind === "initiative";
  return roll.kind !== "initiative" && last.actor !== undefined && last.actor === roll.by;
}

function print(v: PageView, rows: Row[]): PageView {
  if (rows.length === 0) return v;
  // A roll line joins the line above it, already drawn or not.
  const tail = v.story.length > 0 ? [v.story.at(-1)!] : [];
  const merged = joined<Row & { id?: number }>(tail, rows, v.rolls);
  let next = v.next;
  const numbered = merged.map((row): StoryLine => ("id" in row && row.id !== undefined ? (row as StoryLine) : { ...row, id: next++ }));
  let out: PageView = { ...v, story: [...v.story.slice(0, v.story.length - tail.length), ...numbered], next };
  // A row that names a dead person after the death tells it: their card says so from now on.
  if (v.untold.length > 0) {
    const people = v.situation?.situation?.people ?? [];
    const told = v.untold.filter((id) => {
      const p = people.find((q) => q.id === id);
      return p !== undefined && tells(rows, p);
    });
    if (told.length > 0) out = { ...out, told: [...out.told, ...told], untold: out.untold.filter((id) => !told.includes(id)) };
  }
  return { ...out, people: peopleNow(out) };
}

/** Shows the held engine lines as they are, and the panel frame held with them. */
function release(v: PageView): PageView {
  const held = v.held;
  let out = held.length > 0 ? add({ ...v, held: [] }, held) : v;
  if (v.frame) out = situation({ ...out, frame: undefined }, v.frame);
  return out;
}

function situation(v: PageView, event: Situation): PageView {
  const since = v.story.slice(v.looked);
  const first = !v.sawPeople && (event.situation?.people?.length ?? 0) > 0;
  const told = [...v.told];
  const untold = [...v.untold];
  const alive = { ...v.alive };
  for (const p of event.situation?.people ?? []) {
    if (p.state !== "dead") {
      alive[p.id] = p;
      continue;
    }
    if (told.includes(p.id)) continue;
    if (first || tells(since, p)) told.push(p.id);
    else if (!untold.includes(p.id)) untold.push(p.id);
  }
  const next: PageView = { ...v, situation: event.situation ? event : (v.situation ?? event), looked: v.story.length, told, untold, alive, sawPeople: v.sawPeople || first, ...(endsTurn(v, event) ? { options: undefined } : {}) };
  const out = { ...next, people: peopleNow(next) };
  return event.place && event.place.plate !== v.plate ? opened(out, event.place) : out;
}

/**
 * A new place opens with its picture (CON-27; Stas, 2026-11-24: a chapter opener). The seat shows
 * the place only once its opening is told, so the row goes above the narration that told it: the
 * picture stands over the words that describe it, as in a book.
 */
function opened(v: PageView, place: NonNullable<Situation["place"]>): PageView {
  let at = v.story.length;
  while (at > 0 && v.story[at - 1].beat === "narration") at--;
  const row: StoryLine = { id: v.next, beat: "plate", text: place.name, title: place.plate, rolls: [] };
  return { ...v, story: [...v.story.slice(0, at), row, ...v.story.slice(at)], next: v.next + 1, looked: v.story.length + 1, plate: place.plate };
}

/** A fresh frame shows the human's fight turn over while its turn block stands (panel.ts `endsTurn`, kept here: panel.ts reads the palette file). */
function endsTurn(v: PageView, event: Situation): boolean {
  const s = event.situation;
  return v.options?.budget !== undefined && s !== undefined && (s.mode !== "combat" || s.turn !== v.hello?.handle);
}

/** The panel's line on the human's character, to tell whether a sheet still holds. */
export function meOf(v: PageView): string {
  return JSON.stringify((v.frame ?? v.situation)?.situation?.me ?? null);
}

/** How much has happened at the table: the story's lines, shown or held for their narration. A
 *  sheet also holds what the panel's line does not (the purse, experience, uses left), and each
 *  change to those comes with a line; the lists and frames the host sends again with an ask add none. */
export function happened(v: PageView): number {
  return v.story.length + v.held.length;
}

function peopleNow(v: PageView): Person[] {
  return asTold(v.situation?.situation?.people ?? [], (id) => v.told.includes(id), (id) => v.alive[id]);
}

function tells(rows: ReadonlyArray<{ beat: Beat; text: string }>, p: Person): boolean {
  return rows.some((row) => TELLING.has(row.beat) && nameSpans(row.text, [p]).some((span) => span.person));
}

/** The dock's form for the open ask, from its prompt and the last list (design §5.1). */
function dockFor(v: PageView): Dock {
  if (v.dock.form === "ended") return v.dock;
  const ask = v.ask;
  if (!ask) return { form: "waiting", ...(v.busy ? { on: v.busy } : {}) };
  switch (ask.prompt.kind) {
    case "reaction":
      return { form: "reaction", ask: ask.id, ...(v.reaction ? { reaction: v.reaction } : {}) };
    case "answer":
      return { form: "answer", ask: ask.id, ...(v.question ? { question: v.question } : {}) };
    case "explore":
      return { form: "input", ask: ask.id, ...(v.options ? { options: v.options } : {}) };
    case "paused":
      return { form: "paused", ask: ask.id };
    case "combat_turn":
    case "pick":
    case "surrender":
    case "card":
    case "level_up":
    case "road":
      return { form: "moves", ask: ask.id, prompt: ask.prompt, ...(v.options ? { options: v.options } : {}) };
  }
}

/**
 * A narration cut into sentences, each with the rolls it tells (design §5.2: a roll lives inside the
 * sentence that tells it). The narration names no roll, so a roll goes after the first sentence
 * that names its roller, from the sentence the roll before it went to (the next one, for another
 * roller); failing that, after the last. A fight's turn-order rolls stay together where it starts.
 */
export function placed(text: string, ids: readonly string[], rolls: Record<string, RollToken>): Array<{ text: string; rolls: string[] }> {
  const parts = text.split(/(?<=[.!?…»])\s+/u);
  const out = parts.map((t) => ({ text: t, rolls: [] as string[] }));
  const names = (i: number, stem: string) => out[i].text.toLocaleLowerCase().includes(stem);
  let at = 0;
  let last: string | undefined;
  for (const id of ids) {
    const roll = rolls[id];
    // A fight's turn order is told where the fight starts: its rolls stay together.
    if (!roll || roll.kind === "initiative") {
      out[at].rolls.push(id);
      continue;
    }
    const stem = stemOf(roll.roller);
    // Another roller is told in a later sentence, if one names them; the same roller, in this one or later.
    const from = last !== undefined && last !== roll.by ? at + 1 : at;
    let i = stem ? out.findIndex((_, j) => j >= from && names(j, stem)) : -1;
    if (i < 0 && stem) i = out.findIndex((_, j) => j >= at && names(j, stem));
    if (i < 0) i = out.length - 1;
    out[i].rolls.push(id);
    at = i;
    last = roll.by;
  }
  return out;
}

/** A name's first word without its last letter, so «Брен» finds «Брену» and «Торва» finds «Торвы». */
function stemOf(name: string): string | undefined {
  const word = name.trim().split(/\s+/)[0]?.toLocaleLowerCase() ?? "";
  if (word.length < 3) return undefined;
  return word.length > 3 ? word.slice(0, -1) : word;
}
