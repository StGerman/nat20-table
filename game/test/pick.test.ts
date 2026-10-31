// The pick screen and the casting it sets (M7 spec §4.2, TASKS.md AGT-35; full screen, AGT-69 step 3).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { castParty, partyRoster } from "../src/play/run.ts";
import { InkSeat } from "../src/ui/ink-seat.ts";
import { paletteFor } from "../src/ui/palette.ts";
import { cardRows, pickKey, pickOnScreen, pickRows } from "../src/ui/pick.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");

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

async function until(what: string, ready: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("the pick list shows each character's name, species, class and level, the default marked; the card adds who they are and the goal", () => {
  const roster = partyRoster(MILL);
  assert.deepEqual(pickRows(roster, 0, "bren"), [
    "❯ 1. Bren  Human Fighter 2 · default",
    "  2. Torva  Human Barbarian 2",
    "  3. Maren  Human Cleric 2",
    "  4. Ilsa  Dragonborn Wizard 2",
  ]);
  const bren = cardRows(roster[0], 72);
  assert.deepEqual(bren.slice(0, 3), ["Bren", "Human Fighter, level 2", ""]);
  // Only the opening sentence: the rest of the paragraph speaks to an AI player.
  assert.ok(bren.join(" ").includes("The company's sergeant"), bren.join("\n"));
  assert.ok(!bren.join(" ").includes("This card is for an AI"), bren.join("\n"));
  assert.deepEqual(bren.slice(-3), ["Goal", "Keep the four of you together, fed and paid until something better than", "guard work comes along."]);
  // No sheet numbers on the card.
  assert.ok(!/\bHP\b|\bAC\b/.test(bren.join(" ")));
});

test("arrows move the highlight round the list, a number jumps to its character, one past the list is ignored, and Enter picks", () => {
  const roster = partyRoster(MILL);
  let state = { at: 0 };
  state = pickKey(roster, state, { kind: "up" }).state;
  assert.equal(state.at, 3);
  state = pickKey(roster, state, { kind: "down" }).state;
  assert.equal(state.at, 0);
  state = pickKey(roster, state, { kind: "digit", digit: 3 }).state;
  assert.equal(state.at, 2);
  assert.equal(pickKey(roster, state, { kind: "digit", digit: 9 }).state.at, 2);
  assert.equal(pickKey(roster, state, { kind: "enter" }).picked, "maren");
});

test("on a terminal the pick screen picks with keys, Enter at once keeps the default, and the table takes over the same screen with the keyboard (AGT-54)", async () => {
  for (const [keys, want] of [[["\r"], "bren"], [["\u001b[B", "\u001b[B", "\r"], "maren"], [["4", "\r"], "ilsa"]] as const) {
    const stdin = new FakeStdin();
    const stdout = new FakeStdout(120, 30);
    const render = { stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream, stderr: new FakeStdout(120, 30) as unknown as NodeJS.WriteStream, debug: true, patchConsole: false };
    const picking = pickOnScreen(partyRoster(MILL), "bren", { title: "The Silent Mill", palette: paletteFor({ NO_COLOR: "1" }), render });
    await until("the pick screen", () => stdout.last.includes("The Silent Mill · Who do you play?") && stdout.last.includes("❯ 1. Bren"));
    assert.ok(stdout.last.includes("Keep the four of you together"), "the default's card shows first");
    for (const key of keys) {
      stdin.press(key);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const { handle, instance } = await picking;
    assert.equal(handle, want);
    // The table adopts the screen: no second render, and its prompt takes the keyboard.
    const seat = new InkSeat(handle, { palette: paletteFor({ NO_COLOR: "1" }) });
    seat.adopt(instance);
    try {
      const asked = seat.ask({ kind: "explore" });
      await until("the table", () => stdout.last.includes("What does") && !stdout.last.includes("Who do you play?"));
      stdin.press("look\r");
      assert.deepEqual(await asked, { kind: "text", text: "look" });
    } finally {
      seat.stop();
    }
  }
});

test("casting the human on a character makes the other three AI players, in the pack's order", () => {
  const ilsa = castParty(MILL, { play: "ilsa" });
  assert.equal(ilsa.human, "ilsa");
  assert.deepEqual(ilsa.ai, ["bren", "torva", "maren"]);
  assert.deepEqual([...ilsa.cards.keys()], ["bren", "torva", "maren"]);
  assert.equal(castParty(MILL).human, "bren", "the pack's seat is the default");
  assert.throws(() => castParty(MILL, { play: "goblin_1" }), /goblin_1 is not in the party; pick one of bren, torva, maren, ilsa/);
});

test("--play puts the human's seat on that character, in run.json and the transcript; --play with --seat ai is refused", () => {
  const out = mkdtempSync(path.join(tmpdir(), "pick-"));
  try {
    const cli = path.join(REPO, "game/src/play/scene.ts");
    const args = ["--experimental-strip-types", "--no-warnings", cli, "--dm", "scripted", "--players", "scripted", "--seed", "5", "--no-audit", "--no-upload", "--out", out];
    const run = spawnSync(process.execPath, [...args, "--play", "maren"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const [folder] = readdirSync(out);
    const record = JSON.parse(readFileSync(path.join(out, folder, "run.json"), "utf8")) as { seats: unknown; settings: { play?: { value: string; from: string } } };
    assert.deepEqual(record.seats, { human: "maren", ai: ["bren", "torva", "ilsa"] });
    assert.deepEqual(record.settings.play, { value: "maren", from: "flag" });
    const transcript = readFileSync(path.join(out, folder, "transcript.jsonl"), "utf8");
    assert.match(transcript, /"text":"the human plays maren; AI players: bren, torva, ilsa"/);
    const report = readFileSync(path.join(out, folder, "report.md"), "utf8");
    assert.match(report, /- AI players: bren, torva, ilsa, scripted; maren on a scripted seat\n/);
    const refused = spawnSync(process.execPath, [...args, "--seat", "ai", "--play", "maren"], { encoding: "utf8" });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /--play names the human's character, and --seat ai has no human\./);
    const unknown = spawnSync(process.execPath, [...args, "--play", "goblin_1"], { encoding: "utf8" });
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /--play: goblin_1 is not in the party/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
