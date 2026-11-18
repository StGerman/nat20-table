// The full-screen frame (AGT-69, decision 0054): the story's own scroll and its «↓ N new» marker,
// the action zone's scrolling options, the header, and the seat drawn on fake terminals: PgUp and
// End, a scene's divider and number, the run's own line in the story, a window too small, the
// overlays (/sheet, /help), and what stands in the action zone (reaction, question, refusal, pause).
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { endScreen } from "../src/play/driver.ts";
import { finaleRows, InkSeat, mouseIn, SPINNER } from "../src/ui/ink-seat.ts";
import { actionRows, freshText, headerText, maxOffset, page, storyCell, storyRows, storyWindow, type StoryRow } from "../src/ui/frame.ts";
import type { Line } from "../src/ui/lines.ts";
import { paletteFor } from "../src/ui/palette.ts";
import { rowText, turnRows } from "../src/ui/panel.ts";
import { until } from "./until.ts";

class FakeStdout extends EventEmitter {
  readonly frames: string[] = [];
  columns: number;
  rows: number;
  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
  }
  write = (frame: string): boolean => {
    this.frames.push(frame);
    return true;
  };
  get last(): string {
    return this.frames.at(-1) ?? "";
  }
}

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

function startAt(seat: InkSeat, columns: number, rows: number): { stdin: FakeStdin; stdout: FakeStdout } {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout(columns, rows);
  seat.start({
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: new FakeStdout(columns, rows) as unknown as NodeJS.WriteStream,
    debug: true,
    interactive: true,
    patchConsole: false,
  });
  return { stdin, stdout };
}

const numbered = (n: number): Array<Line & { id: number }> => Array.from({ length: n }, (_, i) => ({ id: i, tone: "dm", text: `line ${i}` }));
const texts = (rows: Array<StoryRow | undefined>) => rows.map((r) => r?.text ?? "");

test("the story is pinned to its foot, blank above while it is short", () => {
  const rows = storyRows(numbered(3), 72);
  assert.deepEqual(texts(storyWindow(rows, 5, 3).rows), ["", "", "line 0", "line 1", "line 2"]);
  assert.deepEqual(texts(storyWindow(storyRows(numbered(10), 72), 4, 10).rows), ["line 6", "line 7", "line 8", "line 9"]);
});

test("scrolled up, new lines don't move the text: they count under the «↓ N new» marker", () => {
  const before = storyRows(numbered(10), 72);
  const up = page(undefined, -1, before, 5, 10)!;
  assert.deepEqual(up, { seen: 10, offset: 3 });
  const lines = numbered(13);
  const after = storyRows(lines, 72);
  const window = storyWindow(after, 5, 13, up);
  // Four rows of text and the marker: the window ends three rows above where it stood at the foot.
  assert.deepEqual(texts(window.rows).slice(0, 4), ["line 3", "line 4", "line 5", "line 6"]);
  assert.equal(window.rows[4], undefined);
  assert.equal(window.fresh, 3);
  assert.equal(freshText(3), "↓ 3 new · End to follow");
  // Paging down past the foot ends the scroll, and the story follows the game again.
  assert.equal(page(up, 1, after, 5, 13), undefined);
  // Up no further than the top.
  let scroll = up;
  for (let i = 0; i < 10; i++) scroll = page(scroll, -1, after, 5, 13)!;
  assert.equal(scroll.offset, maxOffset(after, 5, 10));
  assert.deepEqual(texts(storyWindow(after, 5, 13, scroll).rows).slice(0, 4), ["line 0", "line 1", "line 2", "line 3"]);
});

test("a long line wraps at the measure, and the cache re-wraps it when the width changes", () => {
  const cache = new Map<number, { width: number; rows: string[] }>();
  const lines: Array<Line & { id: number }> = [{ id: 1, tone: "dm", text: "word ".repeat(30).trim() }];
  assert.equal(storyRows(lines, 72, cache).length, 3);
  assert.equal(storyRows(lines, 40, cache).length, 4);
  assert.equal(cache.get(1)!.width, 40);
});

test("options that don't fit the action zone scroll to keep the lit one in view, with what is cut said above and below", () => {
  const lines = Array.from({ length: 16 }, (_, i) => `${i + 1}. Option ${i + 1}`);
  const block = turnRows(lines, { action: 1, bonus_action: 1, reaction: 1, movement_ft: 30, speed_ft: 30 });
  const top = actionRows(block, 72, 8).map(rowText);
  assert.deepEqual(top, ["Action free · Bonus Action free · Reaction free · 30 of 30 ft left", "", "1. Option 1", "2. Option 2", "3. Option 3", "4. Option 4", "5. Option 5", "↓ 11 more"]);
  const lit = actionRows(block, 72, 8, 12).map(rowText);
  assert.equal(lit[1], "↑ 7 more");
  assert.ok(lit.includes("12. Option 12"), lit.join("\n"));
  assert.equal(lit.at(-1), "↓ 4 more");
  // Everything fits: no markers.
  assert.equal(actionRows(block, 72, 20).length, 17);
});

test("the header names the adventure, the scene by number, the mode, the party's minutes and /help", () => {
  assert.equal(headerText({ title: "The Silent Mill", scene: { number: 4, of: 6 }, mode: "Round 5", minutes: 14 }), "The Silent Mill · Scene 4 of 6 · Round 5 · 14 min · /help");
  assert.equal(headerText({}), "/help");
  // On the road the header carries the game day, in a fight too (the bar shows the round then).
  assert.equal(headerText({ title: "Fair in Wend", mode: "Round 2", day: "Day 2, evening", minutes: 31 }), "Fair in Wend · Round 2 · Day 2, evening · 31 min · /help");
});

test("on a terminal, PgUp scrolls the story and holds it while lines arrive, and End brings it back", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "The Silent Mill" });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    for (let i = 0; i < 40; i++) seat.show({ kind: "status", text: `beat ${i}` });
    await until("the last beat", () => stdout.last.includes("— beat 39"), () => stdout.last);
    stdin.press("\u001b[5~");
    await until("scrolled up", () => !stdout.last.includes("— beat 39") && stdout.last.includes("↓ End to follow"), () => stdout.last);
    const held = stdout.last.split("\n").filter((r) => r.startsWith("— beat"));
    seat.show({ kind: "status", text: "beat 40" });
    seat.show({ kind: "status", text: "beat 41" });
    await until("the marker counts", () => stdout.last.includes("↓ 2 new · End to follow"), () => stdout.last);
    assert.deepEqual(stdout.last.split("\n").filter((r) => r.startsWith("— beat")), held, "new lines don't move the text");
    stdin.press("\u001b[F");
    await until("back at the foot", () => stdout.last.includes("— beat 41") && !stdout.last.includes("↓"), () => stdout.last);
  } finally {
    seat.stop();
  }
});

test("on a Mac keyboard and trackpad (AGT-94): Shift+↑ pages the story, the wheel scrolls three rows, a click is never typed, and the hint goes after the first scroll", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "The Silent Mill" });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    void seat.ask({ kind: "explore" });
    for (let i = 0; i < 40; i++) seat.show({ kind: "status", text: `beat ${i}` });
    await until("the last beat and the hint", () => stdout.last.includes("— beat 39") && stdout.last.includes("Shift+↑/↓ or two fingers on the trackpad: scroll the story"), () => stdout.last);
    const lastBeat = () => Math.max(...stdout.last.split("\n").flatMap((r) => (/^— beat (\d+)$/.exec(r) ? [Number(/^— beat (\d+)$/.exec(r)![1])] : [])));
    stdin.press("\u001b[<64;10;5M");
    await until("the wheel up", () => stdout.last.includes("↓ End to follow"), () => stdout.last);
    await until("the hint gone once the reader has scrolled", () => !stdout.last.includes("two fingers on the trackpad"), () => stdout.last);
    const afterWheel = lastBeat();
    stdin.press("\u001b[<65;10;5M");
    await until("the wheel down to the foot", () => stdout.last.includes("— beat 39") && !stdout.last.includes("↓"), () => stdout.last);
    stdin.press("\u001b[1;2A");
    await until("Shift+↑ paged up", () => stdout.last.includes("↓ End to follow") && lastBeat() < afterWheel, () => stdout.last);
    // A click and its release are mouse reports too: nothing is typed, nothing scrolls.
    stdin.press("\u001b[<0;10;5M");
    stdin.press("\u001b[<0;10;5m");
    stdin.press("\u001b[1;2B");
    await until("Shift+↓ back at the foot", () => stdout.last.includes("— beat 39") && !stdout.last.includes("↓"), () => stdout.last);
    assert.equal(seat.getView().draft, "", "no mouse report reached the input line");
  } finally {
    seat.stop();
  }
});

test("Shift+↑ alone takes the scroll hint away too, not only the wheel (AGT-94)", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "The Silent Mill" });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    void seat.ask({ kind: "explore" });
    for (let i = 0; i < 40; i++) seat.show({ kind: "status", text: `beat ${i}` });
    await until("the hint", () => stdout.last.includes("two fingers on the trackpad"), () => stdout.last);
    stdin.press("\u001b[1;2A");
    await until("paged up", () => stdout.last.includes("↓ End to follow"), () => stdout.last);
    assert.ok(!stdout.last.includes("two fingers on the trackpad"), "the hint goes with the first scroll");
  } finally {
    seat.stop();
  }
});

test("the seat hands the run what it drew, in order: a command's answer as `command`, engine lines only once they show (AGT-103, AGT-13)", async () => {
  const drawn: Array<{ kind: string; text: string }> = [];
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), record: (d) => drawn.push(d) });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    seat.show({ kind: "engine", text: "goblin_1 moves", seq: 1 });
    assert.equal(drawn.length, 0, "held under the narration to come");
    seat.show({ kind: "narration", speaker: "dm", text: "The goblin slips into the reeds." });
    seat.answering(true);
    seat.show({ kind: "info", title: "Sheet", text: "Bren, Fighter 2" });
    seat.answering(false);
    seat.show({ kind: "engine", text: "bren gains 2 gold", seq: 2, own: true });
    await until("drawn", () => stdout.last.includes("Bren, Fighter 2"), () => stdout.last);
    assert.deepEqual(drawn.map((d) => d.kind), ["narration", "command", "engine"]);
    assert.match(drawn[0]!.text, /The goblin slips into the reeds\./);
    assert.match(drawn[1]!.text, /Bren, Fighter 2/);
    // While the loop answers a typed command, everything it shows is the command's, a status too; /help as well.
    const asked = seat.ask({ kind: "explore" });
    stdin.press("/pause");
    stdin.press("\r");
    await asked;
    seat.answering(true);
    seat.show({ kind: "status", text: "The table waits." });
    seat.show({ kind: "speech", speaker: "maren", text: "Already?" });
    seat.answering(false);
    void seat.ask({ kind: "explore" });
    seat.show({ kind: "status", text: "The road goes on." });
    stdin.press("/help");
    stdin.press("\r");
    await until("help", () => stdout.last.includes("Help"), () => stdout.last);
    assert.deepEqual(drawn.slice(3).map((d) => d.kind), ["command", "speech", "status", "command"]);
  } finally {
    seat.stop();
  }
});

test("the run's record skips an options list equal to the one already pinned (AGT-114 a)", () => {
  const drawn: Array<{ kind: string; text: string }> = [];
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), record: (d) => drawn.push(d) });
  startAt(seat, 80, 24);
  try {
    const list = { kind: "options" as const, title: "Choices", lines: ["1. Pay", "2. Walk on"], choices: [] };
    seat.show(list);
    seat.show({ ...list });
    seat.show({ ...list, lines: ["1. Pay", "2. Walk on", "3. Ask"] });
    assert.equal(drawn.filter((d) => d.kind === "options").length, 2, "the repeat is not recorded, a changed list is");
  } finally {
    seat.stop();
  }
});

test("the mouse reports in what the terminal sent, in order: the wheel's turns (AGT-94) and the left button's press and release (AGT-108); a move or another button is none", () => {
  const turns = (chunk: string) => mouseIn(chunk).flatMap((r) => (r.kind === "wheel" ? [r.turn] : []));
  assert.deepEqual(turns("\u001b[<64;1;1M\u001b[<65;80;24M\u001b[<68;1;1M"), [-1, 1, -1]);
  assert.deepEqual(mouseIn("\u001b[<0;3;4M\u001b[<0;5;4m\u001b[<35;1;1M\u001b[<2;1;1M"), [
    { kind: "press", x: 3, y: 4 },
    { kind: "release", x: 5, y: 4 },
  ]);
  // Shift adds 4: still the left button.
  assert.deepEqual(mouseIn("\u001b[<4;7;2M"), [{ kind: "press", x: 7, y: 2 }]);
  assert.deepEqual(mouseIn("x\u001b[5~"), []);
});

test("a scene start puts a divider in the story and its number in the header, and the run's own line goes into the story", async () => {
  let now = 1_000_000;
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "The Silent Mill", now: () => now });
  const { stdout } = startAt(seat, 124, 40);
  try {
    seat.note("Playing s1_village_green of The Silent Mill. Run folder runs/x/.");
    seat.scene(1, 6);
    await until("the header", () => stdout.last.split("\n")[0].includes("The Silent Mill · Scene 1 of 6 · 0 min · /help"), () => stdout.last);
    assert.ok(stdout.last.includes("— Scene 1 of 6 —"), stdout.last);
    assert.ok(stdout.last.indexOf("Playing s1_village_green") < stdout.last.indexOf("— Scene 1 of 6 —"), stdout.last);
    now += 3 * 60_000;
    seat.scene(2, 6);
    await until("the next scene", () => stdout.last.split("\n")[0].includes("Scene 2 of 6 · 3 min"), () => stdout.last);
  } finally {
    seat.stop();
  }
});

test("on the road a place's scene puts its name in the divider and no scene count in the header", async () => {
  // Stas's Fair in Wend run, 2026-11-04: "Scene 2 of 4" after Wendford looked as if the scenes ran backwards.
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "Fair in Wend", now: () => 1_000_000 });
  const { stdout } = startAt(seat, 124, 40);
  try {
    seat.place("Wendford");
    await until("the divider", () => stdout.last.includes("— Wendford —"), () => stdout.last);
    assert.ok(!stdout.last.split("\n")[0].includes("Scene"), stdout.last.split("\n")[0]);
  } finally {
    seat.stop();
  }
});

test("under 40 columns or 16 rows the frame is one line asking for a bigger window, and the input row still works", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdin, stdout } = startAt(seat, 36, 20);
  try {
    seat.show({ kind: "narration", speaker: "dm", text: "The mill wheel turns." });
    const asked = seat.ask({ kind: "explore" });
    await until("the small window", () => stdout.last.includes("Window too small"), () => stdout.last);
    assert.ok(!stdout.last.includes("mill wheel"), stdout.last);
    stdin.press("look\r");
    assert.deepEqual(await asked, { kind: "text", text: "look" });
  } finally {
    seat.stop();
  }
});

test("/sheet and the other commands' answers stand over the story: Esc closes, PgDn reads on, lines under it are counted", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    seat.show({ kind: "narration", speaker: "dm", text: "The mill wheel turns." });
    void seat.ask({ kind: "explore" });
    const sheet = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    seat.show({ kind: "info", title: "Sheet", text: sheet });
    await until("the overlay", () => stdout.last.includes("Sheet · Esc closes · Shift+↑/↓") && /^row 0$/m.test(stdout.last), () => stdout.last);
    assert.ok(!stdout.last.includes("mill wheel"), "the overlay covers the story");
    assert.ok(!seat.getView().lines.some((l) => l.text.includes("row 0")), "and the story doesn't keep it");
    // The wheel scrolls the overlay three rows, never past its top (AGT-94).
    stdin.press("\u001b[<65;10;5M");
    await until("the wheel down", () => !/^row 2$/m.test(stdout.last) && /^row 3$/m.test(stdout.last), () => stdout.last);
    stdin.press("\u001b[<64;10;5M\u001b[<64;10;5M");
    await until("the wheel up to the top", () => /^row 0$/m.test(stdout.last), () => stdout.last);
    stdin.press("\u001b[6~");
    await until("read on", () => !/^row 0$/m.test(stdout.last) && /^row 19$/m.test(stdout.last), () => stdout.last);
    seat.show({ kind: "speech", speaker: "ilsa", text: "Look at the sluice." });
    await until("the count", () => stdout.last.includes("↓ 1 new"), () => stdout.last);
    // Typing still goes to the input row with the overlay open.
    stdin.press("x");
    await until("the typed key", () => stdout.last.includes("> x"), () => stdout.last);
    stdin.press("\u001b");
    await until("closed", () => stdout.last.includes("mill wheel") && stdout.last.includes("Look at the sluice."), () => stdout.last);
    assert.equal(seat.getView().draft, "x", "Esc closed the overlay and left the line");
  } finally {
    seat.stop();
  }
});

test("an overlay read to its foot and then given a bigger window fills it, instead of sliding past its last row", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    void seat.ask({ kind: "explore" });
    seat.show({ kind: "info", title: "Sheet", text: Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n") });
    await until("the overlay", () => /^row 0$/m.test(stdout.last), () => stdout.last);
    const shown = () => (stdout.last.match(/^row \d+$/gm) ?? []).length;
    const small = shown();
    for (let i = 0; i < 3 && !/^row 39$/m.test(stdout.last); i++) {
      const before = stdout.frames.length;
      stdin.press("\u001b[6~");
      await until("a page", () => stdout.frames.length > before);
    }
    await until("the foot", () => /^row 39$/m.test(stdout.last), () => stdout.last);
    stdout.rows = 40;
    stdout.emit("resize");
    await until("the bigger window", () => shown() > small && /^row 39$/m.test(stdout.last), () => stdout.last);
  } finally {
    seat.stop();
  }
});

test("a reaction, the DM's question, a refusal and the pause stand in the action zone until they are settled", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdout } = startAt(seat, 80, 24);
  const zone = () => stdout.last.split("\n").slice(-6).join("\n");
  try {
    seat.show({ kind: "reaction", summary: "goblin_1 leaves your reach.", options: ["Opportunity Attack"] });
    const reacted = seat.ask({ kind: "reaction" });
    await until("the reaction", () => zone().includes("Reaction: goblin_1 leaves your reach.") && zone().includes("1. Opportunity Attack"));
    seat.type("y\r");
    assert.deepEqual(await reacted, { kind: "reaction", take: true });
    await until("the reaction gone", () => !stdout.last.includes("leaves your reach"), () => stdout.last);

    seat.show({ kind: "question", text: "Who do you trust here?" });
    const answered = seat.ask({ kind: "answer" });
    await until("the question", () => zone().includes("DM asks you: Who do you trust here?"));
    seat.type("Wenna\r");
    assert.deepEqual(await answered, { kind: "text", text: "Wenna" });
    await until("the question settled", () => seat.getView().question === undefined && stdout.last.split("\n").filter((r) => r.includes("DM asks you")).length === 1, () => stdout.last);
    // It stays in the story, where it was asked.
    assert.ok(seat.getView().lines.some((l) => l.text === "DM asks you: Who do you trust here?"));

    seat.show({ kind: "info", title: "Not accepted", text: "goblin_3 is out of reach." });
    const again = seat.ask({ kind: "combat_turn" });
    await until("the refusal", () => zone().includes("Not accepted: goblin_3 is out of reach."));
    assert.ok(!seat.getView().lines.some((l) => l.text.includes("out of reach")), "the refusal is not in the story");
    seat.type("2\r");
    await again;
    await until("the refusal gone", () => !stdout.last.includes("Not accepted"), () => stdout.last);

    void seat.ask({ kind: "paused" });
    await until("the pause", () => zone().includes("Paused: the AI players wait. /pause to go on.") && stdout.last.split("\n")[0].includes("Paused"), () => stdout.last);
  } finally {
    seat.stop();
  }
});

test("/help lists the commands and the keys over the story", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdout } = startAt(seat, 124, 40);
  try {
    seat.type("/help\r");
    await until("help", () => stdout.last.includes("Help · Esc closes") && stdout.last.includes("Shift+↑/↓  scroll the story, or this; PgUp/PgDn too") && stdout.last.includes("Trackpad   two fingers scroll the story") && stdout.last.includes("Fn         hold it to select text with the mouse (Option in iTerm2)") && stdout.last.includes("/sheet  your character sheet"), () => stdout.last);
  } finally {
    seat.stop();
  }
});

test("the end screen says how the run ended, and a stop what to do, with the checks; never the verdict or the report", () => {
  assert.deepEqual(endScreen("the human quit", "operator"), { text: "The run is over: the human quit" });
  assert.deepEqual(endScreen("the 120-minute time limit", "time_limit"), { text: "The run is over: the 120-minute time limit" });
  const crash = endScreen("the run failed: boom", "crash");
  assert.equal(crash.text, "Stopped: the run failed: boom");
  assert.match(crash.todo!, /engine-stderr\.log/);
  assert.match(endScreen("Claude is out of reach", "offline").todo!, /network/);
  const rows = finaleRows({ ...crash, checks: [{ name: "Audit", state: "done" }, { name: "Narration check", state: "running" }, { name: "Upload", state: "waiting" }] }, 72).map(rowText);
  assert.deepEqual(rows.slice(-4), ["", "✓ Audit", "… Narration check", "  Upload"]);
  // Animated, the running check turns the table's spinner instead of "…".
  const turning = (frame: number) => finaleRows({ ...crash, checks: [{ name: "Narration check", state: "running" }] }, 72, false, frame).map(rowText).at(-1);
  assert.deepEqual([turning(0), turning(1)], [`${SPINNER[0]} Narration check`, `${SPINNER[1]} Narration check`]);
});

test("at the end the table stays with the checks ticking in the action zone, and any key leaves", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    seat.show({ kind: "narration", speaker: "dm", text: "The mill falls quiet." });
    seat.show({ kind: "options", lines: ["1. Longsword attack → goblin_3", "2. End turn"], choices: [], budget: { action: 1, bonus_action: 1, reaction: 1, movement_ft: 30, speed_ft: 30 } });
    const open = seat.ask({ kind: "combat_turn" });
    // A line half typed when the run ends goes, so the input row says any key leaves.
    seat.type("attack the");
    seat.finish(endScreen("the party reached the end", undefined), ["Audit", "Report and verdict"]);
    assert.equal(seat.getView().draft, "", "the half-typed line goes");
    assert.deepEqual(await open, { kind: "command", name: "quit" }, "a prompt still open is let go");
    seat.check("Audit", "running");
    await until("the end screen", () => stdout.last.includes("The run is over: the party reached the end") && stdout.last.includes("… Audit") && stdout.last.includes("Any key leaves"), () => stdout.last);
    assert.ok(stdout.last.includes("The mill falls quiet."), "the DM's last lines stay in the story");
    assert.ok(!stdout.last.includes("Longsword attack"), "the options go");
    // Said once: after the loop's own end line, the zone doesn't repeat it.
    seat.show({ kind: "end", text: "the party reached the end" });
    await until("one end line", () => stdout.last.split("The run is over: the party reached the end").length === 2, () => stdout.last);
    seat.check("Audit", "done");
    await until("the tick", () => stdout.last.includes("✓ Audit"), () => stdout.last);
    let left = false;
    void seat.left.then(() => (left = true));
    stdin.press("q");
    await until("left", () => left);
    assert.equal(seat.getView().draft, "", "the key isn't typed");
  } finally {
    seat.stop();
  }
});

test("on a terminal, ↓ lights an option and Enter plays it, and Esc on an empty line leaves a sub-list (AGT-48)", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    seat.show({ kind: "options", lines: ["1. Longsword attack → goblin_3", "2. Longsword attack, another target…", "3. End turn"], choices: [] });
    const turn = seat.ask({ kind: "combat_turn" });
    stdin.press("\u001b[B");
    stdin.press("\u001b[B");
    await until("the lit option", () => stdout.last.includes("Enter plays 2. Longsword attack, another target…"), () => stdout.last);
    stdin.press("\r");
    assert.deepEqual(await turn, { kind: "option", number: 2 });
    seat.show({ kind: "options", title: "Longsword attack", lines: ["1. goblin_4", "2. wolf_1"], choices: [] });
    const pick = seat.ask({ kind: "pick" });
    await until("the pick", () => stdout.last.includes("Esc to go back"), () => stdout.last);
    stdin.press("\u001b");
    assert.deepEqual(await pick, { kind: "back" });
  } finally {
    seat.stop();
  }
});

test("Tab opens the card of a name in the story, Tab again the next, Esc closes it, and /who lists everyone (AGT-107)", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "Fair in Wend" });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    const people = [
      { id: "shepherd_gwyn", name: "Gwyn", forms: ["Gwyn"], state: "elsewhere", look: "A shepherd with a name for every sheep.", remembers: [] },
      { id: "osric_hale", name: "Osric", forms: ["Osric"], state: "here", health: "unhurt", remembers: [], inScene: true },
    ];
    const situation = { mode: "explore", next: [], me: { handle: "bren", name: "Bren", hp: 10, hp_max: 10, temp_hp: 0, conditions: [], life_state: "conscious", effects: [] }, creatures: [], down: [], people };
    seat.show({ kind: "situation", situation } as never);
    seat.show({ kind: "status", text: "Gwyn waves; Osric nods." });
    void seat.ask({ kind: "explore" });
    await until("the line", () => stdout.last.includes("Gwyn waves; Osric nods."), () => stdout.last);
    stdin.press("\t");
    await until("the newest name's card", () => stdout.last.includes("Osric · Esc closes") && stdout.last.includes("Here with you now."), () => stdout.last);
    stdin.press("\t");
    await until("the next name's card", () => stdout.last.includes("Gwyn · Esc closes") && stdout.last.includes("A shepherd with a name for every sheep."), () => stdout.last);
    stdin.press("\u001b");
    await until("closed", () => !stdout.last.includes("Esc closes"), () => stdout.last);
    for (const ch of "/who") stdin.press(ch);
    stdin.press("\r");
    await until("the lists", () => stdout.last.includes("You have met: Gwyn, Osric."), () => stdout.last);
    stdin.press("\u001b");
    await until("the lists closed", () => !stdout.last.includes("You have met"), () => stdout.last);
    for (const ch of "/who osric") stdin.press(ch);
    stdin.press("\r");
    await until("his card", () => stdout.last.includes("Osric · Esc closes"), () => stdout.last);
  } finally {
    seat.stop();
  }
});

test("a click on an underlined name opens its card, a drag says once how to select text, and /mouse turns the mouse off and on (AGT-108)", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "Fair in Wend" });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    const people = [{ id: "osric_hale", name: "Osric", forms: ["Osric"], state: "here", health: "unhurt", remembers: [], inScene: true }];
    const situation = { mode: "explore", next: [], me: { handle: "bren", name: "Bren", hp: 10, hp_max: 10, temp_hp: 0, conditions: [], life_state: "conscious", effects: [] }, creatures: [], down: [], people };
    seat.show({ kind: "situation", situation } as never);
    seat.show({ kind: "status", text: "The road is wet; Osric nods." });
    void seat.ask({ kind: "explore" });
    await until("the line", () => stdout.last.includes("Osric nods."), () => stdout.last);
    const screen = stdout.last.split("\n");
    const y = screen.findIndex((row) => row.includes("Osric nods.")) + 1;
    const x = screen[y - 1]!.indexOf("Osric") + 1;
    // A click beside the name opens nothing.
    stdin.press(`\u001b[<0;${x - 3};${y}M\u001b[<0;${x - 3};${y}m`);
    stdin.press(`\u001b[<0;${x + 2};${y}M`);
    stdin.press(`\u001b[<0;${x + 2};${y}m`);
    await until("his card", () => stdout.last.includes("Osric · Esc closes"), () => stdout.last);
    assert.equal(seat.getView().person, "osric_hale");
    stdin.press("\u001b");
    await until("closed", () => !stdout.last.includes("Esc closes"), () => stdout.last);
    stdin.press(`\u001b[<0;2;3M\u001b[<0;9;3m`);
    await until("the drag hint", () => stdout.last.includes("To select text, hold the Fn key"), () => stdout.last);
    for (const ch of "/mouse") stdin.press(ch);
    stdin.press("\r");
    await until("off", () => stdout.last.includes("Text now selects as usual"), () => stdout.last);
    // Off, a click on the name opens nothing.
    stdin.press(`\u001b[<0;${x + 2};${y}M\u001b[<0;${x + 2};${y}m`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(seat.getView().person, undefined, "no card while the mouse is off");
    for (const ch of "/mouse") stdin.press(ch);
    stdin.press("\r");
    await until("on again", () => stdout.last.includes("A click on an underlined name shows who it is again"), () => stdout.last);
    stdin.press("\u001b[<0;2;3M\u001b[<0;9;3m");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(!stdout.last.includes("To select text"), "the drag hint is said once");
    assert.equal(seat.getView().draft, "");
  } finally {
    seat.stop();
  }
});

test("a death shows on the card once the story tells it, in the narration that brought it or later, never by the human's own words (AGT-107)", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "Fair in Wend" });
  const { stdin, stdout } = startAt(seat, 80, 24);
  const me = { handle: "bren", name: "Bren", hp: 10, hp_max: 10, temp_hp: 0, conditions: [], life_state: "conscious", effects: [] };
  const frame = (people: unknown[]) => seat.show({ kind: "situation", situation: { mode: "explore", next: [], me, creatures: [], down: [], people } } as never);
  const odda = { id: "odda_vell", name: "Odda", forms: ["Odda"], look: "A merchant with a ledger." };
  const fenn = { id: "fenn", name: "Fenn", forms: ["Fenn"] };
  const card = async (name: string, has: string) => {
    for (const ch of `/who ${name}`) stdin.press(ch);
    stdin.press("\r");
    await until(`${name}: ${has}`, () => stdout.last.includes(`${name} · Esc closes`) && stdout.last.includes(has), () => stdout.last);
    stdin.press("\u001b");
    await until("closed", () => !stdout.last.includes("Esc closes"), () => stdout.last);
  };
  try {
    frame([
      { ...odda, state: "here", health: "unhurt", inScene: true, remembers: ["You carried her salt."] },
      { ...fenn, state: "elsewhere", remembers: [], lastSeen: "Highsteads" },
    ]);
    seat.show({ kind: "narration", speaker: "dm", text: "The road is quiet." });
    void seat.ask({ kind: "explore" });
    await until("the line", () => stdout.last.includes("The road is quiet."), () => stdout.last);
    // Odda dies in the step the narration tells; Fenn dies off the page.
    frame([
      { ...odda, state: "dead", inScene: true, remembers: [] },
      { ...fenn, state: "dead", remembers: [] },
    ]);
    seat.show({ kind: "narration", speaker: "dm", text: "Odda falls under the wheel." });
    await until("the death line", () => stdout.last.includes("Odda falls under the wheel."), () => stdout.last);
    await card("Odda", "No longer alive.");
    // Untold, Fenn's card is still as it was, memories and all.
    await card("Fenn", "Last seen at Highsteads.");
    for (const ch of "I ask about Fenn") stdin.press(ch);
    stdin.press("\r");
    await card("Fenn", "Not here now.");
    seat.show({ kind: "narration", speaker: "dm", text: "Word comes that Fenn is dead." });
    await until("the word", () => stdout.last.includes("Fenn is dead."), () => stdout.last);
    await card("Fenn", "No longer alive.");
  } finally {
    seat.stop();
  }
});

test("a click's cell in the story: the header is row 1, the story the next rows, its width the columns (AGT-108)", () => {
  assert.equal(storyCell(1, 1, 10, 60), undefined, "the header");
  assert.deepEqual(storyCell(1, 2, 10, 60), { row: 0, column: 0 });
  assert.deepEqual(storyCell(60, 11, 10, 60), { row: 9, column: 59 });
  assert.equal(storyCell(1, 12, 10, 60), undefined, "under the story");
  assert.equal(storyCell(61, 5, 10, 60), undefined, "the rule or the side pane");
});
