// The window's screen as one pure function (AGT-142, Glass Table design §5.1): every message the
// host sends goes through `reduce`, and what comes out is all the page draws. No DOM, no clock, no
// network: a recorded `seat-wire.jsonl` replayed through it gives the exact screen at any `seq`.
// It keeps the terminal seat's rules (game/src/ui/ink-seat.ts): other characters' engine lines wait
// for the narration that tells them and become its roll tokens, `unnarrated`, an ask and the kinds in
// RELEASES show them as they are; the human's own line shows at once and its roll takes the stage
// first; nobody is shown dead before the story has told it (`asTold`). Every line is laid out by the
// terminal's own `eventLines`, so the page composes no sentence of its own.
import type { Event } from "@nat20-table/engine-client";
import type { HumanPrompt, TableEvent } from "../table/types.ts";
import { UI_WORDS, SEAT_WORDS, type UiWords } from "../table/words.ts";
import { eventLines, speakerOf, type Line, type Tone } from "../ui/lines.ts";
import { asTold, nameSpans, type Person } from "../ui/people.ts";
import type { HostMessage } from "../seat-wire/messages.ts";

/** A roll the seat was shown: the engine's player view, never a target number (Rule 3). */
export interface RollToken {
  id: string;
  /** Who rolled, as the seat names them. */
  roller: string;
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

/** One row of the story column. */
export interface StoryLine {
  id: number;
  tone: Tone;
  text: string;
  /** The roll tokens drawn in it: a narration's rolls, or the roll of an engine line. */
  rolls: string[];
  /** The human's own words, echoed. */
  said?: true;
}

type Options = Extract<TableEvent, { kind: "options" }>;
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
  held: Array<Line & { roll?: string }>;
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
  /** Options of the list before that the engine now lists as not open, each with why (design §5.1: a spent move leaves the dock with one line). */
  spent: Array<{ option: string; name: string; message: string }>;
  reaction?: Reaction;
  question?: string;
  /** Why the engine refused the last decision, over the moves until the next list. */
  refusal?: string;
  /** A command's answer laid over the story (/sheet, /where, /log, /usage). */
  overlay?: { title: string; text: string; data?: Extract<TableEvent, { kind: "info" }>; n: number };
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
  /** The speaker of the message the last row belongs to. */
  speaker?: string;
  next: number;
}

export const EMPTY: PageView = { seq: 0, story: [], held: [], rolls: {}, dock: { form: "waiting" }, spent: [], people: [], answering: false, told: [], untold: [], alive: {}, sawPeople: false, looked: 0, next: 0 };

/** The kinds that show the held engine lines above them; a narration tells them instead (ink-seat.ts RELEASES). */
const RELEASES = new Set<TableEvent["kind"]>(["options", "reaction", "question", "end"]);
/** A command's answers, shown over the story. */
const OVERLAYS = new Set((["en", "ru"] as const).flatMap((l) => [SEAT_WORDS[l].sheet, SEAT_WORDS[l].where, SEAT_WORDS[l].log, SEAT_WORDS[l].usage]));
const REFUSED = new Set([SEAT_WORDS.en.notAccepted, SEAT_WORDS.ru.notAccepted]);
/** The tones whose rows tell a death (ink-seat.ts TELLING). */
const TELLING = new Set<Tone>(["dm", "speech", "engine", "status", "end"]);

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
      const next = { ...r, ask: { id: message.id, prompt }, sent: undefined, ...(turnOver ? { options: undefined } : {}), suggest: undefined };
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

function words(view: PageView): UiWords {
  return UI_WORDS[view.hello?.language ?? "en"];
}

/** How the seat labels a character: the host's names, else the handle as the terminal shows it. */
function namer(view: PageView): (handle: string) => string {
  const names = view.hello?.names ?? {};
  return (handle) => names[handle] ?? handle.charAt(0).toUpperCase() + handle.slice(1);
}

function linesOf(view: PageView, event: TableEvent, continued = false): Line[] {
  return eventLines(event, view.hello?.handle, continued, words(view), namer(view));
}

function shown(v: PageView, event: TableEvent): PageView {
  if (RELEASES.has(event.kind)) v = release(v);
  switch (event.kind) {
    case "said": {
      // The human's answer as the terminal echoes it. What it settles leaves the dock; a command leaves it standing.
      // Out of a fight a pick or words answer the list; in a fight it stays until the turn ends.
      const kind = event.intent.kind;
      const settles = kind !== "command";
      const done = v.options && !v.options.budget && v.ask?.prompt.kind !== "pick" && (kind === "option" || kind === "text");
      const next = add(
        { ...v, ...(settles ? { reaction: undefined, question: undefined, refusal: undefined, overlay: undefined } : {}), ...(done ? { options: undefined } : {}) },
        [{ tone: "prompt", text: `> ${event.text}` }],
        true,
      );
      return { ...answered(next), sent: undefined };
    }
    case "situation":
      // The panel frame waits for the narration of the step before it, or for the next decision.
      // A turn block the frame shows is over goes at once.
      return { ...v, frame: event, ...(endsTurn(v, event) ? { options: undefined } : {}) };
    case "options": {
      const spent = spentMoves(v.options, event);
      const next = { ...v, options: event, spent, refusal: undefined };
      return { ...next, dock: dockFor(next) };
    }
    case "engine": {
      const roll = rollOf(event, v);
      const rolls = roll ? { ...v.rolls, [roll.id]: roll } : v.rolls;
      // The token goes on the event's first row only.
      const lines = linesOf(v, event).map((l, i) => ({ ...l, ...(event.roll && i === 0 ? { roll: event.roll } : {}) }));
      // The human's own line shows at once, its roll on the stage first; others' wait for their narration.
      if (event.own) return { ...add({ ...v, rolls }, lines), ...(roll && roll.d20.length > 0 ? { stage: roll.id } : {}) };
      return { ...v, rolls, held: [...v.held, ...lines] };
    }
    case "narration": {
      // The lines it narrates go nowhere: the narration tells them, and their rolls are its tokens.
      const told = new Set([...(event.rolls ?? []), ...v.held.flatMap((l) => (l.roll ? [l.roll] : []))]);
      const next = message({ ...v, held: [], preview: undefined }, event, [...told].filter((id) => id in v.rolls));
      return release(next);
    }
    case "info":
      if (OVERLAYS.has(event.title)) return { ...v, overlay: { title: event.title, text: event.text, data: event, n: (v.overlay?.n ?? 0) + 1 } };
      if (REFUSED.has(event.title)) return { ...v, refusal: event.text };
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
      const next = add({ ...v, overlay: undefined, reaction: undefined, question: undefined, ask: undefined }, linesOf(v, event));
      return { ...next, dock: { form: "ended", text: event.text } };
    }
  }
  if (speakerOf(event) !== undefined) return message(v, event, []);
  return add(v, linesOf(v, event));
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
    label: r.label,
    kind: r.kind,
    d20: r.dice.filter((d) => d.dice.endsWith("d20")).flatMap((d) => d.results),
    total: r.total,
    outcome: r.outcome,
    text: event.text,
    own: event.own === true,
  };
}

/** A message: on the row above when the speaker is the same. */
function message(v: PageView, event: TableEvent, rolls: string[]): PageView {
  const speaker = speakerOf(event);
  const continued = speaker === v.speaker;
  const next = print(v, linesOf(v, event, continued), !continued, rolls);
  return { ...next, speaker };
}

/** Rows that are not a message's: they end the message above, after a blank row. */
function add(v: PageView, lines: Array<Line & { roll?: string }>, said = false): PageView {
  if (lines.length === 0) return v;
  return { ...print(v, lines, v.speaker !== undefined, [], said), speaker: undefined };
}

function print(v: PageView, lines: Array<Line & { roll?: string }>, gap: boolean, rolls: string[], said = false): PageView {
  if (lines.length === 0) return v;
  const blank = gap && v.story.length > 0 && v.story.at(-1)!.text !== "" ? [{ tone: "status" as const, text: "" }] : [];
  let next = v.next;
  const rows: StoryLine[] = [...blank, ...lines].map((line, i) => ({
    id: next++,
    tone: line.tone,
    text: line.text,
    rolls: "roll" in line && line.roll ? [line.roll] : i === blank.length ? rolls : [],
    ...(said ? { said: true as const } : {}),
  }));
  let out: PageView = { ...v, story: [...v.story, ...rows], next };
  // A row that names a dead person after the death tells it: their card says so from now on.
  if (v.untold.length > 0) {
    const people = v.situation?.situation?.people ?? [];
    const told = v.untold.filter((id) => {
      const p = people.find((q) => q.id === id);
      return p !== undefined && tells(lines, p);
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
  return { ...next, people: peopleNow(next) };
}

/** A fresh frame shows the human's fight turn over while its turn block stands (panel.ts `endsTurn`, kept here: panel.ts reads the palette file). */
function endsTurn(v: PageView, event: Situation): boolean {
  const s = event.situation;
  return v.options?.budget !== undefined && s !== undefined && (s.mode !== "combat" || s.turn !== v.hello?.handle);
}

function peopleNow(v: PageView): Person[] {
  return asTold(v.situation?.situation?.people ?? [], (id) => v.told.includes(id), (id) => v.alive[id]);
}

function tells(lines: ReadonlyArray<{ tone: Tone; text: string }>, p: Person): boolean {
  return lines.some((line) => TELLING.has(line.tone) && nameSpans(line.text, [p]).some((span) => span.person));
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
