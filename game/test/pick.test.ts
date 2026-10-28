// The pick list and the casting it sets (M7 spec §4.2, TASKS.md AGT-35).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { castParty, partyRoster, rosterLines } from "../src/play/run.ts";
import { pickCharacter } from "../src/ui/pick.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");

/** Answers the pick list with `lines`, then ends the input; returns the pick and what was printed. */
async function answer(lines: string[]): Promise<{ picked: string; printed: string }> {
  const input = new PassThrough();
  const output = new PassThrough();
  let printed = "";
  output.on("data", (chunk: Buffer) => (printed += chunk.toString()));
  input.end(lines.map((l) => `${l}\n`).join(""));
  const picked = await pickCharacter(partyRoster(MILL), "bren", { input, output });
  return { picked, printed };
}

test("the pick list shows each character's name, species, class, level and goal, the default marked", () => {
  assert.deepEqual(rosterLines(partyRoster(MILL), "bren"), [
    "1. Bren: Human Fighter, level 2 (the default). Keep the four of you together, fed and paid until something better than guard work comes along.",
    "2. Torva: Human Barbarian, level 2. Earn enough to buy back her family's farm, lost to debt while she was at war.",
    "3. Maren: Human Cleric, level 2. To feed the hungry and mend the hurt she meets, and to make up for the things the company did in the war.",
    "4. Ilsa: Dragonborn Wizard, level 2. To learn the magic and the stories of every place she passes through, and one day to write them into a proper book.",
  ]);
});

test("a number picks its character, a wrong one asks again, and Enter or no input keeps the default", async () => {
  const maren = await answer(["9", "two", "3"]);
  assert.equal(maren.picked, "maren");
  assert.match(maren.printed, /^Who do you play\?\n1\. Bren/);
  assert.match(maren.printed, /There is no 9 on the list\.\n/);
  assert.match(maren.printed, /There is no two on the list\.\n/);
  assert.equal((await answer([""])).picked, "bren");
  assert.equal((await answer([])).picked, "bren");
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
