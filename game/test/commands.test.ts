// The slash-command picker (TASKS.md AGT-82): which commands a draft names, and the rows it draws.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMAND_ENTRIES, commandMatches, pickerRows, PICKER_TITLE } from "../src/ui/commands.ts";
import { COMMAND_HELP } from "../src/ui/input.ts";

const names = (draft: string) => commandMatches(draft)?.map((entry) => entry.name);
const text = (row: { text: string }[]) => row.map((span) => span.text).join("");

test("a bare slash names every command, /options and /sheet first, with the words /help shows", () => {
  assert.deepEqual(names("/"), Object.keys(COMMAND_HELP));
  assert.deepEqual(names("/")?.slice(0, 2), ["options", "sheet"]);
  assert.equal(COMMAND_ENTRIES.find((entry) => entry.name === "sheet")?.what, COMMAND_HELP.sheet);
});

test("letters after the slash narrow the list by the start of the name, in any case", () => {
  assert.deepEqual(names("/opt"), ["options"]);
  assert.deepEqual(names("/OPT"), ["options"]);
  assert.deepEqual(names("/p"), ["pause", "panel"]);
  assert.deepEqual(names("/?"), ["help"]);
  assert.deepEqual(names("/xyz"), []);
});

test("no picker for words, a space after the name, or an empty line", () => {
  assert.equal(commandMatches(""), undefined);
  assert.equal(commandMatches("I look /sheet"), undefined);
  assert.equal(commandMatches("/sheet now"), undefined);
});

test("the rows: the title with its keys, the lit command marked ❯, the names in one column", () => {
  const rows = pickerRows("/", commandMatches("/")!.slice(0, 3), 1);
  assert.equal(text(rows[0]), PICKER_TITLE);
  assert.equal(text(rows[1]), `  /options  ${COMMAND_HELP.options}`);
  assert.equal(text(rows[2]), `❯ /sheet    ${COMMAND_HELP.sheet}`);
  const all = commandMatches("/")!;
  const long = [...pickerRows("/", all, 0, all.length), ...pickerRows("/", all, 0, 4)];
  assert.ok(long.every((row) => [...text(row)].length <= 72), "every row, the title with its count too, fits the 72-column measure");
});

test("a long list shows a window round the cursor and says how many there are", () => {
  const all = commandMatches("/")!;
  const top = pickerRows("/", all, 0, 4);
  assert.equal(top.length, 5);
  assert.match(text(top[0]), new RegExp(`\\(4 of ${all.length}\\)$`));
  const last = pickerRows("/", all, all.length - 1, 4);
  assert.match(text(last.at(-1)!), new RegExp(`^❯ /${all.at(-1)!.name} `));
});

test("with no match, one dim row says so and points to /help", () => {
  assert.deepEqual(pickerRows("/xyz", [], 0).map(text), ["No command starts with /xyz. /help lists them all."]);
});
