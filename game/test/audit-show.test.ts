// audit:show (AGT-135): the roll audit as a page, on the Milestone 5 yard fixture.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/paths.ts";
import { arithmetic, auditPage } from "../src/check/show.ts";

const FIXTURES = path.join(REPO, "game/test/fixtures");

function runFolder(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-show-"));
  for (const file of ["transcript.jsonl", "session-log.jsonl"]) copyFileSync(path.join(FIXTURES, `m5_yard.${file}`), path.join(dir, file));
  return dir;
}

test("each cited roll shows the engine's entry, what each channel heard, and whether the DM's line is the engine's words", () => {
  const dir = runFolder();
  try {
    const page = auditPage(dir, { limit: 0 });
    const cited = new Set(readFileSync(path.join(dir, "transcript.jsonl"), "utf8").match(/"rolls":\[[^\]]+\]/g)!.flatMap((m) => m.match(/r\d+/g)!));
    assert.match(page[1], new RegExp(`the transcript cites ${cited.size}, every one in the log`));
    assert.equal(page.filter((l) => /^r\d+ {2}/.test(l)).length, cited.size);
    assert.ok(page.some((l) => l.includes("✓ the engine's words")));
    assert.ok(!page.some((l) => l.includes("✗")));
    // The human's channel hears the player view: the attack total, never the AC.
    const heard = page.filter((l) => l.startsWith("  bren heard"));
    assert.ok(heard.length > 0);
    assert.ok(heard.every((l) => !/\bvs AC\b|\bvs DC\b/.test(l)));
    assert.match(page[2], /not run on this folder yet/);
    const attacks = auditPage(dir, { kind: "attack", limit: 0 }).filter((l) => /^r\d+ {2}/.test(l));
    assert.ok(attacks.length > 0 && attacks.length < cited.size && attacks.every((l) => l.includes("attack roll")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a roll the log doesn't have, or a DM line that isn't the engine's words, is shown as such", () => {
  const dir = runFolder();
  try {
    const file = path.join(dir, "transcript.jsonl");
    const lines = readFileSync(file, "utf8").split("\n");
    const at = lines.findIndex((l) => l.includes('"channel":"dm"') && l.includes('"kind":"engine"') && l.includes('"rolls":["r'));
    const id = /"rolls":\["(r\d+)"\]/.exec(lines[at])![1];
    lines[at] = lines[at].replace(/= (\d+)/, (_, n) => `= ${Number(n) + 1}`);
    lines.push(JSON.stringify({ at: "t", speaker: "dm", channel: "table", kind: "narration", text: "[r9999] A roll nobody made.", rolls: ["r9999"], log_head: 1 }));
    writeFileSync(file, lines.filter(Boolean).join("\n") + "\n");
    const page = auditPage(dir, { limit: 0 });
    assert.match(page[1], /1 of them not in the log: r9999/);
    assert.ok(page.includes("r9999  NOT IN THE ENGINE LOG"));
    const block = page.slice(page.findIndex((l) => l.startsWith(`${id}  `)));
    assert.ok(block.find((l) => l.startsWith("  DM heard"))!.endsWith("✗ not the engine's words"));
    assert.equal(auditPage(dir, { roll: id }).filter((l) => /^r\d+ {2}/.test(l)).length, 1);
    // A roll still cited elsewhere whose DM line is gone says so.
    const gone = lines.filter(Boolean).filter((l, i) => i !== at);
    writeFileSync(file, gone.join("\n") + "\n");
    assert.ok(auditPage(dir, { roll: id }).includes("  DM heard   no line on the DM's channel  ✗"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the arithmetic reads dice, the kept die, each modifier, the target and the outcome", () => {
  const roll = { id: "r1", label: "an attack roll vs torva", roller: "wolf_1", target: "torva", dice: [{ dice: "2d20", results: [20, 6], kept: 20 }], modifiers: [{ source: "Strength Modifier", value: 2 }, { source: "Proficiency: Proficient", value: 2 }], total: 24, against: { kind: "AC", value: 13 }, outcome: "critical_hit" };
  assert.equal(arithmetic(roll), "2d20 [20, 6, kept 20] +2 Strength +2 proficiency = 24 vs AC 13 → critical hit");
  assert.equal(arithmetic({ ...roll, dice: [{ dice: "4d6", results: [2, 5, 3, 6], kept: 16 }], modifiers: [], total: 16, against: undefined, outcome: "value" }), "4d6 [2, 5, 3, 6] = 16", "a sum is not a kept die");
  assert.equal(arithmetic({ ...roll, dice: [{ dice: "1d100", results: [99], kept: 99 }], modifiers: [], total: 99, against: undefined, outcome: "value" }), "1d100 [99] = 99");
});
