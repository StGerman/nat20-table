// The party between runs in the game loop (TASKS.md API-45): the roster file, its hash chain, the
// run that saves it and the run that plays it again, and the start screen's "continue or new party".
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Roster } from "@nat20-table/engine-client";
import { REPO } from "../src/engine.ts";
import { rosterReport } from "../src/play/driver.ts";
import type { RunRecord } from "../src/play/record.ts";
import { readRoster, replayRoster, rosterFile, rosterLine, rosterRefusal, writeRoster } from "../src/play/roster.ts";
import { partyRoster } from "../src/play/run.ts";
import { paletteFor } from "../src/ui/palette.ts";
import { partyKey, partyRows, pickOnScreen } from "../src/ui/pick.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");

const roster = (xp: number): Roster => ({
  format: 2,
  characters: [
    { handle: "torva", pregen: "torva", level: 3, xp, choices: [], equipment: [], purse: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 }, exhaustion: 0, malnutrition: 0, days_without_food: 0 },
  ],
}) as unknown as Roster;

test("a roster written is read back with its hash, and the chain says whether the file is the one its last save wrote", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rosters-"));
  try {
    assert.equal(readRoster(dir, "wend"), undefined, "no roster yet");
    const first = writeRoster(dir, "wend", roster(900), "run-1");
    const read = readRoster(dir, "wend")!;
    assert.equal(read.sha256, first);
    assert.equal(read.chain, "held");
    assert.equal(read.roster.characters[0].xp, 900);
    // A hand edit: the file no longer has the hash its last save logged.
    writeFileSync(rosterFile(dir, "wend"), JSON.stringify(roster(5000), null, 2) + "\n");
    assert.equal(readRoster(dir, "wend")!.chain, "broken");
    // The next save starts the chain again from what it wrote.
    const second = writeRoster(dir, "wend", roster(950), "run-2");
    assert.notEqual(second, first);
    assert.equal(readRoster(dir, "wend")!.chain, "held");
    const log = readFileSync(path.join(dir, "wend.chain.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { run_id: string; sha256: string });
    assert.deepEqual(log.map((l) => [l.run_id, l.sha256]), [["run-1", first], ["run-2", second]]);
    // A roster copied in with no save behind it.
    writeFileSync(rosterFile(dir, "copied"), JSON.stringify(roster(1)));
    assert.equal(readRoster(dir, "copied")!.chain, "unlogged");
    assert.equal(rosterLine(read.roster, new Map([["torva", "Torva"]])), "Torva (level 3)");
    // A save that crashed after logging its hash leaves the roster before it: still a saved file.
    appendFileSync(path.join(dir, "wend.chain.jsonl"), JSON.stringify({ run_id: "run-3", sha256: "c".repeat(64) }) + "\n");
    assert.equal(readRoster(dir, "wend")!.chain, "held");
    // A file that is not a roster is refused with a plain reason, before anything shows it.
    writeFileSync(rosterFile(dir, "empty"), "{}");
    assert.throws(() => readRoster(dir, "empty"), /is not a saved party/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a run with --roster saves the party at its end, and the next run plays that party and saves it again; --new-party starts over", () => {
  const out = mkdtempSync(path.join(tmpdir(), "roster-runs-"));
  const rosters = path.join(out, "rosters");
  try {
    const cli = path.join(REPO, "game/src/play/scene.ts");
    const args = ["--experimental-strip-types", "--no-warnings", cli, "--dm", "scripted", "--players", "scripted", "--seed", "5", "--no-audit", "--no-upload", "--rosters", rosters, "--roster", "mill"];
    const play = (dir: string, ...more: string[]) => {
      const run = spawnSync(process.execPath, [...args, "--out", path.join(out, dir), ...more], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const [folder] = readdirSync(path.join(out, dir));
      return {
        record: JSON.parse(readFileSync(path.join(out, dir, folder, "run.json"), "utf8")) as RunRecord,
        report: readFileSync(path.join(out, dir, folder, "report.md"), "utf8"),
        transcript: readFileSync(path.join(out, dir, folder, "transcript.jsonl"), "utf8"),
      };
    };

    const first = play("first");
    assert.equal(first.record.roster?.party, "new");
    assert.equal(first.record.roster?.loaded_sha256, null);
    assert.match(first.record.roster?.saved_sha256 ?? "", /^[0-9a-f]{64}$/, first.record.roster?.not_saved ?? "");
    assert.match(first.transcript, /a new party, saved as mill when the run ends/);
    const savedFirst = readRoster(rosters, "mill")!;
    assert.equal(savedFirst.sha256, first.record.roster?.saved_sha256);
    assert.deepEqual(savedFirst.roster.characters.map((c) => c.handle).sort(), ["bren", "ilsa", "maren", "torva"]);
    const xp = new Map(savedFirst.roster.characters.map((c) => [c.handle, c.xp]));
    assert.ok([...xp.values()].some((n) => n > 0), "the fight's XP is in the roster");

    const second = play("second");
    assert.equal(second.record.roster?.party, "continue");
    assert.equal(second.record.roster?.loaded_sha256, first.record.roster?.saved_sha256, "the chain: what the last run saved is what this one loaded");
    assert.equal(second.record.roster?.chain, "held");
    assert.match(second.transcript, /the party saved as mill: /);
    assert.match(second.report, /- Roster: continued the party saved as mill \(sha256 [0-9a-f]{12}\); saved \(sha256 [0-9a-f]{12}\)\n/);
    for (const c of readRoster(rosters, "mill")!.roster.characters) assert.ok(c.xp >= (xp.get(c.handle) ?? 0), `${c.handle} keeps the XP of the last run`);

    const fresh = play("fresh", "--new-party");
    assert.equal(fresh.record.roster?.party, "new");
    assert.equal(fresh.record.roster?.loaded_sha256, null);

    const refused = spawnSync(process.execPath, [...args.filter((a) => a !== "mill" && a !== "--roster"), "--out", out, "--new-party"], { encoding: "utf8" });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /--new-party starts a saved party over: name it with --roster\./);
    const badName = spawnSync(process.execPath, [...args, "--out", out, "--roster", "../x"], { encoding: "utf8" });
    assert.equal(badName.status, 2);
    assert.match(badName.stderr, /a roster's name is lowercase letters, digits and dashes/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("the report says where the party came from and whether it was saved", () => {
  const base = { name: "mill", loaded_sha256: "a".repeat(64), saved_sha256: "b".repeat(64), not_saved: null };
  assert.equal(rosterReport({ ...base, party: "continue", chain: "broken" }), `Roster: continued the party saved as mill (sha256 ${"a".repeat(12)}, changed after its last save); saved (sha256 ${"b".repeat(12)})`);
  assert.equal(rosterReport({ ...base, party: "new", chain: null, loaded_sha256: null, saved_sha256: null, not_saved: "the party never reached a scene" }), "Roster: a new party for the roster mill; not saved: the party never reached a scene");
});

test("the party question: continue is first and Enter takes it; the arrows and 1 or 2 move", () => {
  assert.deepEqual(partyRows("Torva (level 3)", 0), ["❯ 1. Continue with your party: Torva (level 3)", "  2. Start a new party (it replaces the saved one when this game ends)"]);
  assert.equal(partyKey({ at: 0 }, { kind: "enter" }).party, "continue");
  assert.equal(partyKey({ at: 0 }, { kind: "down" }).state.at, 1);
  assert.equal(partyKey({ at: 1 }, { kind: "up" }).state.at, 0);
  assert.equal(partyKey({ at: 0 }, { kind: "digit", digit: 2 }).state.at, 1);
  assert.equal(partyKey({ at: 1 }, { kind: "digit", digit: 7 }).state.at, 1);
  assert.equal(partyKey({ at: 1 }, { kind: "enter" }).party, "new");
});

test("a party with a journey behind it can play that journey again; one saved by an older game is refused in one line", () => {
  const torva = roster(900).characters[0];
  const world = { map: "wend", state: { memory: {}, contract: {} } };
  const start = { characters: [{ ...torva, xp: 300, level: 2 }] };
  const saved = { ...roster(900), world, contract_start: start } as unknown as Roster;
  assert.deepEqual(replayRoster(saved), { format: 2, characters: start.characters });
  const later = { ...saved, contract_start: { ...start, world } } as unknown as Roster;
  assert.deepEqual(replayRoster(later), { format: 2, characters: start.characters, world });
  assert.equal(replayRoster(roster(900)), undefined, "no journey yet");
  assert.equal(rosterRefusal(roster(900)), undefined);
  assert.match(rosterRefusal({ ...roster(900), format: 1 } as Roster) ?? "", /older version of the game.*--new-party/);
  const base = { name: "wend", loaded_sha256: "a".repeat(64), saved_sha256: "b".repeat(64), not_saved: null, chain: "held" as const };
  assert.equal(rosterReport({ ...base, party: "again" }), `Roster: played the last journey of the party saved as wend again from where it began (sha256 ${"a".repeat(12)}); saved (sha256 ${"b".repeat(12)})`);
});

test("the party question with a journey behind it has a third answer; Enter still continues", () => {
  assert.deepEqual(partyRows("Torva (level 3)", 2, true), [
    "  1. Continue with your party: Torva (level 3)",
    "  2. Start a new party (it replaces the saved one when this game ends)",
    "❯ 3. Play the last journey again from where it began, with the party as it was then",
  ]);
  assert.equal(partyKey({ at: 0 }, { kind: "enter" }, true).party, "continue");
  assert.equal(partyKey({ at: 0 }, { kind: "digit", digit: 3 }, true).state.at, 2);
  assert.equal(partyKey({ at: 0 }, { kind: "digit", digit: 3 }).state.at, 0, "no third answer without a journey");
  assert.equal(partyKey({ at: 2 }, { kind: "down" }, true).state.at, 0);
  assert.equal(partyKey({ at: 0 }, { kind: "up" }, true).state.at, 2);
  assert.equal(partyKey({ at: 2 }, { kind: "enter" }, true).party, "again");
});

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

test("with a saved party the start screen asks first; continuing, the list shows the saved levels", async () => {
  for (const [keys, party, level] of [[["\r"], "continue", "3"], [["2", "\r"], "new", "2"]] as const) {
    const stdin = new FakeStdin();
    const stdout = new FakeStdout(120, 30);
    const render = { stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream, stderr: new FakeStdout(120, 30) as unknown as NodeJS.WriteStream, debug: true, patchConsole: false };
    const picking = pickOnScreen(partyRoster(MILL), "bren", { title: "The Silent Mill", palette: paletteFor({ NO_COLOR: "1" }), render, saved: { line: "Bren (level 3)", levels: new Map([["bren", 3]]) } });
    await until("the party question", () => stdout.last.includes("The Silent Mill · Your party") && stdout.last.includes("❯ 1. Continue with your party: Bren (level 3)"));
    for (const key of keys) {
      stdin.press(key);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await until("the pick list", () => stdout.last.includes("Who do you play?"));
    assert.ok(stdout.last.includes(`❯ 1. Bren   Human Fighter ${level} · default`), stdout.last);
    stdin.press("\r");
    const picked = await picking;
    assert.equal(picked.handle, "bren");
    assert.equal(picked.party, party);
    picked.instance.unmount();
  }
});
