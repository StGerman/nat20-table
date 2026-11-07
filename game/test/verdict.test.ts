// The verdict of a run folder (M7 spec §3.2, design §3.3): a pure function of the folder's files.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { RUN_FORMAT, writeRunRecord, type RunRecord } from "../src/play/record.ts";
import { AUDIT_JSON, cardsMet, computeVerdict, CONFIRMATIONS_JSON, NARRATION_CHECK, VERDICT_JSON, writeVerdict } from "../src/play/verdict.ts";
import { SUGGESTED_CARDS, wordReport } from "../src/play/word.ts";
import { readSuggested } from "../src/table/loop.ts";
import { offeredLine } from "../src/view.ts";
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

/** The session log's events in order, numbered as the engine numbers them. */
const withSeq = (events: Array<Record<string, unknown>>) => events.map((e, i) => ({ seq: i + 1, ...e }));

/**
 * A contract's Milestone 11 record (AGT-91): a DM pick that reads a deed from the last contract, a
 * deed written, a night card, a scouted card that reads that deed and comes to a fight, an arrival.
 */
const WORD_ON_THE_ROAD: Array<Record<string, unknown>> = [
  { kind: "cards_offered", cards: [{ id: "roadfolk_fire" }, { id: "lame_horse" }], rolls: ["r5", "r6"] },
  { kind: "card_picked", card: "roadfolk_fire", came: "dm_pick", reason: "it reads the toll the party paid last time" },
  { kind: "card_shown", card: "roadfolk_fire", zone: "wend_road", when: "road", reads: [{ deed: "paid_the_toll", by: ["bren"], day: 2, contract: 1 }] },
  { kind: "card_resolved", choice: "share" },
  { kind: "deed_remembered", deed: "shared_bread", by: ["bren", "maren"], day: 1, contract: 2 },
  { kind: "card_shown", card: "missing_sack", zone: "wend_road", when: "night" },
  { kind: "card_resolved", choice: "search" },
  { kind: "night" },
  { kind: "scout_looked", actor: "ilsa", roll: "r9", saw: true },
  { kind: "card_shown", card: "bog_wife", zone: "wend_road", when: "road", forewarned: "go_round", reads: [{ deed: "shared_bread", by: ["bren", "maren"], day: 1, contract: 2 }] },
  { kind: "card_resolved", choice: "go_round" },
  { kind: "combat_started" },
  { kind: "round", number: 1 },
  { kind: "round", number: 2 },
  { kind: "life_state", target: "torva", state: "unconscious" },
  { kind: "combat_over", reason: "no_hostiles" },
  { kind: "card_shown", card: "boys_story", zone: "wendford", when: "arrival" },
  { kind: "card_resolved", choice: "listen" },
];

test("a living-world run is judged on the Milestone 9 exit: the contract paid by the day limit, journeys, a road event, a fight outside a scene, the roster (AGT-81)", () => {
  const fw = ["fw_highsteads", "fw_road", "fw_wendford", "fw_wendmouth"];
  const run = runRecord({
    plan: fw,
    adventure: fw,
    scenes: fw.map((id, i) => ({ id, started_at: new Date(Date.UTC(2026, 10, 3, 9, i * 20)).toISOString(), ended_at: new Date(Date.UTC(2026, 10, 3, 9, i * 20 + 19)).toISOString(), rounds: 0, target_minutes: 10 })),
    ended: "the escort contract is done",
    campaign: { start_day: 1, day_limit: 3 },
    roster: { name: "wend", party: "continue", loaded_sha256: "a".repeat(64), saved_sha256: "b".repeat(64) } as never,
  });
  const leg = (place: string) => ({ kind: "traveled", leg: { arrived: true, at: { kind: "at", place } } });
  const wage = (to: string) => ({ kind: "ledger", reason: "wage", to, from: "npc:odda_vell", what: { kind: "coins", copper: 200 } });
  const party = ["bren", "torva", "maren", "ilsa"];
  const log = withSeq([
    { kind: "session_started" },
    ...party.map(wage),
    leg("wendford"),
    { kind: "card_resolved", choice: "clear" },
    { kind: "night" },
    ...WORD_ON_THE_ROAD,
    leg("wendmouth"),
    ...party.map(wage),
    { kind: "escort_settled", destination: "wendmouth" },
  ]);
  const dir = folder(run, [], log);
  const engineLog = [
    { request: { cmd: "start_combat" }, response: { ok: true, events: [{ kind: "combat_started" }] } },
    { request: { cmd: "choose_card" }, response: { ok: true, events: [{ kind: "combat_started" }] } },
  ];
  writeFileSync(path.join(dir, "engine-log.jsonl"), engineLog.map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(path.join(dir, "engine-stderr.log"), "nat20-api-server listening\n");
  const v = computeVerdict(dir);
  assert.equal(v.verdict, "PASS", v.why);
  const row = (id: string) => v.rows.find((r) => r.row === id)!;
  assert.match(row("1").title, /by the end of day 3/);
  assert.match(row("1").detail, /settled on day 3/);
  assert.match(row("m9-journeys").detail, /wendford, wendmouth/);
  assert.match(row("m9-pay").detail, /bren 4 gp/);
  assert.equal(row("m9-ledger").status, "pass");
  assert.match(row("m9-fight").detail, /^1 fights/, "the authored encounter doesn't count");
  assert.equal(row("m9-roster").status, "pass");
  assert.match(row("m11-deck").detail, /^3 road and night cards and 1 arrival cards decided; 1 DM picks, each with its reason/);
  assert.match(row("m11-thread").detail, /bog_wife reads shared_bread/);
  assert.equal(row("m11-story").status, "pass");
  assert.match(row("m11-memory").detail, /roadfolk_fire reads paid_the_toll \(contract 1, day 2, by bren\)/);
  const again = computeVerdict(folder({ ...run, roster: { ...run.roster!, party: "again" } }, [], log)).rows.find((r) => r.row === "m9-roster")!;
  assert.equal(again.status, "reported");
  assert.match(again.detail, /last journey played again from where it began/);

  // Settled after the last day, one Blade never paid, no card, no fight off the scene file, a new party.
  const late = [{ kind: "session_started" }, ...party.slice(1).map(wage), leg("wendford"), { kind: "night" }, { kind: "night" }, { kind: "night" }, { kind: "escort_settled", destination: "wendmouth" }];
  const bad = folder({ ...run, roster: { ...run.roster!, party: "new" } }, [], late);
  writeFileSync(path.join(bad, "engine-log.jsonl"), JSON.stringify(engineLog[0]) + "\n");
  writeFileSync(path.join(bad, "engine-stderr.log"), "ledger: odda_vell holds 1600 cp in the world but 1800 cp in the journal\n");
  const w = computeVerdict(bad);
  const status = (id: string) => w.rows.find((r) => r.row === id)!.status;
  assert.equal(w.verdict, "FAIL");
  assert.deepEqual(["1", "m9-journeys", "m9-pay", "m9-ledger", "m9-road", "m9-fight", "m9-roster"].map(status), ["fail", "fail", "fail", "fail", "fail", "fail", "reported"]);
  assert.match(w.rows.find((r) => r.row === "m9-ledger")!.detail, /^1 mismatches, first: odda_vell holds 1600 cp/);

  // No stderr in the folder: the trial balance can't be read, so the row waits.
  rmSync(path.join(dir, "engine-stderr.log"));
  assert.equal(computeVerdict(dir).rows.find((r) => r.row === "m9-ledger")!.status, "pending");
});

test("the Milestone 11 rows: the deck at work, a thread, story-space flags, and the world remembers on a continued roster (AGT-91)", () => {
  const run = runRecord({ campaign: { start_day: 1, day_limit: 3 }, roster: { name: "wend", party: "new" } as never });
  const row = (dir: string, id: string) => computeVerdict(dir).rows.find((r) => r.row === id)!;

  // Too few cards, a pick with no reason, no deed read later, a first run: fail, fail, reported.
  const thin = folder(run, [], withSeq([
    { kind: "card_picked", card: "lame_horse", came: "dm_pick", reason: " " },
    { kind: "card_shown", card: "lame_horse", zone: "wend_road", when: "road" },
    { kind: "card_resolved", choice: "rest" },
    { kind: "deed_remembered", deed: "rested_the_horse", by: [], day: 1, contract: 1 },
  ]));
  assert.equal(row(thin, "m11-deck").status, "fail");
  assert.match(row(thin, "m11-deck").detail, /1 without a reason \(lame_horse\)/);
  assert.equal(row(thin, "m11-thread").status, "fail");
  assert.match(row(thin, "m11-thread").detail, /no later card read one/);
  assert.equal(row(thin, "m11-memory").status, "reported");

  // A card that reads a deed written before this run is the world remembering; only on a continued roster does it gate.
  const later = folder({ ...run, roster: { name: "wend", party: "continue" } as never }, [], withSeq(WORD_ON_THE_ROAD.filter((e) => e.card !== "roadfolk_fire")));
  assert.equal(row(later, "m11-memory").status, "fail");
  assert.match(row(later, "m11-memory").detail, /no card read a deed from an earlier contract/);

  // The judge's story-space flags are the row's, not row 3's: pending until Stas answers, a fail when he confirms one.
  const flagged = folder(run, [], withSeq(WORD_ON_THE_ROAD));
  writeFileSync(path.join(flagged, NARRATION_CHECK), JSON.stringify({ id: "n4-1", line: 4, claim: "pleasant nothing", kind: "story_space", evidence_seq: [], text: "The road goes on." }) + "\n");
  assert.equal(row(flagged, "m11-story").status, "pending");
  assert.equal(row(flagged, "3").status, "pass");
  writeFileSync(path.join(flagged, CONFIRMATIONS_JSON), JSON.stringify({ "n4-1": { answer: "confirmed" } }));
  assert.equal(row(flagged, "m11-story").status, "fail");

  // The Silent Mill has no living world, so no Milestone 11 rows.
  assert.equal(computeVerdict(folder(runRecord())).rows.some((r) => r.row.startsWith("m11-")), false);
});

test("the run report's Word on the road lists deeds, cards, pay-offs, draw-three counts, fights, scout looks and suggested cards (AGT-91)", () => {
  const dir = folder(runRecord({ campaign: { start_day: 1, day_limit: 3 } }), [], withSeq(WORD_ON_THE_ROAD));
  writeFileSync(path.join(dir, SUGGESTED_CARDS), JSON.stringify(readSuggested('Here: {"cards": [{"id": "bread_returned", "text": "The roadfolk send bread back."}], "why": ["it carries on shared_bread"]}')));
  const report = wordReport(dir).join("\n");
  assert.match(report, /## Word on the road/);
  assert.match(report, /- shared_bread: contract 2, day 1, by bren, maren/);
  assert.match(report, /1\. roadfolk_fire: road; the DM picked it: it reads the toll the party paid last time; decided: share; reads paid_the_toll \(contract 1, day 2\)/);
  assert.match(report, /2\. missing_sack: night; the only card the draw rolled; decided: search/);
  assert.match(report, /3\. bog_wife: .*ilsa scouted \(r9\) and saw it; forewarned choice go_round taken; it came to a fight/);
  assert.match(report, /Pay-offs \(a card that read a deed\): 2: roadfolk_fire \(paid_the_toll\); bog_wife \(shared_bread\)/);
  assert.match(report, /Draw three: 1 draws offered cards; 1 DM picks, 1 of them a card that reads a deed; 0 draws the DM did not answer; passed over: lame_horse/);
  assert.match(report, /- card bog_wife, choice go_round: 2 rounds; dropped: torva; ended: no_hostiles/);
  assert.match(report, /Scout looks: 1, 1 saw it, 1 forewarned choices taken/);
  assert.match(report, /- bread_returned: The roadfolk send bread back\. \(why: it carries on shared_bread\)/);
  // A fight the DM starts after the road moved on is not the card's.
  const cards = cardsMet(withSeq([{ kind: "card_shown", card: "x", zone: "z", when: "road" }, { kind: "card_resolved", choice: "a" }, { kind: "traveled", leg: {} }, { kind: "combat_started" }]) as never);
  assert.equal(cards[0]!.fight, false);
  // The Silent Mill writes no section; an answer that is not JSON is kept as written.
  assert.deepEqual(wordReport(folder(runRecord())), []);
  assert.deepEqual(readSuggested("no cards today"), { unread: "no cards today" });
  // The DM's pick sees which offered card reads a deed (AGT-91).
  const offered = { id: "roadfolk_fire", zone: "wend_road", target: "blades", text: "A fire.", choices: [{ id: "share", text: "Share." }] };
  assert.match(offeredLine({ ...offered, reads: [{ deed: "paid_the_toll", day: 2, contract: 1 }] }, 1), /Choices: share: Share\.\. Reads: paid_the_toll \(contract 1, day 2\)\./);
  assert.doesNotMatch(offeredLine(offered, 1), /Reads/);
});
