// The situation panel and the turn block (AGT-36): the data made from the human's own state, the
// rows at pinned terminal sizes (80x24, 60 columns, the fold), the palette, the seat's frames, and
// the loop sending situations on the real engine, and the loading indicator while the table waits. Needs `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { State } from "@nat20-table/engine-client";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedPlayer, ScriptedSeat, yardDm } from "../src/table/scripted.ts";
import { situationOf, type Situation } from "../src/table/situation.ts";
import type { TableEvent } from "../src/table/types.ts";
import { InkSeat, SPINNER, waitText } from "../src/ui/ink-seat.ts";
import { TONE_STYLE } from "../src/ui/lines.ts";
import { loadTheme, paletteFor, THEME_FILE, themeProblems } from "../src/ui/palette.ts";
import { rowText, situationRows, turnRows } from "../src/ui/panel.ts";
import type { LegalActionsResult } from "../src/view.ts";
import { testTable } from "./helpers.ts";

const at = { x_ft: 0, y_ft: 0, z_ft: 0 };
const other = (handle: string, name: string, side: "party" | "hostile" | "neutral", health: "unhurt" | "bloodied" | "down", distance_ft: number, conditions: string[] = []) => ({
  handle,
  name,
  side,
  position_ft: at,
  distance_ft,
  health,
  conditions,
});

/** Round 5 of the yard as Bren sees it: two goblins up, the rest dead, Maren down. */
function yard(): Extract<State, { view: "player" }> {
  return {
    view: "player",
    viewer: "bren",
    mode: "combat",
    scene_id: "m5_s3_yard",
    round: 5,
    initiative: ["goblin_4", "ilsa", "wolf_3", "goblin_3", "maren", "goblin_2", "torva", "bren", "goblin_1"],
    me: {
      handle: "bren",
      name: "Bren",
      side: "party",
      position_ft: at,
      hp: 12,
      hp_max: 20,
      temp_hp: 0,
      ac: 19,
      speed_ft: 30,
      conditions: ["prone"],
      exhaustion: 0,
      life_state: "conscious",
      health: "unhurt",
      effects: [{ id: "spell/bless", name: "Bless", source: "maren" }],
    },
    others: [
      other("torva", "Torva", "party", "unhurt", 10),
      other("goblin_4", "Goblin Warrior", "hostile", "unhurt", 24.2),
      other("goblin_3", "Goblin Warrior", "hostile", "bloodied", 5),
      other("maren", "Maren", "party", "down", 20, ["unconscious"]),
      other("ilsa", "Ilsa", "party", "unhurt", 30),
      other("goblin_1", "Goblin Warrior", "hostile", "down", 15),
      other("goblin_2", "Goblin Warrior", "hostile", "down", 40),
      other("wolf_3", "Wolf", "hostile", "down", 12),
    ],
    anchors: [],
  } as unknown as Extract<State, { view: "player" }>;
}

const listing = {
  cmd: "legal_actions",
  prompt_id: "p40",
  options: [{ targets: [{ handle: "goblin_3", in_range: true }, { handle: "goblin_4", in_range: false }] }],
  unavailable: [],
  can_end_turn: true,
  budget: { action: 0, bonus_action: 1, reaction: 1, movement_ft: 4, speed_ft: 60 },
} as unknown as LegalActionsResult;

test("the situation is the human's own view: turn order, who is up, the fallen, who is in reach", () => {
  const mine = situationOf(yard(), "bren", listing)!;
  assert.equal(mine.turn, "bren");
  assert.equal(mine.up_in, undefined);
  assert.deepEqual(mine.next, ["goblin_4", "ilsa", "goblin_3", "maren", "torva"]);
  // Foes by distance, then the party (a fallen ally keeps its row); dead foes are only handles.
  assert.deepEqual(
    mine.creatures.map((c) => [c.handle, c.in_reach]),
    [["goblin_3", true], ["goblin_4", false], ["torva", false], ["maren", false], ["ilsa", false]],
  );
  assert.deepEqual(mine.down, ["goblin_1", "goblin_2", "wolf_3"]);
  assert.equal(mine.creatures[1].distance_ft, 24);
  // On someone else's turn: how many turns until Bren's, and nobody is marked in reach.
  const theirs = situationOf(yard(), "goblin_4", listing)!;
  assert.equal(theirs.up_in, 5);
  assert.ok(theirs.creatures.every((c) => !c.in_reach));
  // It carries nothing a player may not see: no other creature's Hit Points or Armor Class.
  for (const c of theirs.creatures) assert.deepEqual(Object.keys(c).sort(), ["conditions", "distance_ft", "handle", "health", "in_reach", "name", "side"]);
  // Only a player's view makes one.
  assert.equal(situationOf({ ...yard(), view: "dm" } as unknown as State, "bren"), undefined);
});

test("at 80x24 the panel is the bar, your line, the creatures by side and the fallen, in a third of the rows", () => {
  const rows = situationRows(situationOf(yard(), "bren", listing)!, { columns: 80, rows: 24 }).map(rowText);
  assert.deepEqual(rows, [
    "Round 5 · ▶ your turn · next goblin_4, ilsa, goblin_3",
    "Bren 12/20 HP · prone · Bless",
    "Foes   goblin_3  Goblin Warrior  bloodied   5 ft  in reach",
    "       goblin_4  Goblin Warrior  unhurt    24 ft",
    "Party  torva                     unhurt    10 ft",
    "       maren                     down      20 ft",
    "       ilsa                      unhurt    30 ft",
    "Down   goblin_1, goblin_2, wolf_3",
  ]);
  assert.ok(rows.length <= Math.floor(24 / 3));
  // Conditions come after the distance, so the feet stay in their column.
  const scared = situationOf({ ...yard(), others: [other("goblin_3", "Goblin Warrior", "hostile", "bloodied", 5, ["frightened", "prone"])] } as State, "bren", listing)!;
  assert.equal(rowText(situationRows(scared, { columns: 80, rows: 24 })[2]), "Foes   goblin_3  Goblin Warrior  bloodied   5 ft  in reach  frightened · prone");
  // One more creature than fits: the last row says how many more, and where to see them.
  const crowded = situationOf({ ...yard(), others: [...yard().others, other("wolf_9", "Wolf", "hostile", "unhurt", 50)] } as State, "bren", listing)!;
  const capped = situationRows(crowded, { columns: 80, rows: 24 }).map(rowText);
  assert.equal(capped.length, 8);
  assert.equal(capped[6], "       +2 more · /where");
});

test("at 60 columns the display names go; under 16 rows, with /panel, or out of combat it is one line", () => {
  const s = situationOf(yard(), "goblin_4")!;
  const narrow = situationRows(s, { columns: 60, rows: 40 }).map(rowText);
  assert.equal(narrow[0], "Round 5 · goblin_4's turn · you are up in 5");
  assert.equal(narrow[2], "Foes   goblin_3  bloodied   5 ft");
  assert.ok(narrow.every((row) => row.length <= 60), narrow.join("\n"));
  assert.equal(narrow.length, 8, "every creature fits in a third of 40 rows");
  assert.equal(situationRows(s, { columns: 80, rows: 15 }).length, 1);
  assert.equal(situationRows(s, { columns: 80, rows: 40 }, { folded: true }).length, 1);
  assert.equal(rowText(situationRows(s, { columns: 80, rows: 40 }, { stale: true })[0]), "Round 5 · goblin_4's turn · you are up in 5 · stale");
  const calm: Situation = { ...s, mode: "explore", turn: undefined, up_in: undefined, next: [], creatures: s.creatures.filter((c) => c.side === "party") };
  assert.deepEqual(situationRows(calm, { columns: 80, rows: 40 }).map(rowText), ["Explore · party: torva unhurt · maren down · ilsa unhurt"]);
});

test("the turn block heads the numbered options with what is left of the turn", () => {
  const lines = ["1. Longsword attack → goblin_3", "2. Second Wind", "3. Move…", "4. End turn"];
  const rows = turnRows(lines, { columns: 80, rows: 24 }, listing.budget!).map(rowText);
  assert.deepEqual(rows, [
    "Action used · Bonus Action free · Reaction free · 4 of 60 ft left",
    "1. Longsword attack → goblin_3         3. Move…",
    "2. Second Wind                         4. End turn",
  ]);
  // Narrow, or a follow-up pick: one column, under its title.
  assert.deepEqual(turnRows(lines, { columns: 50, rows: 24 }, undefined, "Longsword attack").map(rowText), ["Longsword attack:", ...lines]);
});

test("colour follows the Mill Table accent code: the terminal's own colours, Mill's hex in truecolour, none under NO_COLOR", () => {
  assert.deepEqual(paletteFor({}), { rust: "red", teal: "cyan", violet: "magenta", gold: "yellow", hint: "gray" });
  assert.equal(paletteFor({ COLORTERM: "truecolor" }).rust, "#f07a4a");
  assert.equal(paletteFor({ COLORTERM: "24bit", NAT20_THEME: "day" }).rust, "#a8401c");
  assert.deepEqual(Object.values(paletteFor({ NO_COLOR: "1", COLORTERM: "truecolor" })), [undefined, undefined, undefined, undefined, undefined]);
});

/** A terminal of a given size, as Ink writes to it in debug mode: every frame whole. */
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
  read = (): null => null;
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

test("on an 80x24 terminal the seat draws the panel and the turn block above the prompt, and the turn block goes when the turn ends", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }) });
  const stdout = new FakeStdout(80, 24);
  seat.start({
    stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: new FakeStdout(80, 24) as unknown as NodeJS.WriteStream,
    debug: true,
    interactive: true,
    patchConsole: false,
  });
  try {
    seat.show({ kind: "engine", text: "goblin_3 attacks Bren with Scimitar: 9, miss.", roll: "r7", seq: 12 });
    seat.show({ kind: "situation", situation: situationOf(yard(), "bren", listing)! });
    seat.show({ kind: "options", lines: ["1. Longsword attack → goblin_3", "2. End turn"], choices: [], budget: listing.budget! });
    void seat.ask({ kind: "combat_turn" });
    await until("the turn block", () => stdout.last.includes("Action used · Bonus Action free"));
    const frame = stdout.last;
    const order = ["[r7] goblin_3 attacks", "Round 5 · ▶ your turn", "Foes   goblin_3", "Action used", "1. Longsword attack", "Your turn: an option number"];
    const places = order.map((text) => frame.indexOf(text));
    assert.ok(places.every((p, i) => p >= 0 && (i === 0 || p > places[i - 1])), `in order:\n${frame}`);
    // The options are on screen, not in the log.
    assert.ok(!seat.getView().lines.some((l) => l.text.includes("Longsword attack")));
    // Someone else's turn: the turn block goes at once; the situation follows with the narration (AGT-37).
    seat.show({ kind: "situation", situation: situationOf(yard(), "goblin_4")! });
    await until("the turn block gone", () => !stdout.last.includes("Action used"));
    seat.show({ kind: "narration", speaker: "dm", text: "Bren steps back." });
    await until("the next turn", () => stdout.last.includes("you are up in 5"));
    assert.ok(!stdout.last.includes("Action used"));
    // A failed refresh keeps the last panel, marked stale; /panel folds it to the bar.
    seat.show({ kind: "situation" });
    seat.show({ kind: "narration", speaker: "dm", text: "The goblin snarls." });
    await until("stale", () => stdout.last.includes("you are up in 5 · stale"));
    seat.type("/panel\r");
    await until("folded", () => !stdout.last.includes("Foes   goblin_3"));
    assert.ok(stdout.last.includes("Round 5 · goblin_4's turn"));
  } finally {
    seat.stop();
  }
});

test("the wait line spins with who is thinking and the seconds, or stays one still line", () => {
  assert.equal(waitText("The DM is thinking", 0, 2), "⠹ The DM is thinking (/help for commands)");
  assert.equal(waitText("ilsa is thinking", 4, 11), "⠙ ilsa is thinking · 4s (/help for commands)");
  assert.equal(waitText(undefined, 0, 0), "⠋ The table is playing (/help for commands)");
  assert.equal(waitText("The DM is thinking", 7, undefined), "waiting... The DM is thinking (/help for commands)");
});

function startSeat(seat: InkSeat): FakeStdout {
  const stdout = new FakeStdout(80, 24);
  seat.start({
    stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: new FakeStdout(80, 24) as unknown as NodeJS.WriteStream,
    debug: true,
    interactive: true,
    patchConsole: false,
  });
  return stdout;
}

test("while no prompt is open the seat spins a braille indicator naming who the table waits on, and stops at the prompt", async () => {
  let now = 10_000;
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), animate: true, now: () => now });
  const stdout = startSeat(seat);
  try {
    seat.busy("The DM is thinking");
    await until("the DM's wait", () => stdout.last.includes("The DM is thinking"));
    const glyphs = () => new Set(stdout.frames.flatMap((f) => SPINNER.filter((g) => f.includes(`${g} The DM is thinking`))));
    await until("the spinner turning", () => glyphs().size >= 2);
    now += 3_200;
    await until("the seconds", () => stdout.last.includes("The DM is thinking · 3s"));
    seat.busy(undefined);
    await until("the plain wait", () => stdout.last.includes("The table is playing"));
    void seat.ask({ kind: "explore" });
    await until("the prompt", () => !stdout.last.includes("The table is playing"));
    const frames = stdout.frames.length;
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(stdout.frames.length - frames <= 1, "no frames spin under an open prompt");
  } finally {
    seat.stop();
  }
});

test("without animation (NO_COLOR, not a terminal) the wait is one still line", async () => {
  const seat = new InkSeat("bren", { palette: paletteFor({ NO_COLOR: "1" }), animate: false });
  const stdout = startSeat(seat);
  try {
    seat.busy("ilsa is thinking");
    await until("the still line", () => stdout.last.includes("waiting... ilsa is thinking"));
    const frames = stdout.frames.length;
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(stdout.frames.length, frames, "a still line draws no new frames");
    assert.ok(!SPINNER.some((g) => stdout.last.includes(g)));
  } finally {
    seat.stop();
  }
});

/** A scripted seat that also keeps the situations it is sent and what it was told the table waits on. */
class WatchingSeat extends ScriptedSeat {
  readonly situations: Situation[] = [];
  readonly waits: Array<string | undefined> = [];
  busy(on: string | undefined): void {
    this.waits.push(on);
  }
  override show(event: TableEvent): void {
    if (event.kind === "situation" && event.situation) this.situations.push(event.situation);
    super.show(event);
  }
}

test("with the panel on, the loop sends the human a situation before each decision, from the human's own view", async () => {
  const seat = new WatchingSeat("bren", [], ScriptedSeat.fight, ["torva", "maren", "ilsa"]);
  const t = await testTable({ seed: 23, seat });
  try {
    const players = ["torva", "maren", "ilsa"].map((h) => new ScriptedPlayer(h));
    const report = await new TableLoop({ table: t.table, dm: yardDm(), players, maxSteps: 500, situation: true }).run("m5_s3_yard");
    assert.equal(report.ended, "the adventure is over");
    assert.ok(seat.situations.length > 10, `${seat.situations.length} situations`);
    assert.ok(seat.situations.some((s) => s.turn === "bren" && s.creatures.some((c) => c.in_reach)), "Bren's turn marks who is in reach");
    assert.ok(seat.situations.some((s) => s.up_in !== undefined), "another's turn says when Bren is up");
    assert.ok(seat.situations.every((s) => s.me.handle === "bren" && s.creatures.every((c) => c.handle !== "bren")));
    // Every situation went to the human's inputs, where the leak scan reads it.
    const recorded = readFileSync(path.join(t.runDir, "inputs.jsonl"), "utf8").split("\n").filter((l) => l.includes('\\"kind\\":\\"situation\\"'));
    assert.equal(recorded.length, seat.situations.length);
    // The options came with the budget on Bren's turns.
    assert.ok(seat.shown.some((e) => e.kind === "options" && e.budget && e.budget.speed_ft >= 30));
    // The seat heard who the table waited on, and that nothing was left in flight; none of it was recorded.
    assert.ok(seat.waits.includes("The DM is thinking") && seat.waits.includes("torva is thinking"), JSON.stringify([...new Set(seat.waits)]));
    assert.equal(seat.waits.at(-1), undefined);
    assert.ok(!readFileSync(path.join(t.runDir, "inputs.jsonl"), "utf8").includes("is thinking"));
  } finally {
    t.close();
  }
});

test("the theme file holds every accent, tone and state the seat uses, and the seat reads it (M10 U2)", () => {
  const theme = JSON.parse(readFileSync(THEME_FILE, "utf8"));
  assert.deepEqual(themeProblems(theme), []);
  assert.deepEqual(Object.keys(theme.tones).sort(), Object.keys(TONE_STYLE).sort());
  assert.deepEqual(TONE_STYLE.prompt, { accent: "rust", bold: true });
  for (const band of ["unhurt", "bloodied", "down"]) assert.ok(theme.states[band], band);
  // A changed hex reaches the palette.
  const day = paletteFor({ COLORTERM: "truecolor", NAT20_THEME: "day" }, { ...theme, accents: { ...theme.accents, rust: { ...theme.accents.rust, day: "#000001" } } });
  assert.equal(day.rust, "#000001");
});

test("a missing or invalid theme file falls back to the built-in colours with one warning", () => {
  const warned: string[] = [];
  const dir = mkdtempSync(path.join(tmpdir(), "theme-"));
  const bad = path.join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ accents: { rust: { ansi: "red", night: "red", day: "#000000" } } }));
  assert.equal(loadTheme(bad, (w) => warned.push(w)).accents.rust.night, "#f07a4a");
  assert.equal(loadTheme(path.join(dir, "none.json"), (w) => warned.push(w)).accents.teal.ansi, "cyan");
  assert.equal(warned.length, 2);
  assert.match(warned[0], /^bad\.json: accent rust: needs ansi, and night and day as #rrggbb/);
});
