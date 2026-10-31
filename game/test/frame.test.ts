// The full-screen frame (AGT-69, decision 0054): the story's own scroll and its «↓ N new» marker,
// the action zone's scrolling options, the header, and the seat drawn on fake terminals: PgUp and
// End, a scene's divider and number, the run's own line in the story, and a window too small.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { InkSeat } from "../src/ui/ink-seat.ts";
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
