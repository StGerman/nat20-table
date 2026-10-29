// The narration check's plumbing (M7 design §3.4, TASKS.md AGT-9) on the planted fixture
// `m7_narration`: the digest stage through `nat20-digest`, the batches the judge reads, the model
// judge's session handling with a stand-in session (CI never calls a model), and the file the
// verdict's row 3 reads. Whether a real judge catches the two planted lines is checked on the Mac.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/paths.ts";
import type { SessionConfig, TurnSession } from "../src/agents/sdk-session.ts";
import { NARRATION_DIGEST, readDigest } from "../src/check/digest.ts";
import { batches, JUDGE_CHOICE, JUDGE_PROMPT, ModelJudge, ScriptedJudge, type JudgeFlag } from "../src/check/judge.ts";
import { narrationCheck, PREVIOUS_CHECK } from "../src/check/narration.ts";
import { CONFIRMATIONS_JSON, NARRATION_CHECK } from "../src/play/verdict.ts";
import type { DigestRecord, DigestRun } from "../src/check/digest.ts";

const PACK = path.join(REPO, "scenarios/the_silent_mill");
const FIXTURES = path.join(REPO, "game/test/fixtures");

/** A run folder holding the planted fixture's transcript and engine log. */
function plantedRun(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "narration-"));
  for (const file of ["transcript.jsonl", "engine-log.jsonl"]) copyFileSync(path.join(FIXTURES, `m7_narration.${file}`), path.join(dir, file));
  return dir;
}

/** The two planted lines' numbers in the digest. */
function planted(dir: string): { adjacent: number; surrender: number } {
  const run = readDigest(dir);
  const line = (s: string) => run.digests.find((d) => d.text.includes(s))!.line;
  return { adjacent: line("toe to toe"), surrender: line("begs for mercy") };
}

test("the narration check digests the planted run, and writes the judge's flags for the verdict (AGT-9)", async () => {
  const dir = plantedRun();
  // Write the digest first so the flags can name the planted lines.
  const first = await narrationCheck(PACK, dir, new ScriptedJudge());
  assert.ok(first.ok, first.lines.join("\n"));
  assert.ok(existsSync(path.join(dir, NARRATION_DIGEST)));
  assert.equal(readFileSync(path.join(dir, NARRATION_CHECK), "utf8"), "", "a judge that finds nothing writes an empty check");
  const { adjacent, surrender } = planted(dir);
  const flags: JudgeFlag[] = [
    { line: adjacent, claim: "Bren is next to a goblin", kind: "position", evidence_seq: [] },
    { line: surrender, claim: "a goblin surrenders", kind: "surrender", evidence_seq: [] },
  ];
  const judge = new ScriptedJudge(flags);
  const check = await narrationCheck(PACK, dir, judge);
  assert.ok(check.ok, check.lines.join("\n"));
  const written = readFileSync(path.join(dir, NARRATION_CHECK), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(written.map((f) => [f.id, f.kind]), [[`n${adjacent}-1`, "position"], [`n${surrender}-1`, "surrender"]]);
  assert.match(written[0].text, /toe to toe/);
  assert.match(check.lines[0], /2 flags for Stas/);
  // About ten lines a batch, and every batch opens with the party and the full equipment.
  const run = readDigest(dir);
  assert.equal(judge.batches.length, Math.ceil(run.digests.length / 10));
  for (const batch of judge.batches) {
    assert.match(batch, /^# The party\n\n- bren: called bren, Bren, .*; coins 54 GP\n- torva: called .*; pronouns she\/her/);
    assert.match(batch, /\nEquipment:\n- bren: Chainmail \(equipped\), Longsword \(equipped\), Shield \(equipped\), Potion of Healing/);
  }
  assert.match(judge.batches[0], /Equipment: unchanged\./);
  const block = judge.batches.find((b) => b.includes("toe to toe"))!;
  assert.match(block, /Feet from each party member to each foe:\n- bren: goblin_1 \d+/);
  assert.match(block, /Engine lines since the line before:\n {2}\d+: /);
});

test("a run whose engine log no longer replays gets no narration check, so row 3 stays pending (AGT-9)", async () => {
  const dir = plantedRun();
  const log = readFileSync(path.join(dir, "engine-log.jsonl"), "utf8").split("\n");
  const at = log.findIndex((l) => l.includes('"cmd":"submit"'));
  const entry = JSON.parse(log[at]);
  entry.response.events[0].text = "something else happened.";
  log[at] = JSON.stringify(entry);
  writeFileSync(path.join(dir, "engine-log.jsonl"), log.join("\n"));
  const judge = new ScriptedJudge();
  const check = await narrationCheck(PACK, dir, judge);
  assert.equal(check.ok, false);
  assert.match(check.lines[0], /didn't replay \(engine log line \d+ \(submit\)/);
  assert.equal(judge.batches.length, 0);
  assert.ok(!existsSync(path.join(dir, NARRATION_CHECK)));
});

/** A stand-in session: each turn runs `answer` with the session's tools, as the model would call them. */
function standIn(answer: (tools: SessionConfig["tools"], message: string, opened: number) => Promise<void>) {
  const opened: SessionConfig[] = [];
  let closed = 0;
  const open = (config: SessionConfig): TurnSession => {
    opened.push(config);
    const n = opened.length;
    return {
      turn: async (message) => {
        await answer(config.tools, message, n);
        return { text: "", final: "", usage: {} as never };
      },
      close: async () => void (closed += 1),
    };
  };
  return { open, opened, closed: () => closed };
}

const call = (tools: SessionConfig["tools"], args: Record<string, unknown>) => tools.find((t) => t.name === "report")!.handler(args, {});

test("the model judge opens a fresh session a batch with the report tool alone, and keeps only flags on its own lines (AGT-9)", async () => {
  const s = standIn(async (tools, message) => {
    const lines = [...message.matchAll(/^## Line (\d+)/gm)].map((m) => Number(m[1]));
    await call(tools, {
      flags: [
        { line: lines[0], claim: "c", kind: "hp", evidence_seq: [3] },
        { line: 999, claim: "not in this batch", kind: "hp", evidence_seq: [] },
      ],
      untracked: [{ line: lines[1], item: "a loaf of bread" }],
    });
  });
  const judge = new ModelJudge({ open: s.open });
  const report = await judge.judge("## Line 4 (to the table)\nx\n\n## Line 5 (to the table)\ny", [4, 5]);
  assert.deepEqual(report, { flags: [{ line: 4, claim: "c", kind: "hp", evidence_seq: [3] }], untracked: [{ line: 5, item: "a loaf of bread" }] });
  await judge.judge("## Line 6 (to the table)\nz", [6]);
  assert.equal(s.opened.length, 2, "one session a batch");
  assert.equal(s.closed(), 2);
  for (const config of s.opened) {
    assert.equal(config.systemPrompt, JUDGE_PROMPT);
    assert.deepEqual(config.choice, JUDGE_CHOICE);
    assert.deepEqual(config.tools.map((t) => t.name), ["report"]);
  }
  assert.deepEqual(JUDGE_CHOICE, { model: "claude-opus-5-5", effort: "low" });
});

test("a batch the model judge never reports on is asked once more, then the check stops (AGT-9)", async () => {
  let turns = 0;
  const once = standIn(async (tools, _message, n) => {
    turns += 1;
    if (n === 2) await call(tools, { flags: [] });
  });
  assert.deepEqual(await new ModelJudge({ open: once.open }).judge("## Line 1\nx", [1]), { flags: [], untracked: [] });
  assert.equal(turns, 2);
  const never = standIn(async () => undefined);
  await assert.rejects(new ModelJudge({ open: never.open }).judge("## Line 1\nx", [1]), /never called report for lines 1 to 1/);
  assert.equal(never.opened.length, 2);
});

test("the judge's prompt keeps to spec §4.3: the kinds, the three inventory flags, and untracked props (AGT-9)", () => {
  for (const kind of ["hp:", "death:", "position:", "condition:", "action:", "surrender:", "inventory:", "identity:"]) assert.ok(JUDGE_PROMPT.includes(`- ${kind}`), kind);
  assert.match(JUDGE_PROMPT, /inventory: only three things/);
  assert.match(JUDGE_PROMPT, /list those as untracked/);
  // The judge's batches are built from the digest alone: the planted fixture's first batch.
  const dir = plantedRun();
  return narrationCheck(PACK, dir, new ScriptedJudge()).then(() => {
    const first = batches(readDigest(dir))[0];
    assert.deepEqual(first.lines, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

test("a check that fails after an earlier one leaves no check behind, so row 3 goes back to pending (AGT-9)", async () => {
  const dir = plantedRun();
  assert.ok((await narrationCheck(PACK, dir, new ScriptedJudge())).ok);
  assert.ok(existsSync(path.join(dir, NARRATION_CHECK)));
  const failing = { judge: async () => Promise.reject(new Error("offline")) };
  const check = await narrationCheck(PACK, dir, failing);
  assert.equal(check.ok, false);
  assert.ok(!existsSync(path.join(dir, NARRATION_CHECK)), "the old check is not the verdict's any more");
  assert.ok(existsSync(path.join(dir, PREVIOUS_CHECK)), "it is kept aside for the next attempt's answers");
  assert.ok((await narrationCheck(PACK, dir, new ScriptedJudge())).ok);
  assert.ok(existsSync(path.join(dir, NARRATION_CHECK)));
  assert.ok(!existsSync(path.join(dir, PREVIOUS_CHECK)));
});

test("an answer stays with its flag only while a new check reports the same claim under that id (AGT-9)", async () => {
  const dir = plantedRun();
  assert.ok((await narrationCheck(PACK, dir, new ScriptedJudge())).ok);
  const { adjacent, surrender } = planted(dir);
  const position: JudgeFlag = { line: adjacent, claim: "Bren is next to a goblin", kind: "position", evidence_seq: [] };
  const mercy: JudgeFlag = { line: surrender, claim: "a goblin surrenders", kind: "surrender", evidence_seq: [] };
  assert.ok((await narrationCheck(PACK, dir, new ScriptedJudge([position, mercy]))).ok);
  const answers = { [`n${adjacent}-1`]: { answer: "dismissed" }, [`n${surrender}-1`]: { answer: "confirmed" }, "refused:p7": { answer: "dismissed" } };
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify(answers));
  // Run again: the same position claim, and another claim now holds the surrender line's first id.
  const other: JudgeFlag = { line: surrender, claim: "goblin_3 is unhurt", kind: "hp", evidence_seq: [] };
  assert.ok((await narrationCheck(PACK, dir, new ScriptedJudge([position, other, mercy]))).ok);
  const kept = JSON.parse(readFileSync(path.join(dir, CONFIRMATIONS_JSON), "utf8"));
  assert.deepEqual(Object.keys(kept).sort(), [`n${adjacent}-1`, "refused:p7"].sort(), "the surrender answer is dropped, not given to the hp claim");
});

test("lines said at one log head across a batch boundary carry their engine lines into the next batch (AGT-9)", () => {
  const record = (line: number, log_head: number, engine_lines: string[]): DigestRecord => ({
    line, text: `line ${line}`, channel: "table", log_head, scene: "s3", mode: "combat", round: 1, turn: null, combat_over: false,
    creatures: [], fled: [], adjacent: [], nearest_foe_ft: [], foes_ft: {}, engine_lines, inventory: [],
  });
  const run = { party: [], digests: [record(1, 4, ["3: bren hits goblin_1"]), record(2, 9, ["8: goblin_1 misses bren"]), record(3, 9, [])] } as unknown as DigestRun;
  const [first, second] = batches(run, 2);
  assert.match(first.text, /8: goblin_1 misses bren/);
  assert.match(second.text, /Engine lines from just before[^\n]*\n {2}8: goblin_1 misses bren\nNo engine lines since the line before\./);
  assert.doesNotMatch(second.text, /3: bren hits goblin_1/, "only the lines at the same log head carry");
});
