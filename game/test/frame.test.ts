// The full-screen frame (AGT-69, decision 0054): the story's own scroll and its «↓ N new» marker,
// the action zone's scrolling options, the header, and the seat drawn on fake terminals: PgUp and
// End, a scene's divider and number, the run's own line in the story, a window too small, the
// overlays (/sheet, /help), and what stands in the action zone (reaction, question, refusal, pause).
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { endScreen } from "../src/play/driver.ts";
import { finaleRows, InkSeat } from "../src/ui/ink-seat.ts";
import { actionRows, freshText, headerText, maxOffset, page, storyRows, storyWindow, type StoryRow } from "../src/ui/frame.ts";
import type { Line } from "../src/ui/lines.ts";
import { paletteFor } from "../src/ui/palette.ts";
import { rowText, turnRows } from "../src/ui/panel.ts";

class FakeStdout extends EventEmitter {
  readonly frames: string[] = [];
  readonly columns: number;
  readonly rows: number;
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

async function until(what: string, ready: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
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
});

test("on a terminal, PgUp scrolls the story and holds it while lines arrive, and End brings it back", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "The Silent Mill" });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    for (let i = 0; i < 40; i++) seat.show({ kind: "status", text: `beat ${i}` });
    await until("the last beat", () => stdout.last.includes("— beat 39"));
    stdin.press("\u001b[5~");
    await until("scrolled up", () => !stdout.last.includes("— beat 39") && stdout.last.includes("↓ End to follow"));
    const held = stdout.last.split("\n").filter((r) => r.startsWith("— beat"));
    seat.show({ kind: "status", text: "beat 40" });
    seat.show({ kind: "status", text: "beat 41" });
    await until("the marker counts", () => stdout.last.includes("↓ 2 new · End to follow"));
    assert.deepEqual(stdout.last.split("\n").filter((r) => r.startsWith("— beat")), held, "new lines don't move the text");
    stdin.press("\u001b[F");
    await until("back at the foot", () => stdout.last.includes("— beat 41") && !stdout.last.includes("↓"));
  } finally {
    seat.stop();
  }
});

test("a scene start puts a divider in the story and its number in the header, and the run's own line goes into the story", async () => {
  let now = 1_000_000;
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), title: "The Silent Mill", now: () => now });
  const { stdout } = startAt(seat, 124, 40);
  try {
    seat.note("Playing s1_village_green of The Silent Mill. Run folder runs/x/.");
    seat.scene(1, 6);
    await until("the header", () => stdout.last.split("\n")[0].includes("The Silent Mill · Scene 1 of 6 · 0 min · /help"));
    assert.ok(stdout.last.includes("— Scene 1 of 6 —"), stdout.last);
    assert.ok(stdout.last.indexOf("Playing s1_village_green") < stdout.last.indexOf("— Scene 1 of 6 —"), stdout.last);
    now += 3 * 60_000;
    seat.scene(2, 6);
    await until("the next scene", () => stdout.last.split("\n")[0].includes("Scene 2 of 6 · 3 min"));
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
    await until("the small window", () => stdout.last.includes("Window too small"));
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
    await until("the overlay", () => stdout.last.includes("Sheet · Esc closes · PgUp/PgDn") && /^row 0$/m.test(stdout.last));
    assert.ok(!stdout.last.includes("mill wheel"), "the overlay covers the story");
    assert.ok(!seat.getView().lines.some((l) => l.text.includes("row 0")), "and the story doesn't keep it");
    stdin.press("\u001b[6~");
    await until("read on", () => !/^row 0$/m.test(stdout.last) && /^row 19$/m.test(stdout.last));
    seat.show({ kind: "speech", speaker: "ilsa", text: "Look at the sluice." });
    await until("the count", () => stdout.last.includes("↓ 1 new"));
    // Typing still goes to the input row with the overlay open.
    stdin.press("x");
    await until("the typed key", () => stdout.last.includes("> x"));
    stdin.press("\u001b");
    await until("closed", () => stdout.last.includes("mill wheel") && stdout.last.includes("Look at the sluice."));
    assert.equal(seat.getView().draft, "x", "Esc closed the overlay and left the line");
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
    await until("the reaction gone", () => !stdout.last.includes("leaves your reach"));

    seat.show({ kind: "question", text: "Who do you trust here?" });
    const answered = seat.ask({ kind: "answer" });
    await until("the question", () => zone().includes("DM asks you: Who do you trust here?"));
    seat.type("Wenna\r");
    assert.deepEqual(await answered, { kind: "text", text: "Wenna" });
    await until("the question settled", () => seat.getView().question === undefined && stdout.last.split("\n").filter((r) => r.includes("DM asks you")).length === 1);
    // It stays in the story, where it was asked.
    assert.ok(seat.getView().lines.some((l) => l.text === "DM asks you: Who do you trust here?"));

    seat.show({ kind: "info", title: "Not accepted", text: "goblin_3 is out of reach." });
    const again = seat.ask({ kind: "combat_turn" });
    await until("the refusal", () => zone().includes("Not accepted: goblin_3 is out of reach."));
    assert.ok(!seat.getView().lines.some((l) => l.text.includes("out of reach")), "the refusal is not in the story");
    seat.type("2\r");
    await again;
    await until("the refusal gone", () => !stdout.last.includes("Not accepted"));

    void seat.ask({ kind: "paused" });
    await until("the pause", () => zone().includes("Paused: the AI players wait. /pause to go on.") && stdout.last.split("\n")[0].includes("Paused"));
  } finally {
    seat.stop();
  }
});

test("/help lists the commands and the keys over the story", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdout } = startAt(seat, 124, 40);
  try {
    seat.type("/help\r");
    await until("help", () => stdout.last.includes("Help · Esc closes") && stdout.last.includes("PgUp/PgDn  scroll the story, or this") && stdout.last.includes("/sheet  your character sheet"));
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
});

test("at the end the table stays with the checks ticking in the action zone, and any key leaves", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const { stdin, stdout } = startAt(seat, 80, 24);
  try {
    seat.show({ kind: "narration", speaker: "dm", text: "The mill falls quiet." });
    seat.show({ kind: "options", lines: ["1. Longsword attack → goblin_3", "2. End turn"], choices: [], budget: { action: 1, bonus_action: 1, reaction: 1, movement_ft: 30, speed_ft: 30 } });
    const open = seat.ask({ kind: "combat_turn" });
    seat.finish(endScreen("the party reached the end", undefined), ["Audit", "Report and verdict"]);
    assert.deepEqual(await open, { kind: "command", name: "quit" }, "a prompt still open is let go");
    seat.check("Audit", "running");
    await until("the end screen", () => stdout.last.includes("The run is over: the party reached the end") && stdout.last.includes("… Audit") && stdout.last.includes("Any key leaves"));
    assert.ok(stdout.last.includes("The mill falls quiet."), "the DM's last lines stay in the story");
    assert.ok(!stdout.last.includes("Longsword attack"), "the options go");
    // Said once: after the loop's own end line, the zone doesn't repeat it.
    seat.show({ kind: "end", text: "the party reached the end" });
    await until("one end line", () => stdout.last.split("The run is over: the party reached the end").length === 2);
    seat.check("Audit", "done");
    await until("the tick", () => stdout.last.includes("✓ Audit"));
    let left = false;
    void seat.left.then(() => (left = true));
    stdin.press("q");
    await until("left", () => left);
    assert.equal(seat.getView().draft, "", "the key isn't typed");
  } finally {
    seat.stop();
  }
});
