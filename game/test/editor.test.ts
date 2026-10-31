// The human's input row as a line editor (M10 P6, TASKS.md AGT-48): the pure reducer, the key map,
// slash-command completion, and the row on a fake terminal: the hint as placeholder, a typed
// number lighting its option, mistakes on the row, and history.
import assert from "node:assert/strict";
import { test } from "node:test";
import { completeCommand, edit, editFor, EMPTY, type Draft, type Edit } from "../src/ui/editor.ts";
import { InkSeat, previewOption } from "../src/ui/ink-seat.ts";
import { readLine } from "../src/ui/input.ts";

const run = (start: Draft, ...edits: Edit[]) => edits.reduce(edit, start);
const at = (text: string, cursor = text.length): Draft => ({ text, cursor });

test("the editor inserts at the cursor, moves by character and word, and kills words and lines", () => {
  assert.deepEqual(run(EMPTY, { kind: "insert", text: "I hit" }, { kind: "left" }, { kind: "left" }, { kind: "insert", text: "x" }), at("I hxit", 4));
  assert.deepEqual(run(at("attack the goblin"), { kind: "word_left" }), at("attack the goblin", 11));
  assert.deepEqual(run(at("attack the goblin"), { kind: "word_left" }, { kind: "word_left" }), at("attack the goblin", 7));
  assert.deepEqual(run(at("attack the goblin", 0), { kind: "word_right" }), at("attack the goblin", 6));
  assert.deepEqual(run(at("attack the goblin  "), { kind: "kill_word" }), at("attack the ", 11));
  assert.deepEqual(run(at("attack the goblin", 7), { kind: "kill_line" }), at("the goblin", 0));
  assert.deepEqual(run(at("ab", 0), { kind: "backspace" }, { kind: "left" }), at("ab", 0));
  assert.deepEqual(run(at("ab"), { kind: "right" }, { kind: "home" }), at("ab", 0));
  assert.deepEqual(run(at("ab", 0), { kind: "end" }), at("ab", 2));
  assert.deepEqual(run(at("words"), { kind: "clear" }), EMPTY);
  // Control characters never reach the line.
  assert.deepEqual(run(EMPTY, { kind: "insert", text: "a\u0007b" }), at("ab"));
});

test("Tab completes a slash command, as far as the commands that match agree", () => {
  assert.equal(completeCommand("/sh"), "/sheet");
  assert.equal(completeCommand("/p"), "/pa");
  assert.equal(completeCommand("/pau"), "/pause");
  assert.equal(completeCommand("/zz"), "/zz");
  assert.equal(completeCommand("I /sh"), "I /sh");
  assert.deepEqual(run(at("/us"), { kind: "complete" }), at("/usage"));
});

test("keys map to edits as in a shell, and the rest are left alone", () => {
  assert.deepEqual(editFor("w", { ctrl: true }), { kind: "kill_word" });
  assert.deepEqual(editFor("u", { ctrl: true }), { kind: "kill_line" });
  assert.deepEqual(editFor("a", { ctrl: true }), { kind: "home" });
  assert.deepEqual(editFor("", { leftArrow: true, meta: true }), { kind: "word_left" });
  assert.deepEqual(editFor("f", { meta: true }), { kind: "word_right" });
  assert.deepEqual(editFor("", { delete: true }), { kind: "backspace" }, "most terminals send DEL for Backspace");
  assert.deepEqual(editFor("", { escape: true }), { kind: "clear" });
  assert.deepEqual(editFor("", { tab: true }), { kind: "complete" });
  assert.equal(editFor("x", { ctrl: true }), undefined);
  assert.deepEqual(editFor("Ярл", {}), { kind: "insert", text: "Ярл" });
});

test("a typed number names its option; words, or a number with no option, name none", () => {
  const lines = ["1. Longsword attack → goblin_3", "2. End turn", "12. Dodge"];
  assert.deepEqual(previewOption("2", lines), { number: 2, line: "2. End turn" });
  assert.deepEqual(previewOption("12", lines), { number: 12, line: "12. Dodge" });
  assert.equal(previewOption("3", lines), undefined);
  assert.equal(previewOption("I run", lines), undefined);
  assert.equal(previewOption("1", undefined), undefined);
});

test("a reaction takes да and нет as well as y and n", () => {
  assert.deepEqual(readLine("да", { kind: "reaction" }), { kind: "intent", intent: { kind: "reaction", take: true } });
  assert.deepEqual(readLine("Нет", { kind: "reaction" }), { kind: "intent", intent: { kind: "reaction", take: false } });
});

test("Ctrl+P and Ctrl+N bring back the lines entered before, and a mistake stays on the row", async () => {
  const seat = new InkSeat("bren");
  const first = seat.ask({ kind: "explore" });
  seat.type("I look around\r");
  await first;
  const second = seat.ask({ kind: "explore" });
  seat.type("/nope\r");
  assert.equal(seat.getView().draft, "/nope");
  assert.match(seat.getView().notice!.text, /^There is no \/nope/);
  assert.ok(!seat.getView().lines.some((l) => l.text.includes("There is no")));
  seat.edit({ kind: "clear" });
  seat.recall(-1);
  assert.deepEqual([seat.getView().draft, seat.getView().cursor], ["I look around", 13]);
  seat.recall(1);
  assert.equal(seat.getView().draft, "");
  seat.recall(-1);
  seat.enter();
  assert.deepEqual(await second, { kind: "text", text: "I look around" });
});
