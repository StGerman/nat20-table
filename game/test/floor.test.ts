// Who takes the floor in a talk round (party talk §4.2, §4.3, TASKS.md AGT-32): the named players,
// what a raised hand says, and the speakers' order. Pure functions, no engine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { handAnswer, namedIn, speakingOrder, type Hand } from "../src/table/floor.ts";

const PLAYERS = ["torva", "maren", "ilsa"];
const NAMES = new Map([
  ["torva", ["torva", "Torva", "Торва", "Торвы", "Торве", "Торву", "Торвой"]],
  ["maren", ["maren", "Maren", "Марен"]],
  ["ilsa", ["ilsa", "Ilsa", "Ильса", "Ильсы", "Ильсе", "Ильсу", "Ильсой"]],
]);

test("a hand is SPEAK, BOTH, ACT with what the character does, or PASS, with an optional why", () => {
  assert.deepEqual(handAnswer("SPEAK"), { kind: "speak", why: "" });
  assert.deepEqual(handAnswer("both: I have a plan"), { kind: "both", why: "I have a plan" });
  assert.deepEqual(handAnswer("**PASS** — nothing to add"), { kind: "pass", why: "nothing to add" });
  assert.deepEqual(handAnswer('"SPEAK - she was asked"'), { kind: "speak", why: "she was asked" });
  assert.deepEqual(handAnswer("ACT: Ильса молча записывает имя.\nэто важно"), { kind: "act", intent: "Ильса молча записывает имя.", why: "это важно" });
  assert.deepEqual(handAnswer("Pass.\nThe others have it."), { kind: "pass", why: "The others have it." });
});

test("an answer that isn't one of the four, or an ACT with nothing to do, is unread", () => {
  assert.deepEqual(handAnswer("I think Torva should go first."), { kind: "unread", text: "I think Torva should go first." });
  assert.deepEqual(handAnswer("ACT:"), { kind: "unread", text: "ACT:" });
  assert.deepEqual(handAnswer("SPEAKING of which"), { kind: "unread", text: "SPEAKING of which" });
  assert.deepEqual(handAnswer(""), { kind: "unread", text: "" });
});

test("the human's line names a player in any case and any language, as a whole word", () => {
  assert.deepEqual(namedIn([{ text: "Скажи Торве, чтобы ждала." }], PLAYERS, NAMES), ["torva"]);
  assert.deepEqual(namedIn([{ text: "Ilsa, what does the sign say?" }], PLAYERS, NAMES), ["ilsa"]);
  assert.deepEqual(namedIn([{ text: "I read Ilsa's notes." }], PLAYERS, NAMES), ["ilsa"]);
  assert.deepEqual(namedIn([{ text: "Торвель стоит у ворот." }], PLAYERS, NAMES), []);
  // Earlier in the line goes first; a player missing from the names is matched by its handle.
  assert.deepEqual(namedIn([{ text: "Марен и Ильсу я беру с собой." }], PLAYERS, NAMES), ["maren", "ilsa"]);
  assert.deepEqual(namedIn([{ text: "torva, go." }], PLAYERS, new Map()), ["torva"]);
});

test("the DM's narration names only a player it speaks to, and the human's line goes first", () => {
  const dm = (text: string) => namedIn([{ text, addressOnly: true }], PLAYERS, NAMES);
  assert.deepEqual(dm("Двор пуст. Ильса, что ты видишь?"), ["ilsa"]);
  assert.deepEqual(dm("Осрик кивает: «Марен, хлеб твой?»"), ["maren"]);
  assert.deepEqual(dm("— Брен, Торва, за мной!"), ["torva"]);
  assert.deepEqual(dm("Староста хмурится. Что скажешь, Ильса."), ["ilsa"]);
  assert.deepEqual(dm("Бертил берёт хлеб у Марен, долго молчит."), []);
  assert.deepEqual(dm("Марен тоже подходит ближе, а Торва ждёт."), []);
  assert.deepEqual(dm("Ильсе он отвечает обстоятельно."), []);
  assert.deepEqual(
    namedIn([{ text: "Torva, the door." }, { text: "Ilsa, you see a sign.", addressOnly: true }], PLAYERS, NAMES),
    ["torva", "ilsa"],
  );
});

test("raised hands to speak go in seat order, turned by one each round; ACT and PASS take no floor", () => {
  const hands = new Map<string, Hand>([
    ["torva", { kind: "speak", why: "" }],
    ["maren", { kind: "act", intent: "Maren bandages Snitt.", why: "" }],
    ["ilsa", { kind: "both", why: "" }],
  ]);
  assert.deepEqual(speakingOrder(hands, PLAYERS, 0), ["torva", "ilsa"]);
  assert.deepEqual(speakingOrder(hands, PLAYERS, 1), ["ilsa", "torva"]);
  assert.deepEqual(speakingOrder(hands, PLAYERS, 2), ["ilsa", "torva"]);
  assert.deepEqual(speakingOrder(hands, PLAYERS, 3), ["torva", "ilsa"]);
  assert.deepEqual(speakingOrder(new Map(), PLAYERS, 0), []);
});
