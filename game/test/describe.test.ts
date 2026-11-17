// AGT-127 (allies-in-fights design §6.3, §11 row 8): the person card's look in the hero's words,
// with no model: rules N9 and N10, the authored line until a checked one is ready, and only `look`
// reworded, `heard` and `remembers` shown as authored.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { State } from "@nat20-table/engine-client";
import { Describer, describedLine, describePrompt } from "../src/agents/describe.ts";
import type { SessionConfig } from "../src/agents/sdk-session.ts";
import { described } from "../src/table/loop.ts";
import { SeatNames } from "../src/table/seat-lines.ts";
import type { Person } from "../src/ui/people.ts";
import { UsageLimitReached } from "../src/errors.ts";
import { StandIn } from "./stand-in.ts";

const LOOK = "Пастушка; у каждой её овцы есть имя.";

test("a rewording shows only if it keeps to rules N9 and N10", () => {
  const ok = (line: string, source = LOOK, known: string[] = []) => describedLine(source, line, "ru", known);
  assert.ok(ok("Пастушка, которая знает по имени каждую свою овцу."));
  // N9: no first-person word, no advice or verdict.
  assert.ok(!ok("Я вижу пастушку, у каждой овцы которой есть имя."));
  assert.ok(!ok("Пастушка; ей, кажется, можно доверять."));
  // N10: no number; no name or place the source lacks; no capitalised word inside a sentence.
  assert.ok(!ok("Пастушка; у её двадцати овец есть имена."));
  assert.ok(!ok("Пастушка; у её 20 овец есть имена."));
  assert.ok(!ok("Пастушка из Хайстедса; у каждой овцы есть имя.", LOOK, ["Хайстедс", "Хайстедса"]));
  assert.ok(!ok("Пастушка; каждую овцу она зовёт, как Марта."));
  // The person's gender, and «вы» or «ваш отряд», kept.
  assert.ok(!ok("Пастух; у каждой его овцы есть имя."));
  assert.ok(!ok("Он помнит, что кто-то накормил его собаку.", "Вы сами накормили её собаку."));
  assert.ok(!ok("Она помнит, что собаку кормил отряд.", "Вы сами накормили её собаку."));
  // At most half again as long, one line, and not the same line.
  assert.ok(!ok(`${LOOK} ${LOOK}`));
  assert.ok(!ok("Пастушка.\nОвцы."));
  assert.ok(!ok(LOOK));
  assert.ok(describedLine("A shepherd with a name for every sheep.", "A shepherd who knows each of her sheep by name.", "en"));
  assert.ok(!describedLine("A shepherd with a name for every sheep.", "I think this shepherd names every sheep.", "en"));
});

function describer(answer: (line: string) => Promise<string>, opened: SessionConfig[] = []) {
  return new Describer({
    handle: "bren",
    card: "Bren, a hired blade who notices hands and boots.",
    language: "ru",
    open: (config) => {
      opened.push(config);
      return new StandIn<string>(config, async (_wake, _call, message) => answer(message));
    },
  });
}

test("the authored line shows until a checked rewording is ready, then the rewording, each once in the transcript", async () => {
  const opened: SessionConfig[] = [];
  const shown: unknown[] = [];
  const d = describer(async () => "Пастушка, которая знает по имени каждую свою овцу.", opened);
  d.onShown = (pair) => shown.push(pair);
  assert.equal(d.shown("shepherd_gwyn", LOOK), LOOK, "written ahead: the authored line first");
  await d.settled();
  assert.equal(d.shown("shepherd_gwyn", LOOK), "Пастушка, которая знает по имени каждую свою овцу.");
  assert.equal(d.shown("shepherd_gwyn", LOOK), "Пастушка, которая знает по имени каждую свою овцу.");
  assert.deepEqual(shown, [{ person: "shepherd_gwyn", authored: LOOK, shown: "Пастушка, которая знает по имени каждую свою овцу." }]);
  // One session, tool-less, the describe role; no second call for the same line.
  assert.equal(opened.length, 1);
  assert.deepEqual([opened[0]!.agent, opened[0]!.role, opened[0]!.tools.length, opened[0]!.turnTimeoutMs], ["describe:bren", "describe", 0, 5_000]);
  assert.match(describePrompt("bren", "card", "ru"), /In Russian/);
});

test("a rewording that fails the check, or a failed call, keeps the authored line for the run", async () => {
  const bad = describer(async () => "Я вижу пастушку и двадцать овец.");
  bad.shown("shepherd_gwyn", LOOK);
  await bad.settled();
  assert.equal(bad.shown("shepherd_gwyn", LOOK), LOOK);
  let calls = 0;
  const failing = describer(async () => {
    calls++;
    throw new Error("timed out");
  });
  failing.shown("shepherd_gwyn", LOOK);
  await failing.settled();
  assert.equal(failing.shown("shepherd_gwyn", LOOK), LOOK);
  await failing.settled();
  assert.equal(calls, 1, "a failed line is not asked again");
  // The plan's limit: no throw out of the card, and no more calls.
  let limited = 0;
  const limit = describer(async () => {
    limited++;
    throw new UsageLimitReached(undefined);
  });
  limit.shown("shepherd_gwyn", LOOK);
  limit.shown("osric_hale", "The headman of Wendford.");
  await limit.settled();
  limit.shown("tam", "A boy with a painted cart.");
  await limit.settled();
  assert.equal(limited, 1);
});

test("the lines are written one at a time, in the order they show", async () => {
  let open = 0;
  let most = 0;
  const d = describer(async () => {
    most = Math.max(most, ++open);
    await new Promise((resolve) => setTimeout(resolve, 5));
    open--;
    return "Пастушка, которая знает по имени каждую свою овцу.";
  });
  d.shown("a", LOOK);
  d.shown("b", LOOK);
  d.shown("c", LOOK);
  await d.settled();
  assert.equal(most, 1);
});

test("only look is reworded: heard and remembers show as authored (design §16 item 8)", async () => {
  const d = describer(async (line) => (line === LOOK ? "Пастушка, которая знает по имени каждую свою овцу." : "Подменённая строка."));
  const people: Person[] = [
    { id: "shepherd_gwyn", name: "Гвин", forms: ["Гвин"], state: "elsewhere", look: LOOK, remembers: ["Вы сами накормили её собаку на речной дороге."] },
    { id: "rufus", name: "Руфус", forms: ["Руфус"], state: "heard", heard: "Говорят, он скупает урожай на бумаге ещё до ярмарки.", remembers: [] },
  ];
  const state = { view: "player", world: { places: [{ id: "highsteads", name: "Highsteads" }] } } as unknown as State;
  const names = new SeatNames("ru", new Map([["highsteads", "Хайстедс"]]));
  described(people, state, names, d);
  await d.settled();
  const after = described(people, state, names, d);
  assert.equal(after[0]!.look, "Пастушка, которая знает по имени каждую свою овцу.");
  for (const [i, p] of people.entries()) {
    assert.deepEqual(after[i]!.remembers, p.remembers, "each remembers line as authored");
    assert.equal(after[i]!.heard, p.heard, "the heard line as authored");
  }
});
