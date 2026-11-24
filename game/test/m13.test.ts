// The Milestone 13 exit (AGT-104, design `docs/design/m13-system-design.md` §4.2 rule 9 and §8):
// outcome deeds and markers read from the shipped packs, the rows `m13-written`, `m13-carried`
// and `m13-readable`, the judge's question on the carried card, and the report's lines.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/paths.ts";
import type { SessionConfig, TurnSession } from "../src/agents/sdk-session.ts";
import { NARRATION_DIGEST, type DigestRecord } from "../src/check/digest.ts";
import { ASK_PROMPT, CARRIED_QUESTION, JUDGE_CHOICE, ModelJudge, ScriptedJudge } from "../src/check/judge.ts";
import { narrationCheck } from "../src/check/narration.ts";
import { SESSION_LOG } from "../src/engine.ts";
import { deedKinds, effectOutcomes, worldSources } from "../src/play/deeds.ts";
import { cardLines, carriedCard, carriedReport, JUDGE_QUESTION, outcomesOf, sceneOutcomesOf } from "../src/play/m13.ts";
import { RUN_FORMAT, writeRunRecord, type RunRecord } from "../src/play/record.ts";
import { AUDIT_JSON, computeVerdict, CONFIRMATIONS_JSON, NARRATION_CHECK } from "../src/play/verdict.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");
const FAIR = path.join(REPO, "scenarios/fair_in_wend");

test("rule 9: outcomes and markers are read from the packs on the Wend map", () => {
  const kinds = deedKinds(worldSources(FAIR));
  for (const d of ["crossed_millbeck", "wenna_saved", "killed_gritch"]) assert.ok(kinds.markers.has(d), `${d} is a marker`);
  for (const d of ["toll_men_spared", "toll_men_fought", "snitt_yielded", "yard_to_the_end"]) assert.ok(kinds.outcomes.has(d), `${d} is an outcome`);
  // The Mill reads the same world: its own scenes are among the sources either way.
  assert.deepEqual([...outcomesOf(MILL)].sort(), [...kinds.outcomes].sort());
  // A check's branches are alternatives; a deed on every way through is no outcome of it.
  const ways = effectOutcomes([
    { do: "remember", deed: "a" },
    { do: "check", success: [{ do: "remember", deed: "b" }], failure: [{ do: "remember", deed: "c" }] },
  ]);
  assert.deepEqual(ways.map((w) => [...w].sort()), [["a", "b"], ["a", "c"]]);
  const one = deedKinds([{ source: "card x", outcomes: ways }, { source: "card y", outcomes: [new Set(["d"]), new Set()] }]);
  assert.deepEqual([...one.outcomes].sort(), ["b", "c"]);
  // A choice that writes nothing is no alternative: `d` stays a marker.
  assert.deepEqual([...one.markers].sort(), ["a", "d"]);
});

function runRecord(over: Partial<RunRecord> = {}): RunRecord {
  return {
    run_format: RUN_FORMAT,
    run_id: "m13-test",
    command: "play:unattended",
    profile: { name: "cheap", sha256: "0".repeat(64) },
    settings: { pack: { value: MILL, from: "flag" } } as never,
    build: { table_commit: "abc", dirty: false, engine_rev: "def", contract: "1.0.0-dev.75", schema_sha256: "0", node: "v26", os: "darwin arm64" },
    seed: 1,
    seats: { human: null, ai: ["bren", "torva", "maren", "ilsa"] },
    plan: ["s1"],
    adventure: ["s1"],
    time_limit_min: 120,
    scenes: [{ id: "s1", started_at: "2026-11-16T09:00:00.000Z", ended_at: "2026-11-16T09:30:00.000Z", rounds: 0, target_minutes: 10 }],
    started_at: "2026-11-16T09:00:00.000Z",
    ended_at: "2026-11-16T09:31:00.000Z",
    ended: "the adventure is over",
    stop: null,
    ...over,
  };
}

const withSeq = (events: Array<Record<string, unknown>>) => events.map((e, i) => ({ seq: i + 1, ...e }));

function folder(run: RunRecord, log: Array<Record<string, unknown>>, transcript: Array<Record<string, unknown>> = []): string {
  const dir = mkdtempSync(path.join(tmpdir(), "m13-"));
  writeRunRecord(dir, run);
  writeFileSync(path.join(dir, SESSION_LOG), withSeq(log).map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(path.join(dir, "transcript.jsonl"), transcript.map((r) => JSON.stringify({ at: "t", channel: "run", rolls: [], ...r })).join("\n") + "\n");
  writeFileSync(path.join(dir, AUDIT_JSON), JSON.stringify({ passed: true, output: "Audit: ok.\nLeak scan: 0 leaks." }));
  writeFileSync(path.join(dir, NARRATION_CHECK), "");
  return dir;
}

const row = (dir: string, id: string) => computeVerdict(dir).rows.find((r) => r.row === id);

const ROSTER = { name: "undersigned", party: "new", loaded_sha256: null, chain: null, saved_sha256: "a".repeat(64), not_saved: null };

const MILL_LOG: Array<Record<string, unknown>> = [
  { kind: "scene_loaded", scene: "s3_mill_yard" },
  { kind: "combat_over", reason: "surrendered" },
  { kind: "deed_remembered", deed: "snitt_yielded", by: ["bren", "maren"], day: 1, contract: 1 },
  { kind: "scene_loaded", scene: "s5_mill_cellar" },
  { kind: "deed_remembered", deed: "killed_gritch", by: ["torva"], day: 1, contract: 1 },
  { kind: "combat_over", reason: "no_hostiles" },
  { kind: "deed_remembered", deed: "wenna_saved", by: ["bren", "torva", "maren"], day: 1, contract: 1 },
];

test("m13-written: run 1 passes on two deeds with their records, one an outcome, and the saved roster", () => {
  const good = row(folder(runRecord({ roster: ROSTER as never }), MILL_LOG), "m13-written")!;
  assert.equal(good.status, "pass", good.detail);
  assert.match(good.detail, /snitt_yielded \(by bren, maren, day 1, contract 1\)/);
  // Markers alone are no outcome.
  const markers = row(folder(runRecord({ roster: ROSTER as never }), MILL_LOG.filter((e) => e.deed !== "snitt_yielded")), "m13-written")!;
  assert.equal(markers.status, "fail");
  assert.match(markers.detail, /no outcome deed/);
  // A deed with nobody in `by` does not count; one deed is too few.
  const nobody = row(folder(runRecord({ roster: ROSTER as never }), [MILL_LOG[0]!, MILL_LOG[1]!, MILL_LOG[2]!, { kind: "deed_remembered", deed: "wenna_saved", by: [], day: 1, contract: 1 }]), "m13-written")!;
  assert.equal(nobody.status, "fail");
  assert.match(nobody.detail, /1 deeds with by, day and contract/);
  // The roster not saved fails it; a run with no --roster is no run 1 and only reports.
  const unsaved = row(folder(runRecord({ roster: { ...ROSTER, saved_sha256: null, not_saved: "the run crashed" } as never }), MILL_LOG), "m13-written")!;
  assert.equal(unsaved.status, "fail");
  assert.match(unsaved.detail, /the roster was not saved \(the run crashed\)/);
  assert.equal(row(folder(runRecord(), MILL_LOG), "m13-written")!.status, "reported");
  // A run built before scene deeds wrote none, and only reports, roster or not.
  const old = row(folder(runRecord({ roster: ROSTER as never, build: { ...runRecord().build, contract: "1.0.0-dev.53" } }), []), "m13-written")!;
  assert.equal(old.status, "reported");
  assert.match(old.detail, /before scene deeds/);
  // A campaign run has no m13-written row.
  assert.equal(row(folder(runRecord({ settings: { pack: { value: FAIR, from: "flag" } } as never, campaign: { start_day: 4, day_limit: 6 } }), []), "m13-written"), undefined);
});

/** Run 2 at Wendford: the Mill card reads `snitt_yielded` from contract 1, the Blades decide it, its choice writes a deed. */
const WENDFORD: Array<Record<string, unknown>> = [
  { kind: "traveled", leg: { arrived: true, at: { kind: "at", place: "wendford" } } },
  { kind: "card_shown", card: "mill_goblin_taken_alive", zone: "wendford", when: "arrival", reads: [{ deed: "wenna_saved", by: ["bren"], day: 1, contract: 1 }, { deed: "snitt_yielded", by: ["bren", "maren"], day: 1, contract: 1 }] },
  { kind: "card_drawn", card: "mill_goblin_taken_alive", card_text: "Up the lane the mill wheel is turning again.", choices: [], target: "blades", visibility: { scope: "public" } },
  { kind: "card_advice", actor: "bren", choice: "own_name" },
  { kind: "card_advice", actor: "maren", choice: "own_name" },
  { kind: "card_resolved", choice: "own_name", decided: "majority" },
  { kind: "deed_remembered", deed: "named_self_for_the_goblin", by: ["bren", "maren"], day: 4, contract: 2 },
  { kind: "traveled", leg: { arrived: false, at: { kind: "road" } } },
];

const CONTINUE = { name: "undersigned", party: "continue", loaded_sha256: "b".repeat(64), chain: null, saved_sha256: null, not_saved: null };

function run2(log = WENDFORD, transcript: Array<Record<string, unknown>> = []): string {
  return folder(runRecord({ settings: { pack: { value: FAIR, from: "flag" } } as never, campaign: { start_day: 4, day_limit: 6 }, roster: CONTINUE as never, seats: { human: "bren", ai: ["torva", "maren", "ilsa"] } }), log, transcript);
}

const ANSWER = { question: CARRIED_QUESTION, card: "mill_goblin_taken_alive", lines: [7, 8], answer: "yes", line: 7, quote: "you let the one in the yard live" };

test("m13-carried: the card read an earlier outcome, the Blades decided it, its deed was written, and the judge answers yes", () => {
  const card = carriedCard(withSeq(WENDFORD) as never, sceneOutcomesOf(FAIR))!;
  // A card's outcome is not a scene's: a toll card on a roster that carries the bridge is no mill card.
  const toll = WENDFORD.map((e) => (e.kind === "card_shown" ? { ...e, card: "toll_man_stocks", reads: [{ deed: "toll_men_spared", by: ["bren"], day: 1, contract: 1 }] } : e));
  assert.equal(carriedCard(withSeq(toll) as never, sceneOutcomesOf(FAIR)), undefined);
  assert.equal(row(run2(toll), "m13-carried")!.status, "reported");
  // `wenna_saved` is a marker: only the outcome counts as carried.
  assert.deepEqual(card.reads.map((d) => d.deed), ["snitt_yielded"]);
  assert.deepEqual(card.wrote, ["named_self_for_the_goblin"]);
  assert.equal(card.text, "Up the lane the mill wheel is turning again.");

  const dir = run2();
  assert.equal(row(dir, "m13-carried")!.status, "pending", "the judge has not answered");
  writeFileSync(path.join(dir, JUDGE_QUESTION), JSON.stringify(ANSWER));
  const pass = row(dir, "m13-carried")!;
  assert.equal(pass.status, "pass", pass.detail);
  assert.match(pass.detail, /the judge: yes, line 7: "you let the one in the yard live"/);
  // A flag on the card's lines waits for Stas, and fails the row when he confirms it.
  writeFileSync(path.join(dir, NARRATION_CHECK), JSON.stringify({ id: "n8-1", line: 8, claim: "the goblin is free", kind: "action", evidence_seq: [], text: "x" }) + "\n");
  assert.equal(row(dir, "m13-carried")!.status, "pending");
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ "n8-1": { answer: "confirmed" } }));
  assert.equal(row(dir, "m13-carried")!.status, "fail");
  // A flag Stas adds by hand on one of its lines counts too.
  writeFileSync(path.join(dir, NARRATION_CHECK), "");
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ added: [{ id: "h7-1", line: 7, claim: "Osric was not there" }] }));
  assert.match(row(dir, "m13-carried")!.detail, /contradiction on its lines: h7-1/);

  const no = run2();
  writeFileSync(path.join(no, JUDGE_QUESTION), JSON.stringify({ ...ANSWER, answer: "no", line: null, quote: "" }));
  assert.match(row(no, "m13-carried")!.detail, /the judge answers no/);
  // The card's default, a seat falling back, or no deed after the choice: each fails it.
  const byDefault = run2(WENDFORD.map((e) => (e.kind === "card_resolved" ? { ...e, decided: "default" } : e)));
  assert.match(row(byDefault, "m13-carried")!.detail, /decided default, not by the Blades' word/);
  const fellBack = run2(WENDFORD, [{ speaker: "maren", kind: "fallback", text: "goes with the others", log_head: 4 }]);
  assert.match(row(fellBack, "m13-carried")!.detail, /fallback words from maren/);
  const silent = run2(WENDFORD.filter((e) => e.kind !== "deed_remembered"));
  assert.match(row(silent, "m13-carried")!.detail, /its choice wrote no deed/);
  // No card that reads an earlier outcome: a fail when the saved world held a scene's outcome, else
  // only reported (a later contract on the roster owes nothing); reported on a new party.
  const missed = run2(WENDFORD.filter((e) => e.kind !== "card_shown"));
  assert.equal(row(missed, "m13-carried")!.status, "reported");
  assert.equal(row(missed, "m13-readable")!.status, "reported");
  const state = { cmd: "get_state", state: { world: { deeds: [{ deed: "snitt_yielded", by: ["bren"], day: 1, contract: 1 }] } } };
  writeFileSync(path.join(missed, "engine-log.jsonl"), JSON.stringify({ request: { cmd: "get_state", viewer: "dm" }, response: { ok: true, result: state } }) + "\n");
  const owed = row(missed, "m13-carried")!;
  assert.equal(owed.status, "fail");
  assert.match(owed.detail, /the saved world held snitt_yielded, and no arrival card read it/);
  // With no card there is nothing to read, whatever the carried row says.
  assert.equal(row(missed, "m13-readable")!.status, "reported");
  const fresh = folder(runRecord({ settings: { pack: { value: FAIR, from: "flag" } } as never, campaign: { start_day: 1, day_limit: 3 }, roster: ROSTER as never }), WENDFORD);
  assert.equal(row(fresh, "m13-carried")!.status, "reported");
  assert.equal(row(fresh, "m13-readable")!.status, "reported");
});

test("m13-readable: both reads quoted, then Stas rules", () => {
  const dir = run2();
  assert.match(row(dir, "m13-readable")!.detail, /no vera or zoya read in confirmations.json/);
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ "m13-readable": { vera: "I knew why Osric asked.", zoya: "The cause is in the card." } }));
  assert.equal(row(dir, "m13-readable")!.status, "pending");
  writeFileSync(path.join(dir, CONFIRMATIONS_JSON), JSON.stringify({ "m13-readable": { vera: "I knew why Osric asked.", zoya: "The cause is in the card.", verdict: "pass" } }));
  const ruled = row(dir, "m13-readable")!;
  assert.equal(ruled.status, "pass");
  assert.match(ruled.detail, /Vera: I knew why Osric asked\. Zoya: The cause is in the card\./);
});

const digest = (line: number, log_head: number, text: string): DigestRecord =>
  ({ line, text, channel: "table", log_head, scene: null, mode: null, round: null, turn: null, combat_over: false, creatures: [], fled: [], adjacent: [], nearest_foe_ft: [], foes_ft: {}, engine_lines: [], inventory: [] }) as DigestRecord;

const LINES = [digest(6, 1, "The wagon rolls into Wendford."), digest(7, 3, "Osric looks at you: you let the one in the yard live."), digest(8, 6, "Osric notches the tally."), digest(9, 8, "The road goes on.")];

test("the report: the deeds the saved world brought, the card, its choice, its deed written and unread, and its lines", () => {
  const run = runRecord({ campaign: { start_day: 4, day_limit: 6 }, roster: CONTINUE as never });
  const first = [{ deed: "snitt_yielded", by: ["bren"], day: 1, contract: 1 }];
  const lines = carriedReport(run, withSeq(WENDFORD) as never, LINES, sceneOutcomesOf(FAIR), first).join("\n");
  assert.match(lines, /Deeds the saved world brought \(the DM's first world view\): snitt_yielded \(by bren, day 1, contract 1\)/);
  assert.match(lines, /Card: mill_goblin_taken_alive, reading snitt_yielded/);
  assert.match(lines, /Choice: own_name \(majority\)/);
  assert.match(lines, /Deed: named_self_for_the_goblin, written, unread/);
  // From the first line after the card was shown to the first after its decision.
  assert.match(lines, /> 7\. Osric looks at you[^\n]*\n> 8\. Osric notches the tally\.$/);
  // A yard fought to the end is no goblin taken, never the party's choice.
  const toTheEnd = WENDFORD.map((e) => (e.kind === "card_shown" ? { ...e, card: "mill_yard_to_the_end", reads: [{ deed: "yard_to_the_end", by: ["bren"], day: 1, contract: 1 }] } : e));
  const end = carriedReport(run, withSeq(toTheEnd) as never, LINES, sceneOutcomesOf(FAIR), first).join("\n");
  assert.match(end, /At the mill: no goblin was taken\./);
  assert.doesNotMatch(end, /chose/);
  assert.deepEqual(carriedReport({ ...run, roster: ROSTER as never }, withSeq(WENDFORD) as never, LINES, sceneOutcomesOf(FAIR), first), []);
});

test("the narration check asks the judge the carried question on the card's lines, and writes its answer", async () => {
  const dir = run2();
  writeFileSync(path.join(dir, NARRATION_DIGEST), [JSON.stringify({ kind: "run", party: [], narrations: 4, requests_replayed: 0, diverged: null }), ...LINES.map((d) => JSON.stringify({ kind: "narration", ...d }))].join("\n") + "\n");
  const judge = new ScriptedJudge([], { answer: "yes", line: 7, quote: "you let the one in the yard live" });
  const check = await narrationCheck(FAIR, dir, judge);
  assert.ok(check.ok, check.lines.join("\n"));
  assert.equal(judge.asked.length, 1);
  assert.match(judge.asked[0]!, /^Question: Does the DM name what the party did at the mill\?/);
  assert.match(judge.asked[0]!, /- snitt_yielded: by bren, maren, day 1, contract 1/);
  assert.match(judge.asked[0]!, /7\. Osric looks at you[\s\S]*8\. Osric notches the tally\.$/);
  assert.doesNotMatch(judge.asked[0]!, /The road goes on/);
  const written = JSON.parse(readFileSync(path.join(dir, JUDGE_QUESTION), "utf8"));
  assert.deepEqual(written, { question: CARRIED_QUESTION, card: "mill_goblin_taken_alive", lines: [7, 8], answer: "yes", line: 7, quote: "you let the one in the yard live" });
  assert.match(check.lines.at(-1)!, /Does the DM name what the party did at the mill\? yes \(card mill_goblin_taken_alive, line 7/);
  // A quote that is not on the line it names is not kept: the line itself is.
  const made = run2();
  writeFileSync(path.join(made, NARRATION_DIGEST), readFileSync(path.join(dir, NARRATION_DIGEST)));
  assert.ok((await narrationCheck(FAIR, made, new ScriptedJudge([], { answer: "yes", line: 8, quote: "you let the one in the yard live" }))).ok);
  assert.equal(JSON.parse(readFileSync(path.join(made, JUDGE_QUESTION), "utf8")).quote, "Osric notches the tally.");
  // A run not on a carried roster is never asked.
  const first = folder(runRecord({ roster: ROSTER as never }), MILL_LOG);
  writeFileSync(path.join(first, NARRATION_DIGEST), readFileSync(path.join(dir, NARRATION_DIGEST)));
  const quiet = new ScriptedJudge();
  assert.ok((await narrationCheck(MILL, first, quiet)).ok);
  assert.equal(quiet.asked.length, 0);
  assert.equal(existsSync(path.join(first, JUDGE_QUESTION)), false);
});

test("the model judge answers the question in a session of its own with the answer tool alone, and a line outside the card's is no", async () => {
  const opened: SessionConfig[] = [];
  let reply: Record<string, unknown> = { answer: "yes", line: 7, quote: "you let him live" };
  const open = (config: SessionConfig): TurnSession => {
    opened.push(config);
    return {
      turn: async () => {
        await config.tools.find((t) => t.name === "answer")!.handler(reply, {});
        return { text: "", final: "", usage: {} as never };
      },
      close: async () => undefined,
    };
  };
  const judge = new ModelJudge({ open });
  assert.deepEqual(await judge.ask("q", [7, 8]), { answer: "yes", line: 7, quote: "you let him live" });
  assert.equal(opened[0]!.systemPrompt, ASK_PROMPT);
  assert.deepEqual(opened[0]!.choice, JUDGE_CHOICE);
  assert.deepEqual(opened[0]!.tools.map((t) => t.name), ["answer"]);
  reply = { answer: "yes", line: 99, quote: "elsewhere" };
  assert.deepEqual(await judge.ask("q", [7, 8]), { answer: "no", line: null, quote: "" });
});

test("a card drawn in the request that settled the card before it starts its lines at its own framing, not that card's settling", () => {
  const card = carriedCard(withSeq(WENDFORD) as never, sceneOutcomesOf(FAIR))!;
  // Line 6 narrates the previous card's settling at a log head after this card was shown; line 7 is this card's framing.
  const transcript = [{ speaker: "dm", kind: "narration", wake: "card", text: LINES[1]!.text, log_head: 3 }] as never;
  const settled = [digest(6, 2, "The cloaks go on the salt sacks."), ...LINES.slice(1)];
  assert.deepEqual(cardLines(settled, card, transcript).map((d) => d.line), [7, 8]);
  // With no framing narration in the transcript, the window starts at the first line after the card.
  assert.deepEqual(cardLines(settled, card).map((d) => d.line), [6, 7, 8]);
});

test("a narration check that fails removes the last question's answer with the check", async () => {
  const dir = run2();
  writeFileSync(path.join(dir, NARRATION_DIGEST), [JSON.stringify({ kind: "run", party: [], narrations: 4, requests_replayed: 0, diverged: null }), ...LINES.map((d) => JSON.stringify({ kind: "narration", ...d }))].join("\n") + "\n");
  writeFileSync(path.join(dir, JUDGE_QUESTION), JSON.stringify({ ...ANSWER, answer: "no", line: null, quote: "" }));
  const broken = { judge: async () => { throw new Error("offline"); } };
  assert.equal((await narrationCheck(FAIR, dir, broken)).ok, false);
  assert.equal(existsSync(path.join(dir, JUDGE_QUESTION)), false);
  assert.equal(row(dir, "m13-carried")!.status, "pending");
});
