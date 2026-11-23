// Seat wires for the page's tests that the recorded fixtures do not hold (AGT-142). The recorded
// runs were played by the scripted Narrator, whose narration tells no roll; a live table's Narrator
// tells a round in one paragraph and its rolls become tokens in it. `narratedFight` is the Russian
// fixture to the human's first fight turn with one such paragraph and one line of party talk
// written in before the list: every other line is the recorded run's.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { choiceLines, type Choice } from "../src/table/choices.ts";
import type { HumanPrompt, TableEvent } from "../src/table/types.ts";
import { SEAT_WORDS } from "../src/table/words.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** The narration written into the fight: each sentence names who rolls in it. */
export const NARRATION =
  "Ильза первой вскидывает руку, и огненная искра проносится мимо второго гоблина. Первый гоблин рубит Брена саблей, но клинок соскальзывает. Второй гоблин бьёт точнее: сабля входит Брену в плечо. Торва без оружия обрушивается на первого гоблина, а луч Марен добивает его.";
export const TALK = "Брен, держись за мной, второго я возьму сама.";

export function narratedFight(): string {
  const records = readFileSync(path.join(FIXTURES, "the-way-back-ru.seat-wire.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { seq?: number; event?: { kind: string; roll?: string; own?: boolean }; message?: { type: string; prompt?: { kind: string } } });
  const ask = records.findIndex((r) => r.message?.type === "ask" && r.message.prompt?.kind === "combat_turn");
  let list = ask;
  while (list > 0 && records[list].event?.kind !== "options") list--;
  // The rolls the narration tells: every other character's roll since the fight began, as a live Narrator's would.
  const start = records.findIndex((r) => (r.event as { event?: { kind?: string } } | undefined)?.event?.kind === "combat_started");
  const rolls = records.slice(start, list).flatMap((r) => (r.event?.kind === "engine" && r.event.roll && !r.event.own ? [r.event.roll] : []));
  const seq = records[list].seq!;
  const written = [
    { seq, event: { kind: "narration", speaker: "dm", text: NARRATION, rolls } },
    { seq: seq + 1, event: { kind: "speech", speaker: "ilsa", text: TALK, to: "bren" } },
  ];
  const after = records.slice(list, ask + 1).map((r) => (r.seq !== undefined ? { ...r, seq: r.seq + 2 } : r));
  return [...records.slice(0, list), ...written, ...after].map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/** The names a live host sends at `hello` for the Russian fixture's party. */
export const NAMES_RU: Record<string, string> = { bren: "Брен", torva: "Торва", maren: "Марен", ilsa: "Ильза" };


/** One line of a seat wire as the host writes it: an event with its number, or a message. */
export type WireRecord = { seq?: number; seat?: string; event?: unknown; message?: unknown };

/** Every kind of ask the loop can put to the human (`HumanPrompt`), to check a wire against. */
export const ASK_KINDS: ReadonlyArray<HumanPrompt["kind"]> = ["combat_turn", "reaction", "explore", "answer", "pick", "paused", "surrender", "card", "level_up", "road"];

/**
 * A seat wire that holds every kind of ask (AGT-153). The recorded Russian run holds four of them
 * (a card, words out of a fight, a fight turn, a pick); the scripted table never reaches the other
 * six, so they are written in here before the run's end, each as the loop shows it
 * (game/src/table/loop.ts): the same event kinds, the loop's own words (`SEAT_WORDS`) and
 * `choiceLines`. The events are typed as `TableEvent`, so a change to the host's types fails here.
 * They are lines to be pressed on, not a story: the recorded run's own lines are untouched.
 */
export function everyAsk(): WireRecord[] {
  const records = readFileSync(path.join(FIXTURES, "the-way-back-ru.seat-wire.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as WireRecord);
  const end = records.map((r) => (r.event as { kind?: string } | undefined)?.kind).lastIndexOf("end");
  const w = SEAT_WORDS.ru;
  // A list with a preset shows its mark on that line only, as the loop writes it (AGT-101).
  const list = (title: string, choices: Choice[], preset?: number, mark = false): TableEvent => ({
    kind: "options",
    title,
    lines: choiceLines(choices.map((c) => (mark && c.number === preset ? { ...c, label: `${c.label} ${w.marked}` } : c))),
    choices,
    ...(preset !== undefined ? { preset } : {}),
  });
  const written: Array<TableEvent | HumanPrompt["kind"]> = [
    // Two answers on offer: the page and the chrome state show each (design §5).
    { kind: "reaction", summary: "можно ответить: гоблин 1.", options: ["Удар длинным мечом", "Удар щитом"] },
    "reaction",
    { kind: "question", text: "Гоблин бросает нож и поднимает руки. Что Брен с ним делает?" },
    "answer",
    { kind: "status", text: w.pausedWait },
    "paused",
    list(w.surrender, [
      { number: 1, label: w.acceptSurrender("гоблин 1") },
      { number: 2, label: w.fightOn },
    ]),
    "surrender",
    list(
      w.levelTitle(3, "выбор", undefined),
      [
        { number: 1, label: "Мастер боя" },
        { number: 2, label: "Чемпион" },
      ],
      1,
    ),
    "level_up",
    list(
      w.theRoad,
      [
        { number: 1, label: "Ехать дальше" },
        { number: 2, label: w.notYet },
      ],
      1,
      true,
    ),
    "road",
  ];
  let seq = (records[end].seq ?? 0) - 1;
  let asks = 0;
  const block = written.map((x): WireRecord => (typeof x === "string" ? { seat: "bren", message: { type: "ask", id: `x${++asks}`, prompt: { kind: x } } } : { seq: ++seq, seat: "bren", event: x }));
  return [...records.slice(0, end), ...block, { ...records[end], seq: seq + 1 }, ...records.slice(end + 1)];
}
