// The terminal seat (M6 step 11, TASKS.md AGT-7): typed input to intents, events to screen lines,
// the Ink app on fake terminal streams, and the seat on the real loop and engine. Needs
// `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { buildChoices } from "../src/table/choices.ts";
import { TableLoop } from "../src/table/loop.ts";
import { yardDm, ScriptedPlayer } from "../src/table/scripted.ts";
import { InkSeat } from "../src/ui/ink-seat.ts";
import { readLine } from "../src/ui/input.ts";
import { eventLines } from "../src/ui/lines.ts";
import { formatSheet, type LegalActionsResult } from "../src/view.ts";
import { testTable } from "./helpers.ts";

/** A terminal's output as Ink writes it in debug mode: every frame whole. */
class FakeStdout extends EventEmitter {
  readonly columns = 120;
  readonly rows = 40;
  readonly frames: string[] = [];
  write = (frame: string): boolean => {
    this.frames.push(frame);
    return true;
  };
  get last(): string {
    return this.frames.at(-1) ?? "";
  }
}

/** A terminal's keyboard: each write is one chunk of keys. */
class FakeStdin extends EventEmitter {
  readonly isTTY = true;
  private data: string | null = null;
  press(keys: string): void {
    this.data = keys;
    this.emit("readable");
    this.emit("data", keys);
  }
  read = (): string | null => {
    const data = this.data;
    this.data = null;
    return data;
  };
  setEncoding(): void {}
  setRawMode(): void {}
  resume(): void {}
  pause(): void {}
  ref(): void {}
  unref(): void {}
}

function startOnFakeTerminal(seat: InkSeat): { stdin: FakeStdin; stdout: FakeStdout } {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  seat.start({
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: new FakeStdout() as unknown as NodeJS.WriteStream,
    debug: true,
    interactive: true,
    patchConsole: false,
  });
  return { stdin, stdout };
}

async function until(what: string, ready: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("typed lines become intents by what the table waits for", () => {
  const turn = { kind: "combat_turn" } as const;
  assert.deepEqual(readLine(" 3 ", turn), { kind: "intent", intent: { kind: "option", number: 3 } });
  assert.deepEqual(readLine("I swing at the goblin by the gate", turn), { kind: "intent", intent: { kind: "text", text: "I swing at the goblin by the gate" } });
  assert.deepEqual(readLine("/Sheet", turn), { kind: "intent", intent: { kind: "command", name: "sheet" } });
  assert.deepEqual(readLine("/help", turn), { kind: "help" });
  assert.match((readLine("/dance", turn) as { text: string }).text, /^There is no \/dance\. Commands: \/help \/sheet \/where \/options \/log \/pause \/quit$/);
  assert.deepEqual(readLine("   ", turn), { kind: "empty" });
  // A reaction: y or n, or a reaction's number; words don't answer it.
  assert.deepEqual(readLine("Y", { kind: "reaction" }), { kind: "intent", intent: { kind: "reaction", take: true } });
  assert.deepEqual(readLine("no", { kind: "reaction" }), { kind: "intent", intent: { kind: "reaction", take: false } });
  assert.deepEqual(readLine("2", { kind: "reaction" }), { kind: "intent", intent: { kind: "option", number: 2 } });
  assert.equal(readLine("maybe", { kind: "reaction" }).kind, "error");
  // The DM's question takes words, even a number; a follow-up pick takes a number or words.
  assert.deepEqual(readLine("3", { kind: "answer" }), { kind: "intent", intent: { kind: "text", text: "3" } });
  assert.deepEqual(readLine("2", { kind: "pick" }), { kind: "intent", intent: { kind: "option", number: 2 } });
  assert.deepEqual(readLine("never mind, I shove him", { kind: "pick" }), { kind: "intent", intent: { kind: "text", text: "never mind, I shove him" } });
  // Paused, or with the table busy, only commands go.
  assert.equal(readLine("I wait", { kind: "paused" }).kind, "error");
  assert.deepEqual(readLine("/pause", { kind: "paused" }), { kind: "intent", intent: { kind: "command", name: "pause" } });
  assert.equal(readLine("1", undefined).kind, "error");
  assert.deepEqual(readLine("/log", undefined), { kind: "intent", intent: { kind: "command", name: "log" } });
});

test("each event reads as lines: rolls inline with their ids, options numbered, info indented", () => {
  assert.deepEqual(eventLines({ kind: "engine", text: "Bren attacks goblin_1 with Longsword: 17, hit.", roll: "r4", seq: 9 }), [
    { tone: "engine", text: "  [r4] Bren attacks goblin_1 with Longsword: 17, hit." },
  ]);
  assert.deepEqual(eventLines({ kind: "narration", speaker: "dm", text: "The reeve frowns.", to: "bren" }), [{ tone: "dm", text: "DM (to you): The reeve frowns." }]);
  assert.deepEqual(eventLines({ kind: "speech", speaker: "maren", text: "Easy now." }), [{ tone: "speech", text: "Maren says: Easy now." }]);
  assert.deepEqual(eventLines({ kind: "options", title: "Longsword", lines: ["1. goblin_1", "2. goblin_2"], choices: [] }), [
    { tone: "options", text: "Longsword:" },
    { tone: "options", text: "  1. goblin_1" },
    { tone: "options", text: "  2. goblin_2" },
  ]);
  assert.deepEqual(eventLines({ kind: "reaction", summary: "goblin_2 leaves your reach.", options: ["Opportunity Attack"] }), [
    { tone: "prompt", text: "Reaction: goblin_2 leaves your reach." },
    { tone: "options", text: "  1. Opportunity Attack" },
  ]);
  assert.deepEqual(eventLines({ kind: "info", title: "Where", text: "gate\nwell" }), [
    { tone: "info", text: "Where:" },
    { tone: "info", text: "  gate" },
    { tone: "info", text: "  well" },
  ]);
});

test("the seat answers a prompt with what was typed, queues commands typed while busy, and stops on Ctrl+C", async () => {
  let quit = 0;
  const seat = new InkSeat("bren", { onQuit: () => (quit += 1) });
  // Busy: words are refused on screen, a command waits for the next prompt.
  seat.type("I run\r");
  seat.type("/where\r");
  assert.deepEqual(await seat.ask({ kind: "explore" }), { kind: "command", name: "where" });
  const lines = seat.getView().lines.map((l) => l.text);
  assert.ok(lines.includes("The table is busy: wait for your prompt. A command typed now is answered when it comes."));
  assert.ok(lines.includes("— answered at your next prompt"));
  // A prompt: the typed number, with backspace, answers it.
  const asked = seat.ask({ kind: "combat_turn" });
  assert.equal(seat.getView().prompt?.kind, "combat_turn");
  seat.type("23");
  seat.erase();
  seat.enter();
  assert.deepEqual(await asked, { kind: "option", number: 2 });
  assert.equal(seat.getView().prompt, undefined);
  // /help is answered here and doesn't answer the prompt.
  const reaction = seat.ask({ kind: "reaction" });
  seat.type("/help\r");
  assert.ok(seat.getView().lines.some((l) => l.text === "  /pause  AI players wait until you type /pause again"));
  seat.type("y\r");
  assert.deepEqual(await reaction, { kind: "reaction", take: true });
  // Ctrl+C: the table is told to end, the open prompt gets /quit, and so does every later one.
  const open = seat.ask({ kind: "explore" });
  seat.interrupt();
  assert.deepEqual(await open, { kind: "command", name: "quit" });
  assert.equal(quit, 1);
  assert.deepEqual(await seat.ask({ kind: "explore" }), { kind: "command", name: "quit" });
});

test("on a terminal, keys reach the seat and the screen shows the lines, the prompt and the input", async () => {
  const seat = new InkSeat("bren");
  const { stdin, stdout } = startOnFakeTerminal(seat);
  try {
    seat.show({ kind: "status", text: "Round 1: Bren's turn" });
    seat.show({ kind: "engine", text: "goblin_1 attacks Bren with Scimitar: 9, miss.", roll: "r7", seq: 12 });
    seat.show({ kind: "options", lines: ["1. Longsword: goblin_1", "2. End turn"], choices: [] });
    const asked = seat.ask({ kind: "combat_turn" });
    await until("the prompt", () => stdout.last.includes("Your turn: an option number, or what Bren does in words."));
    assert.match(stdout.last, /\[r7\] goblin_1 attacks Bren with Scimitar: 9, miss\./);
    assert.match(stdout.last, /1\. Longsword: goblin_1/);
    stdin.press("1");
    await until("the typed key", () => stdout.last.includes("> 1"));
    stdin.press("\r");
    assert.deepEqual(await asked, { kind: "option", number: 1 });
    await until("the echo", () => stdout.last.includes("The table is playing"));
  } finally {
    seat.stop();
  }
});

test("on the real loop, the terminal seat plays Bren's commands, and its engine lines hold no AC or DC", async () => {
  const seat = new InkSeat("bren");
  const { stdout } = startOnFakeTerminal(seat);
  // What the human types at each prompt, in order; then /quit.
  const typed = ["/sheet", "/where", "/log", "1", "/quit"];
  // One answer per open prompt: the loop asks again (with the same prompt) after each command.
  let answering = false;
  const unsubscribe = seat.subscribe(() => {
    const prompt = seat.getView().prompt;
    if (!prompt) answering = false;
    if (!prompt || answering || typed.length === 0) return;
    answering = true;
    const keys = typed.shift();
    setImmediate(() => seat.type(`${keys}\r`));
  });
  const t = await testTable({ seed: 23, seat });
  try {
    const players = ["torva", "maren", "ilsa"].map((h) => new ScriptedPlayer(h));
    const report = await new TableLoop({ table: t.table, dm: yardDm(), players, maxSteps: 500 }).run("m5_s3_yard");
    assert.equal(report.ended, "the human quit");
    const lines = seat.getView().lines.map((l) => l.text);
    for (const title of ["Sheet:", "Where:", "Log:"]) assert.ok(lines.includes(title), `${title} is shown`);
    assert.ok(lines.includes("> 1"), "an option number was played");
    assert.ok(lines.some((l) => /^ {2}\[r\d+\] /.test(l)), "rolls are inline with their ids");
    assert.ok(lines.includes("The run is over: the human quit"));
    // Engine lines are the human's projection: no other creature's AC, no DC, no roll target.
    for (const line of seat.getView().lines.filter((l) => l.tone === "engine")) {
      assert.doesNotMatch(line.text, /\bAC\b|\bDC\b|\bagainst\b/, line.text);
    }
    await until("the last frame", () => stdout.last.includes("The run is over: the human quit"));
  } finally {
    unsubscribe();
    seat.stop();
    t.close();
  }
});

test("/sheet reads as a sheet, in words the leak scan doesn't take for a target number", async () => {
  const t = await testTable({ seed: 1 });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    const r = await t.engine.request("bren", { cmd: "get_sheet", actor: "bren" });
    assert.ok(r.result?.cmd === "get_sheet");
    const text = formatSheet(r.result.sheet);
    const lines = text.split("\n");
    assert.equal(lines[0], "Bren, level 2 human fighter");
    assert.match(lines[1], /^Hit Points 20 of 20 · Armor Class 19 · Speed 30 ft · Initiative \+2 · Proficiency Bonus \+2 · Passive Perception 12$/);
    assert.match(text, /^Abilities: STR 17 \(\+3; save \+5, proficient\) · DEX 14/m);
    assert.match(text, /^Skills you are trained in: Acrobatics \+4, Athletics \+5, /m);
    assert.match(text, /Sleight of Hand \+2/);
    assert.match(text, /^Limited uses: Action Surge 1 of 1 \(short rest\), Second Wind 2 of 2 \(long rest; a short rest gives back 1\)$/m);
    assert.match(text, /^Equipment: Chainmail \(equipped\), Longsword \(equipped\), Shield \(equipped\), Potion of Healing$/m);
    // crates/nat20-duel leak_scan: "AC 15" or "DC 12" in the human's stream reads as a leaked target number.
    assert.doesNotMatch(text, /(^|[^A-Za-z0-9])(AC|DC) \d/);
    assert.ok(!text.trimStart().startsWith("{"), "not JSON");
  } finally {
    t.close();
  }
});

test("a potion's quick picks are you and your allies, never a hostile", async () => {
  const t = await testTable({ seed: 1 });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    const listed = await t.engine.request("bren", { cmd: "legal_actions", actor: "bren" });
    assert.ok(listed.result?.cmd === "legal_actions");
    const choices = buildChoices(listed.result as LegalActionsResult, undefined, false);
    const potions = choices.filter((c) => c.label.startsWith("Potion of Healing"));
    const quick = potions.filter((c) => c.act);
    assert.ok(quick.length > 0, "a potion line to take at once");
    assert.ok(quick.every((c) => c.target?.side !== "hostile"), quick.map((c) => c.label).join("; "));
    assert.ok(quick.some((c) => c.target?.handle === "bren"), "you can drink it yourself");
    // Attacks still offer hostiles first.
    const attack = choices.find((c) => c.label.startsWith("Longsword attack →"));
    assert.equal(attack?.target?.side, "hostile");
  } finally {
    t.close();
  }
});
