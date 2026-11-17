// Names you can click (AGT-107, allies-in-fights design §6.1 and §6.2): who the human's character
// knows, from their own state; which words in the story name one of them (rule N1: a listed form
// only); the person card, "what your character knows", in one view for here, elsewhere, a
// companion, heard of, unconscious and dead; and the `/кто` lists. Pure and with no model call
// (rule N8), so every card state is tested without a terminal.
import type { HealthBand, State } from "@nat20-table/engine-client";
import type { Language } from "../agents/language.ts";
import { lineKey, type PeopleBook, type SeatNames } from "../table/seat-lines.ts";

/** Where a person stands for the viewer. */
export type PersonState = "here" | "elsewhere" | "companion" | "heard" | "unconscious" | "dead";

/** One person the viewer knows, in the run's language. */
export interface Person {
  id: string;
  /** How the seat names them. */
  name: string;
  /** Every listed form of the name: the only words the story underlines (rule N1). */
  forms: string[];
  state: PersonState;
  look?: string;
  /** What is said of someone only heard of. */
  heard?: string;
  /** What they remember of the viewer's doings, newest first (rule N6). */
  remembers: string[];
  /** The health band, for someone in the scene. */
  health?: HealthBand;
  /** Where the viewer last saw them, as the seat names the place. */
  lastSeen?: string;
  /** Whether they stand in the scene now. */
  inScene?: boolean;
}


/**
 * Everyone the viewer knows, in the order the `/кто` lists show them: companions, then the people
 * met and heard of in the world file's order. The book is the one `names` carries.
 */
export function peopleOf(state: State, names: SeatNames, book: PeopleBook = names.people): Person[] {
  if (state.view !== "player") return [];
  const ru = names.language === "ru";
  // The run-language line by person and line (0067): two people can share an English line.
  const line = (id: string, en: string) => (ru ? (book.lines.get(lineKey(id, en)) ?? en) : en);
  const inScene = new Map(state.others.map((c) => [c.handle, c.health]));
  const out: Person[] = [];
  for (const p of book.party) {
    if (p.handle === state.me.handle) continue;
    const look = ru ? (p.look_ru ?? p.look) : p.look;
    const health = inScene.get(p.handle);
    out.push({ id: p.handle, name: ru ? names.who(p.handle) : (p.names[0] ?? names.person(p.handle)), forms: [...p.names], state: "companion", ...(look ? { look } : {}), remembers: [], ...(health ? { health, inScene: true } : {}) });
  }
  for (const n of state.world?.npcs ?? []) {
    const health = inScene.get(n.id);
    const state_: PersonState = !n.alive ? "dead" : health === "down" ? "unconscious" : health ? "here" : "elsewhere";
    out.push({
      id: n.id,
      name: ru ? names.who(n.id) : (n.names?.[0] ?? n.name),
      forms: n.names ?? [],
      state: state_,
      ...(n.look ? { look: line(n.id, n.look) } : {}),
      // None on a dead person's card (rule N6).
      remembers: n.alive ? (n.remembers ?? []).map((r) => line(n.id, r)) : [],
      ...(health && n.alive ? { health } : {}),
      ...(health ? { inScene: true } : {}),
      ...(state_ !== "here" && state_ !== "unconscious" && n.last_seen ? { lastSeen: names.place(n.last_seen, state.world?.places.find((p) => p.id === n.last_seen)?.name) } : {}),
    });
  }
  for (const n of state.world?.heard ?? []) {
    out.push({ id: n.id, name: ru ? names.who(n.id) : (n.names?.[0] ?? n.name), forms: n.names ?? [], state: "heard", ...(n.heard ? { heard: line(n.id, n.heard) } : {}), remembers: [] });
  }
  return out;
}

/**
 * The dead as the story has told them (§6.2): until a line of the story names the dead person
 * after the death, they show as they were, lying in the scene or not here; «Нет в живых.» comes
 * only after the death's line.
 */
export function asTold(people: readonly Person[], told: (id: string) => boolean, alive: (id: string) => Person | undefined = () => undefined): Person[] {
  return people.map((p) => {
    if (p.state !== "dead" || told(p.id)) return p;
    // The engine drops a dead person's memories (rule N6); until the death is told the card keeps
    // what it showed alive, so it gives nothing away.
    const was = alive(p.id);
    const kept = { ...p, remembers: was?.remembers ?? p.remembers, ...(was?.lastSeen && !p.lastSeen ? { lastSeen: was.lastSeen } : {}) };
    if (p.inScene) {
      const { lastSeen: _, ...here } = kept;
      return { ...here, state: "unconscious", health: "down" };
    }
    return { ...kept, state: "elsewhere" };
  });
}

/** A piece of a story row: plain text, or a listed form of a person, underlined. */
export interface NameSpan {
  text: string;
  person?: string;
}

const LETTER = /[\p{L}\p{M}]/u;

/**
 * A row cut into spans where a word equals a listed form of someone the viewer knows (rule N1):
 * whole words only, the longest form first, case kept as listed.
 */
export function nameSpans(text: string, people: readonly Person[]): NameSpan[] {
  const forms = people.flatMap((p) => p.forms.filter((f) => f.length > 0).map((form) => ({ form, id: p.id }))).sort((a, b) => b.form.length - a.form.length);
  if (forms.length === 0) return [{ text }];
  const spans: NameSpan[] = [];
  let plain = "";
  let at = 0;
  while (at < text.length) {
    const before = at > 0 ? text[at - 1]! : "";
    const hit = LETTER.test(before)
      ? undefined
      : forms.find(({ form }) => text.startsWith(form, at) && !LETTER.test(text[at + form.length] ?? ""));
    if (hit) {
      if (plain) spans.push({ text: plain });
      plain = "";
      spans.push({ text: hit.form, person: hit.id });
      at += hit.form.length;
    } else {
      plain += text[at];
      at += 1;
    }
  }
  if (plain) spans.push({ text: plain });
  return spans;
}

/** The person card's words and the `/кто` lists', per language. */
export interface PeopleWords {
  here: string;
  elsewhere: string;
  lastSeen(place: string): string;
  companion: string;
  heard: string;
  dead: string;
  health: Record<HealthBand, string>;
  remembers: string;
  closes: string;
  unknown(name: string): string;
  lists: { companion: string; met: string; dead: string; heard: string };
  nobody: string;
}

export const PEOPLE_WORDS: Record<Language, PeopleWords> = {
  en: {
    here: "Here with you now.",
    elsewhere: "Not here now.",
    lastSeen: (place) => `Last seen at ${place}.`,
    companion: "Travels with you.",
    heard: "You have only heard this name.",
    dead: "No longer alive.",
    health: { unhurt: "No serious wounds to be seen.", bloodied: "Badly hurt, but still on their feet.", down: "Lying unconscious." },
    remembers: "Remembers",
    closes: "Esc closes",
    unknown: (name) => `The name “${name}” has not come up in the story yet. Here is who you know.`,
    lists: { companion: "With you", met: "You have met", dead: "No longer alive", heard: "Only heard of" },
    nobody: "You know nobody by name yet.",
  },
  ru: {
    here: "Сейчас рядом с вами.",
    elsewhere: "Сейчас не рядом.",
    lastSeen: (place) => `Последняя встреча: ${place}.`,
    companion: "Идёт с вами.",
    heard: "Вы только слышали это имя.",
    dead: "Нет в живых.",
    health: { unhurt: "Серьёзных ран не видно.", bloodied: "Тяжёлые раны, но ещё на ногах.", down: "Лежит без сознания." },
    remembers: "Помнит",
    closes: "Esc закрывает",
    unknown: (name) => `Имя «${name}» в рассказе пока не звучало. Вот кого вы знаете.`,
    lists: { companion: "С вами идут", met: "Вы встречали", dead: "Нет в живых", heard: "Только слышали" },
    nobody: "Пока вы никого не знаете по имени.",
  },
};

/** The person card, "what your character knows": the name, where they stand, and what the viewer has of them. */
export function personCard(p: Person, words: PeopleWords): string[] {
  const rows = [p.name];
  switch (p.state) {
    case "heard":
      rows.push(words.heard, ...(p.heard ? [p.heard] : []));
      break;
    case "dead":
      rows.push(words.dead, ...(p.look ? [p.look] : []));
      break;
    default:
      rows.push(p.state === "companion" ? words.companion : p.state === "elsewhere" ? words.elsewhere : words.here);
      if (p.lastSeen) rows.push(words.lastSeen(p.lastSeen));
      if (p.look) rows.push(p.look);
      if (p.health) rows.push(words.health[p.health]);
      for (const line of p.remembers) rows.push(`${words.remembers}: ${lower(line)}`);
  }
  rows.push(words.closes);
  return rows;
}

/** «Вы сами…» after «Помнит:» reads «вы сами…»; a line that starts with a name keeps it. */
function lower(line: string): string {
  return /^(Вы|Ваш|You|Your)(?![\p{L}])/u.test(line) ? line.charAt(0).toLowerCase() + line.slice(1) : line;
}

/** The `/кто` lists, each only when it has someone. */
export function whoLists(people: readonly Person[], words: PeopleWords): string[] {
  const of = (...states: PersonState[]) => people.filter((p) => states.includes(p.state)).map((p) => p.name);
  const lists: Array<[string, string[]]> = [
    [words.lists.companion, of("companion")],
    [words.lists.met, of("here", "elsewhere", "unconscious")],
    [words.lists.dead, of("dead")],
    [words.lists.heard, of("heard")],
  ];
  const rows = lists.filter(([, names]) => names.length > 0).map(([title, names]) => `${title}: ${names.join(", ")}.`);
  return rows.length > 0 ? rows : [words.nobody];
}

/**
 * `/кто <имя>`: the person a typed name names (any listed form, or the seat's name, in any case),
 * or the line saying the name has not come up, with the lists. No name: the lists.
 */
export function whoAnswer(query: string, people: readonly Person[], words: PeopleWords): { person: Person } | { rows: string[] } {
  const asked = query.trim();
  if (!asked) return { rows: whoLists(people, words) };
  const key = asked.toLocaleLowerCase();
  const person = people.find((p) => p.name.toLocaleLowerCase() === key || p.forms.some((f) => f.toLocaleLowerCase() === key));
  return person ? { person } : { rows: [words.unknown(asked), ...whoLists(people, words)] };
}

/**
 * Whose underlined name stands at `column` (from 0) of a story row, if any (AGT-108). A column is
 * a code point: the table's Latin and Cyrillic take one cell each, a double-width character would not.
 */
export function nameAt(text: string, column: number, people: readonly Person[]): string | undefined {
  let at = 0;
  for (const span of nameSpans(text, people)) {
    at += [...span.text].length;
    if (column < at) return span.person;
  }
  return undefined;
}
