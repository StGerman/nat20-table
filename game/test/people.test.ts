// AGT-107 (allies-in-fights design §6.1, §6.2, §11 row 7): who the human's character knows, the
// underlined names, the person card in each state, and `/кто`, with no model and no terminal.
import assert from "node:assert/strict";
import test from "node:test";
import type { State } from "@nat20-table/engine-client";
import { readLine } from "../src/ui/input.ts";
import { asTold, nameSpans, PEOPLE_WORDS, peopleOf, personCard, whoAnswer, whoLists } from "../src/ui/people.ts";
import { lineKey, SeatNames } from "../src/table/seat-lines.ts";

const book = {
  lines: new Map([
    [lineKey("shepherd_gwyn", "A shepherd with a name for every sheep."), "Пастушка; у каждой её овцы есть имя."],
    [lineKey("shepherd_gwyn", "You fed her dog on the river road."), "Вы сами накормили её собаку на речной дороге."],
    // The same English line for another person, in another gender, stays theirs.
    [lineKey("odda_vell", "You fed her dog on the river road."), "Вы сами накормили её пса на речной дороге."],
    [lineKey("rufus", "They say he buys the harvest on paper."), "Говорят, он скупает урожай на бумаге ещё до ярмарки."],
    [lineKey("osric_hale", "The headman of Wendford."), "Староста Вендфорда."],
  ]),
  party: [
    { handle: "bren", names: ["Bren", "Брен"] },
    { handle: "torva", names: ["Torva", "Торва"], look: "A broad woman with an axe.", look_ru: "Широкая женщина с топором." },
  ],
};
const ru = new SeatNames("ru", new Map([["torva", "Торва"], ["shepherd_gwyn", "Гвин"], ["osric_hale", "Осрик Хейл"], ["odda_vell", "Одда"], ["rufus", "Руфус"], ["tam", "Тэм"], ["highsteads", "Хайстедс"]]), book);

/** Bren's own state: Torva and Osric in the scene, Tam down there, Gwyn met elsewhere, Odda dead, Rufus heard of. */
function state(): State {
  return {
    view: "player",
    me: { handle: "bren" },
    others: [
      { handle: "torva", health: "bloodied" },
      { handle: "osric_hale", health: "unhurt" },
      { handle: "tam", health: "down" },
    ],
    world: {
      places: [{ id: "highsteads", name: "Highsteads" }],
      npcs: [
        { id: "shepherd_gwyn", name: "Gwyn the shepherd", names: ["Gwyn", "Гвин"], alive: true, last_seen: "highsteads", look: "A shepherd with a name for every sheep.", remembers: ["You fed her dog on the river road."] },
        { id: "osric_hale", name: "Osric Hale", names: ["Osric", "Осрик", "Осрика"], alive: true, look: "The headman of Wendford." },
        { id: "tam", name: "Tam", names: ["Tam", "Тэм"], alive: true },
        { id: "odda_vell", name: "Odda Vell", names: ["Odda", "Одда", "Одды"], alive: false, remembers: ["You fed her dog on the river road."] },
      ],
      heard: [{ id: "rufus", name: "Rufus", names: ["Rufus", "Руфус"], heard: "They say he buys the harvest on paper." }],
    },
  } as unknown as State;
}

test("who the character knows: companions, the people met where they stand, the dead, and those heard of", () => {
  const people = peopleOf(state(), ru);
  assert.deepEqual(
    people.map((p) => [p.id, p.state]),
    [["torva", "companion"], ["shepherd_gwyn", "elsewhere"], ["osric_hale", "here"], ["tam", "unconscious"], ["odda_vell", "dead"], ["rufus", "heard"]],
  );
  // A dead person's card carries no memories (rule N6).
  assert.deepEqual(people.find((p) => p.id === "odda_vell")!.remembers, []);
});

test("each state's card, in the run's language", () => {
  const w = PEOPLE_WORDS.ru;
  const card = (id: string) => personCard(peopleOf(state(), ru).find((p) => p.id === id)!, w);
  assert.deepEqual(card("shepherd_gwyn"), ["Гвин", "Сейчас не рядом.", "Последняя встреча: Хайстедс.", "Пастушка; у каждой её овцы есть имя.", "Помнит: вы сами накормили её собаку на речной дороге.", "Esc закрывает"]);
  assert.deepEqual(card("osric_hale"), ["Осрик Хейл", "Сейчас рядом с вами.", "Староста Вендфорда.", "Серьёзных ран не видно.", "Esc закрывает"]);
  assert.deepEqual(card("tam"), ["Тэм", "Сейчас рядом с вами.", "Лежит без сознания.", "Esc закрывает"]);
  assert.deepEqual(card("torva"), ["Торва", "Идёт с вами.", "Широкая женщина с топором.", "Тяжёлые раны, но ещё на ногах.", "Esc закрывает"]);
  assert.deepEqual(card("odda_vell"), ["Одда", "Нет в живых.", "Esc закрывает"]);
  assert.deepEqual(card("rufus"), ["Руфус", "Вы только слышали это имя.", "Говорят, он скупает урожай на бумаге ещё до ярмарки.", "Esc закрывает"]);
  // An English seat reads the engine's own lines.
  const en = personCard(peopleOf(state(), new SeatNames("en", new Map(), book)).find((p) => p.id === "shepherd_gwyn")!, PEOPLE_WORDS.en);
  assert.deepEqual(en, ["Gwyn", "Not here now.", "Last seen at Highsteads.", "A shepherd with a name for every sheep.", "Remembers: you fed her dog on the river road.", "Esc closes"]);
  // A companion on an English seat is named as the pack names them, not by handle.
  assert.equal(personCard(peopleOf(state(), new SeatNames("en", new Map(), book)).find((p) => p.id === "torva")!, PEOPLE_WORDS.en)[0], "Torva");
});

test("the dead show as they were until the story tells the death", () => {
  const people = peopleOf(state(), ru);
  const before = asTold(people, () => false).find((p) => p.id === "odda_vell")!;
  assert.equal(before.state, "elsewhere");
  // Until then her card keeps what it showed while she lived, so it gives nothing away.
  const alive = { ...people.find((p) => p.id === "odda_vell")!, state: "elsewhere" as const, remembers: ["Вы сами накормили её пса на речной дороге."], lastSeen: "Хайстедс" };
  const kept = asTold(people, () => false, (id) => (id === "odda_vell" ? alive : undefined)).find((p) => p.id === "odda_vell")!;
  assert.deepEqual([kept.remembers, kept.lastSeen], [["Вы сами накормили её пса на речной дороге."], "Хайстедс"]);
  assert.equal(asTold(people, () => true).find((p) => p.id === "odda_vell")!.state, "dead");
});

test("only a listed form is underlined, as a whole word (rule N1)", () => {
  const people = peopleOf(state(), ru);
  assert.deepEqual(nameSpans("Осрика нет, а Осрик-младший и Гвиневра молчат; Гвин кивает.", people), [
    { text: "Осрика", person: "osric_hale" },
    { text: " нет, а " },
    { text: "Осрик", person: "osric_hale" },
    { text: "-младший и Гвиневра молчат; " },
    { text: "Гвин", person: "shepherd_gwyn" },
    { text: " кивает." },
  ]);
  assert.deepEqual(nameSpans("Никого.", []), [{ text: "Никого." }]);
});

test("/кто: a name opens its card, an unknown one says so, none lists everyone", () => {
  const people = peopleOf(state(), ru);
  const w = PEOPLE_WORDS.ru;
  assert.deepEqual(readLine("/кто Осрика", undefined), { kind: "who", name: "Осрика" });
  assert.deepEqual(readLine("/who", undefined), { kind: "who", name: "" });
  const found = whoAnswer("осрика", people, w);
  assert.ok("person" in found && found.person.id === "osric_hale");
  assert.deepEqual(whoLists(people, w), ["С вами идут: Торва.", "Вы встречали: Гвин, Осрик Хейл, Тэм.", "Нет в живых: Одда.", "Только слышали: Руфус."]);
  const unknown = whoAnswer("Гаррик", people, w);
  assert.ok("rows" in unknown);
  assert.equal(unknown.rows[0], "Имя «Гаррик» в рассказе пока не звучало. Вот кого вы знаете.");
  assert.deepEqual(whoAnswer("", [], w), { rows: ["Пока вы никого не знаете по имени."] });
});
