// The verdict of a run folder (M7 spec §3.2, design §3.3): a pure function of the folder's files.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { RUN_FORMAT, writeRunRecord, type RunRecord } from "../src/play/record.ts";
import { AUDIT_JSON, computeVerdict, CONFIRMATIONS_JSON, NARRATION_CHECK, VERDICT_JSON, writeVerdict } from "../src/play/verdict.ts";
import type { TranscriptRecord } from "../src/table/types.ts";

const SCENES = ["s1", "s2", "s3", "s4", "s5", "s6"];

function runRecord(over: Partial<RunRecord> = {}): RunRecord {
  return {
    run_format: RUN_FORMAT,
    run_id: "full-test",
    command: "play:full",
    profile: { name: "cheap", sha256: "0".repeat(64) },
    settings: {},
    build: { table_commit: "abc", dirty: false, engine_rev: "def", contract: "1.0.0-dev.36", schema_sha256: "0", node: "v26", os: "darwin arm64" },
    seed: 1,
    seats: { human: null, ai: ["bren", "torva", "maren", "ilsa"] },
    plan: SCENES,
    adventure: SCENES,
    time_limit_min: 120,
    scenes: SCENES.map((id, i) => ({ id, started_at: new Date(Date.UTC(2026, 9, 28, 9, i * 10)).toISOString(), ended_at: new Date(Date.UTC(2026, 9, 28, 9, i * 10 + 9)).toISOString(), rounds: 0, target_minutes: 10 })),
    started_at: "2026-10-28T08:59:00.000Z",
    ended_at: "2026-10-28T10:00:00.000Z",
    ended: "the adventure is over",
    stop: null,
    ...over,
  };
}

const line = (r: Partial<TranscriptRecord>): string => JSON.stringify({ at: "t", speaker: "table", channel: "run", kind: "system", text: "", rolls: [], log_head: 0, ...r });

/** A run folder with a clean audit, an empty narration check and a quiet session log. */
function folder(run: RunRecord, transcript: Array<Partial<TranscriptRecord>> = [], log: unknown[] = [{ seq: 1, kind: "session_started" }]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "verdict-"));
  writeRunRecord(dir, run);
  writeFileSync(path.join(dir, "transcript.jsonl"), transcript.map(line).join("\n") + "\n");
  writeFileSync(path.join(dir, "session-log.jsonl"), log.map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(path.join(dir, AUDIT_JSON), JSON.stringify({ passed: true, output: "Audit: 3 transcript lines, 0 engine rolls, 0 cited, 0 problems.\nLeak scan: 0 leaks." }));
  writeFileSync(path.join(dir, NARRATION_CHECK), "");
  return dir;
}

test("a run that played every scene with nothing wrong passes", () => {
  const v = computeVerdict(folder(runRecord()));
  assert.equal(v.verdict, "PASS", v.why);
  assert.equal(v.eligible, true);
  assert.equal(v.rows.find((r) => r.row === "4")?.status, "reported");
});

test("a stop from outside the game voids the run, even over a failed row", () => {
  const v = computeVerdict(folder(runRecord({ stop: "usage_limit", ended: "The Claude plan's usage limit was reached.", scenes: [] })));
  assert.equal(v.verdict, "VOID");
});

test("the time limit, a stall or a missing last scene fails row 1", () => {
  assert.equal(computeVerdict(folder(runRecord({ stop: "time_limit" }))).verdict, "FAIL");
  assert.equal(computeVerdict(folder(runRecord({ stop: "stalled" }))).rows[0].status, "fail");
  const short = runRecord();
  short.scenes = short.scenes.slice(0, 5);
  assert.match(computeVerdict(folder(short)).rows[0].detail, /s6 was not reached/);
});

test("the whole party down at once fails row 1a; one death is only reported", () => {
  const party = ["bren", "torva", "maren", "ilsa"];
  const down = party.map((target, i) => ({ seq: i + 2, kind: "life_state", target, state: i === 0 ? "dead" : "unconscious" }));
  assert.equal(computeVerdict(folder(runRecord(), [], down)).rows[1].status, "fail");
  const one = computeVerdict(folder(runRecord(), [], [down[0]])).rows[1];
  assert.equal(one.status, "pass");
  assert.match(one.detail, /dead: bren/);
});

test("an AI player's fallback after its retries ran out fails row 5; a timeout is only latency", () => {
  const spent = computeVerdict(folder(runRecord(), [{ kind: "fallback", speaker: "ilsa", text: "ilsa's turn ends", cause: "retries" }]));
  assert.equal(spent.rows.find((r) => r.row === "5")?.status, "fail");
  const slow = computeVerdict(folder(runRecord(), [{ kind: "fallback", speaker: "dm", text: "the DM's narrate is skipped", cause: "timeout" }]));
  assert.equal(slow.verdict, "PASS", slow.why);
});

test("a human decision refused more than twice is a flag: pending until Stas answers, a fail if he confirms it", () => {
  const refused = [1, 2, 3].map(() => ({ kind: "retry" as const, speaker: "bren", text: "bren's choice was not accepted", decision: "p7" }));
  const dir = folder(runRecord({ seats: { human: "bren", ai: ["torva", "maren", "ilsa"] } }), refused);
  const open = computeVerdict(dir);
  assert.equal(open.verdict, "PENDING");
  assert.deepEqual(open.flags.map((f) => f.id), ["refused:p7"]);
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ "refused:p7": { answer: "dismissed", note: "my typo" } }));
  assert.equal(computeVerdict(dir).verdict, "PASS");
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ "refused:p7": { answer: "confirmed", note: "the list was wrong" } }));
  assert.equal(computeVerdict(dir).verdict, "FAIL");
});

test("narration flags wait for Stas; without the check the run is pending", () => {
  const dir = folder(runRecord());
  writeFileSync(path.join(dir, NARRATION_CHECK), JSON.stringify({ id: "n1", line: 4, claim: "bren is next to the goblin", kind: "position" }) + "\n");
  assert.equal(computeVerdict(dir).verdict, "PENDING");
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ n1: { answer: "confirmed" } }));
  assert.equal(computeVerdict(dir).verdict, "FAIL");
  const unchecked = folder(runRecord());
  writeFileSync(path.join(unchecked, NARRATION_CHECK), "");
  assert.equal(computeVerdict(unchecked).verdict, "PASS");
});

test("an audit problem or a leak fails its row; a dirty checkout isn't eligible", () => {
  const dir = folder(runRecord({ build: { ...runRecord().build, dirty: true } }));
  writeFileSync(path.join(dir, AUDIT_JSON), JSON.stringify({ passed: false, output: "Audit: …\n  audit: r3 is cited and not in the log\n  leak: bren got hp" }));
  const v = computeVerdict(dir);
  assert.equal(v.verdict, "FAIL");
  assert.equal(v.eligible, false);
  assert.deepEqual(v.rows.filter((r) => r.status === "fail").map((r) => r.row), ["2", "leak"]);
});

test("a run of a few scenes isn't eligible; the time is play's, not the folder's finishing", () => {
  const few = computeVerdict(folder(runRecord({ plan: SCENES.slice(2, 3), scenes: runRecord().scenes.slice(2, 3) })));
  assert.equal(few.eligible, false);
  assert.deepEqual(few.not_eligible, ["it played 1 of the adventure's 6 scenes"]);
  // Play ends at 119 min; the run folder is finished two minutes later.
  const scenes = runRecord().scenes.map((s, i) => (i === 5 ? { ...s, ended_at: "2026-10-28T10:58:00.000Z" } : s));
  const late = computeVerdict(folder(runRecord({ scenes, ended_at: "2026-10-28T11:01:00.000Z" })));
  assert.equal(late.rows.find((r) => r.row === "1")?.status, "pass");
});

test("writing the verdict replaces the block at the top of report.md and keeps the rest", () => {
  const dir = folder(runRecord());
  writeFileSync(path.join(dir, "report.md"), "# play:full run\n\nthe body\n");
  writeVerdict(dir);
  writeVerdict(dir);
  const report = readFileSync(path.join(dir, "report.md"), "utf8");
  assert.equal(report.match(/<!-- verdict -->/g)?.length, 1);
  assert.match(report, /^<!-- verdict -->\n## Verdict: PASS/);
  assert.match(report, /<!-- \/verdict -->\n\n# play:full run\n\nthe body\n$/);
  assert.equal(JSON.parse(readFileSync(path.join(dir, VERDICT_JSON), "utf8")).verdict, "PASS");
});

test("a flag Stas adds by hand in confirmations.json counts in row 3 (M10 P2)", () => {
  const dir = folder(runRecord());
  writeFileSync(path.join(dir, NARRATION_CHECK), JSON.stringify({ id: "n1", line: 4, claim: "a goblin backs away", kind: "position" }) + "\n");
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ n1: { answer: "dismissed" }, added: [{ id: "h9-1", line: 9, claim: "the wolf ducks behind the cart with no move" }] }));
  const v = computeVerdict(dir);
  assert.equal(v.verdict, "FAIL");
  assert.deepEqual(v.flags.find((f) => f.id === "h9-1"), { id: "h9-1", row: "3", text: "hand: the wolf ducks behind the cart with no move (line 9)", answer: "confirmed", source: "hand" });
  assert.match(v.rows.find((r) => r.row === "3")!.detail, /^2 flags: 1 confirmed, 1 dismissed, 0 to confirm$/);
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ n1: { answer: "dismissed" }, added: [{ id: "h9-1", claim: "x", answer: "dismissed" }] }));
  assert.equal(computeVerdict(dir).verdict, "PASS", "a hand flag Stas dismisses again passes");
});
