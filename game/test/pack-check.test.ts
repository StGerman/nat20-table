// The pack check (M6 step 8, TASKS.md MAP-4, decision 0031): every pack in the repository passes,
// the published schema is current, and each kind of mistake a pack can make is caught. Needs
// `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { type Adventure, SCHEMA_FILE, schemaText } from "../src/pack/adventure.ts";
import { checkPack, repoPacks } from "../src/pack/check.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");

function readJson(file: string) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** A copy of The Silent Mill, laid out as in the repo so its shared lore resolves, with `edit` applied. */
function planted(edit: (skeleton: Adventure, pack: string) => void): { pack: string; close(): void } {
  const root = mkdtempSync(path.join(tmpdir(), "pack-check-"));
  const pack = path.join(root, "scenarios/the_silent_mill");
  cpSync(MILL, pack, { recursive: true });
  cpSync(path.join(REPO, "lore"), path.join(root, "lore"), { recursive: true });
  const skeleton = readJson(path.join(pack, "adventure.json")) as Adventure;
  edit(skeleton, pack);
  writeFileSync(path.join(pack, "adventure.json"), JSON.stringify(skeleton, null, 4));
  return { pack, close: () => rmSync(root, { recursive: true, force: true }) };
}

test("every pack in scenarios/ passes the pack check and loads every scene", async () => {
  const packs = repoPacks();
  assert.ok(packs.includes(MILL));
  for (const pack of packs) {
    const report = await checkPack(pack);
    assert.deepEqual(report.problems, [], pack);
    const skeleton = readJson(path.join(pack, "adventure.json")) as Adventure;
    assert.deepEqual(report.loaded, skeleton.scenes.map((s) => s.id));
  }
});

test("the published schema is generated from the skeleton's type", () => {
  assert.equal(readFileSync(SCHEMA_FILE, "utf8"), schemaText(), "run `npm run pack:schema` and commit the result");
});

const PLANTS: [string, (skeleton: Adventure, pack: string) => void, string][] = [
  ["an unread format_version", (s) => (s.format_version = 2), "format_version 2 is not one this game reads"],
  ["a field the schema doesn't have", (s) => ((s.scenes[0] as Record<string, unknown>).music = "a fiddle"), "adventure.json scenes.0"],
  ["a missing card", (_, pack) => rmSync(path.join(pack, "cards/maren.md")), "cards/maren.md is named but missing"],
  ["an AI seat without a card", (s) => delete s.party[2].card, "party maren has an AI seat and no card"],
  ["prose outside the pack", (s) => (s.scenes[0].prose = "../../lore/the_wend_valley.md"), "is outside the pack"],
  [
    "a card that links outside the pack",
    (_, pack) => {
      rmSync(path.join(pack, "cards/maren.md"));
      symlinkSync(path.join(pack, "../../lore/the_wend_valley.md"), path.join(pack, "cards/maren.md"));
    },
    "cards/maren.md links outside the pack",
  ],
  ["a folder named as a card", (s) => (s.party[2].card = "cards"), "cards can't be read as a file: EISDIR"],
  [
    "a file named scenes",
    (_, pack) => {
      rmSync(path.join(pack, "scenes"), { recursive: true });
      writeFileSync(path.join(pack, "scenes"), "");
    },
    "scenes can't be read as a folder: ENOTDIR",
  ],
  ["a check the scene file doesn't declare", (s) => (s.scenes[0].checks[0].check = "reeve_bribe"), "names check reeve_bribe"],
  ["an encounter the scene file doesn't declare", (s) => (s.scenes[2].encounters[0].encounter = "yard_brawl"), "names encounter yard_brawl"],
  ["an exit to an unlisted scene", (s) => (s.scenes[0].exits[0].to = "s9_nowhere"), "exits to s9_nowhere"],
  ["a scene with no exit before the last", (s) => (s.scenes[1].exits = []), "scene s2_mill_road has no exit"],
  ["an NPC linked to a creature the scene doesn't place", (s) => (s.npcs[3].creatures![0].handle = "goblin_9"), "names goblin_9, which scene s3_mill_yard doesn't place"],
  ["a scene listing an unknown NPC", (s) => s.scenes[0].npcs.push("abel"), "lists npc abel"],
  ["an NPC listed twice", (s) => s.npcs.push(s.npcs[0]), "npc osric_hale is listed twice"],
  [
    "a scene file in no scene",
    (_, pack) => cpSync(path.join(pack, "scenes/s6_wrap_up.json"), path.join(pack, "scenes/s7_epilogue.json")),
    "scenes/s7_epilogue.json is in no scene of the skeleton",
  ],
  ["a scene without its file", (_, pack) => rmSync(path.join(pack, "scenes/s6_wrap_up.json")), "scene s6_wrap_up has no scenes/s6_wrap_up.json"],
  [
    "a party member the first scene doesn't place",
    (s) => s.party.push({ handle: "pip", seat: "ai", card: "cards/ilsa.md" }),
    "the first scene doesn't place party member pip",
  ],
  [
    "a scene file the engine refuses",
    (_, pack) => {
      const file = path.join(pack, "scenes/s4_captured_goblin.json");
      const scene = readJson(file);
      scene.party_start[0] = "the_moon";
      writeFileSync(file, JSON.stringify(scene));
    },
    "the engine refused scene s4_captured_goblin",
  ],
];

for (const [name, edit, expected] of PLANTS) {
  test(`the pack check catches ${name}`, async () => {
    const { pack, close } = planted(edit);
    try {
      const report = await checkPack(pack);
      assert.ok(
        report.problems.some((p) => p.includes(expected)),
        `expected a problem with "${expected}", got ${JSON.stringify(report.problems)}`,
      );
    } finally {
      close();
    }
  });
}

test("the pack:check command prints each problem and exits 1", () => {
  const { pack, close } = planted((s) => (s.format_version = 2));
  try {
    const cli = path.join(REPO, "game/src/pack/cli.ts");
    const run = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "check", pack], { encoding: "utf8" });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /1 problem\(s\)\n {2}- format_version 2 is not one this game reads/);
  } finally {
    close();
  }
});
