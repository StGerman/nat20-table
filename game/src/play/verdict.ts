// A run's verdict against the M7 acceptance rows (spec §3.2, design §3.3, TASKS.md AGT-14). It is a
// pure function of the run folder, so it can be computed again anywhere (`npm run runs:verdict --
// <run-dir>`): on the Mac after the run, or in a thread once Stas has confirmed or dismissed the flags
// in `confirmations.json`. VOID wins over FAIL: a run cut short by something outside the game says
// nothing either way.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Event, Handle } from "@nat20-table/engine-client";
import { SESSION_LOG } from "../engine.ts";
import type { TranscriptRecord } from "../table/types.ts";
import { percentile, waitedMs, type UsageRecord } from "../usage.ts";
import { readRunRecord, RUN_JSON, type RunRecord } from "./record.ts";
import { TARGET_P95_MS } from "./run.ts";

export const VERDICT_JSON = "verdict.json";
/** The audit stage's output: whether `nat20-audit` passed, and what it printed. */
export const AUDIT_JSON = "audit.json";
/** Stas's answers to the run's flags: flag id to `confirmed` or `dismissed`, with a note. */
export const CONFIRMATIONS_JSON = "confirmations.json";
/** The narration check's flags (AGT-9), one JSON object a line, each with an `id`; a line with `untracked` lists a prop and is no flag. */
export const NARRATION_CHECK = "narration-check.jsonl";

/** How many refusals one human decision may take before it is a flag (scope §6.5: 2 retries). */
export const HUMAN_REFUSALS = 2;

/** A row of the verdict: `reported` rows never decide it (latency, D1). */
export type RowStatus = "pass" | "fail" | "pending" | "reported";

export interface VerdictRow {
  /** The spec §3.2 row: `1`, `1a`, `2`, `3`, `4`, `5` or `leak`. */
  row: string;
  title: string;
  status: RowStatus;
  detail: string;
}

/** A finding Stas confirms (the table failed) or dismisses: a narration flag, or a human decision refused too often. */
export interface Flag {
  id: string;
  row: string;
  text: string;
  answer?: "confirmed" | "dismissed";
  /** `hand` for a flag Stas added in `confirmations.json` (`added[]`) that the judge missed (M10 P2); absent for the judge's and the retry count's. */
  source?: "hand";
}

/** A narration flag Stas adds by hand in `confirmations.json` under `added` (M10 P2, AGT-60). */
export interface HandFlag {
  /** Its own id, such as `h45-1`; never one of the judge's. */
  id: string;
  /** The transcript line it is about. */
  line?: number;
  claim: string;
  /** `confirmed` by default: Stas adds a flag because the line contradicts the engine. */
  answer?: "confirmed" | "dismissed";
}

export interface Verdict {
  verdict: "PASS" | "FAIL" | "VOID" | "PENDING";
  /** Why, in one line: the failed rows, the void's cause, or what is still missing. */
  why: string;
  /**
   * Whether the run can count for acceptance: not from a checkout with changes to tracked files,
   * and its plan was the whole adventure (a `play:scene` run of a few scenes isn't).
   */
  eligible: boolean;
  /** Why not, when it isn't. */
  not_eligible: string[];
  rows: VerdictRow[];
  flags: Flag[];
}

const VOIDS = new Set(["usage_limit", "login", "offline", "operator"]);

function readLines<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

function readJson<T>(file: string): T | undefined {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined;
}

const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`;

/** Row 1: the planned scenes played to the end within the time limit. */
function timeRow(run: RunRecord): VerdictRow {
  const title = "Scene 1 to 6 within the time limit";
  const first = run.scenes[0];
  const last = run.plan.at(-1);
  // When play ended: the last scene's end, not the folder's finishing after it.
  const end = run.scenes.at(-1)?.ended_at ?? run.ended_at;
  const took = first && end ? Date.parse(end) - Date.parse(first.started_at) : undefined;
  const reached = last !== undefined && run.scenes.some((s) => s.id === last);
  const detail = `${run.scenes.length} of ${run.plan.length} scenes played${took === undefined ? "" : ` in ${minutes(took)}`}; ended: ${run.ended ?? "not recorded"}`;
  if (run.stop === "time_limit" || run.stop === "stalled" || run.stop === "crash") return { row: "1", title, status: "fail", detail: `stopped: ${run.stop}; ${detail}` };
  if (run.ended === null) return { row: "1", title, status: "fail", detail: `the run never recorded its end; ${detail}` };
  if (!reached || run.stop) return { row: "1", title, status: "fail", detail: `${last ?? "the last scene"} was not reached; ${detail}` };
  if (run.time_limit_min > 0 && took !== undefined && took > run.time_limit_min * 60_000) {
    return { row: "1", title, status: "fail", detail: `over ${run.time_limit_min} min; ${detail}` };
  }
  return { row: "1", title, status: "pass", detail };
}

/** Row 1a: never every party member down or dead at once. One death is reported, not a fail. */
function partyRow(run: RunRecord, log: Event[]): VerdictRow {
  const title = "The party survives";
  const party = [...(run.seats.human ? [run.seats.human] : []), ...run.seats.ai];
  if (log.length === 0) return { row: "1a", title, status: "pending", detail: `no ${SESSION_LOG}` };
  const state = new Map<Handle, string>(party.map((h) => [h, "conscious"]));
  let wiped: number | undefined;
  for (const e of log) {
    if (e.kind !== "life_state" || !state.has(e.target)) continue;
    state.set(e.target, e.state);
    if (wiped === undefined && party.every((h) => state.get(h) !== "conscious")) wiped = e.seq;
  }
  const dead = party.filter((h) => state.get(h) === "dead");
  const tail = dead.length > 0 ? `dead: ${dead.join(", ")}` : "nobody died";
  if (wiped !== undefined) return { row: "1a", title, status: "fail", detail: `every party member was down at once (event ${wiped}); ${tail}` };
  return { row: "1a", title, status: "pass", detail: tail };
}

/** Rows 2 and leak: the audit's and the leak scan's problems, from `nat20-audit`'s output. */
function auditRows(audit: { passed: boolean; output: string } | undefined): VerdictRow[] {
  const title2 = "Every roll in the transcript is in the engine log";
  const titleLeak = "Nothing hidden reaches a player";
  if (!audit) return [{ row: "2", title: title2, status: "pending", detail: "the audit hasn't run" }, { row: "leak", title: titleLeak, status: "pending", detail: "the audit hasn't run" }];
  const lines = audit.output.split("\n");
  const problems = lines.filter((l) => l.startsWith("  audit: "));
  const leaks = lines.filter((l) => l.startsWith("  leak: "));
  // A failed audit that printed no problem line didn't run to the end.
  const broken = !audit.passed && problems.length === 0 && leaks.length === 0;
  return [
    {
      row: "2",
      title: title2,
      status: problems.length > 0 || broken ? "fail" : "pass",
      detail: broken ? `nat20-audit failed: ${lines.at(-1) ?? ""}` : problems.length > 0 ? `${problems.length} problems: ${problems[0].trim()}` : (lines.find((l) => l.startsWith("Audit:")) ?? "passed"),
    },
    { row: "leak", title: titleLeak, status: leaks.length > 0 || broken ? "fail" : "pass", detail: leaks.length > 0 ? `${leaks.length} leaks: ${leaks[0].trim()}` : broken ? "not scanned" : "0 leaks" },
  ];
}

/** Row 3: the narration check's flags (AGT-9), each confirmed or dismissed by Stas. */
function narrationRow(dir: string, flags: Flag[]): VerdictRow {
  const title = "No narration contradicts engine state or inventory";
  if (!existsSync(path.join(dir, NARRATION_CHECK))) return { row: "3", title, status: "pending", detail: "the narration check hasn't run" };
  const mine = flags.filter((f) => f.row === "3");
  const confirmed = mine.filter((f) => f.answer === "confirmed").length;
  const open = mine.filter((f) => !f.answer).length;
  const detail = `${mine.length} flags: ${confirmed} confirmed, ${mine.length - confirmed - open} dismissed, ${open} to confirm`;
  return { row: "3", title, status: confirmed > 0 ? "fail" : open > 0 ? "pending" : "pass", detail };
}

/**
 * Row 5: no AI player or DM fallback after its retries ran out, and no human decision refused more
 * than twice that Stas confirms as the table's fault. The human is never cut off, so those are flags.
 */
function retryRows(run: RunRecord, transcript: TranscriptRecord[], answers: Record<string, { answer: string }>): { row: VerdictRow; flags: Flag[] } {
  const title = "Every rejected decision recovers within 2 retries";
  const human = run.seats.human;
  const fallbacks = transcript.filter((r) => r.kind === "fallback");
  const spent = fallbacks.filter((r) => r.cause === "retries" && r.speaker !== human);
  const refusals = new Map<string, number>();
  for (const r of transcript) {
    const refused = (r.kind === "retry" && human !== null && r.speaker === human) || (r.kind === "fallback" && r.cause === "unmapped");
    if (refused && r.decision) refusals.set(r.decision, (refusals.get(r.decision) ?? 0) + 1);
  }
  const flags: Flag[] = [...refusals]
    .filter(([, n]) => n > HUMAN_REFUSALS)
    .map(([decision, n]) => {
      const id = `refused:${decision}`;
      const answer = answers[id]?.answer;
      return { id, row: "5", text: `${human}'s decision ${decision} was refused ${n} times`, ...(answer === "confirmed" || answer === "dismissed" ? { answer } : {}) };
    });
  const causes = new Map<string, number>();
  for (const r of fallbacks) causes.set(r.cause ?? "unrecorded", (causes.get(r.cause ?? "unrecorded") ?? 0) + 1);
  const counted = [...causes].map(([cause, n]) => `${cause} ${n}`).join(", ") || "none";
  const detail = `fallbacks: ${counted}; human decisions refused more than ${HUMAN_REFUSALS} times: ${flags.length}`;
  const confirmed = flags.filter((f) => f.answer === "confirmed").length;
  const open = flags.filter((f) => !f.answer).length;
  if (spent.length > 0) return { row: { row: "5", title, status: "fail", detail: `${spent.length} fallbacks after the retries ran out (${spent[0].speaker}: ${spent[0].text}); ${detail}` }, flags };
  return { row: { row: "5", title, status: confirmed > 0 ? "fail" : open > 0 ? "pending" : "pass", detail }, flags };
}

/** Row 4: latency, measured and reported only (D1). */
function latencyRow(usage: UsageRecord[]): VerdictRow {
  const p95 = (agent: (u: UsageRecord) => boolean) => percentile(usage.filter(agent).map(waitedMs), 95);
  const dm = p95((u) => u.agent === "dm" && u.purpose === "narrate");
  const players = p95((u) => u.agent !== "dm" && u.purpose === "combat_turn");
  return {
    row: "4",
    title: "Latency (reported only, D1)",
    status: "reported",
    detail: `AI player combat wake p95 ${players || "n/a"} ms (target ${TARGET_P95_MS.player}), DM narration p95 ${dm || "n/a"} ms (target ${TARGET_P95_MS.dm})`,
  };
}

/** The verdict of the run in `dir`, from its files alone. */
export function computeVerdict(dir: string): Verdict {
  if (!existsSync(path.join(dir, RUN_JSON))) {
    return { verdict: "PENDING", why: `no ${RUN_JSON}: not a play:full run, or it never started`, eligible: false, not_eligible: [`no ${RUN_JSON}`], rows: [], flags: [] };
  }
  const run = readRunRecord(dir);
  const transcript = readLines<TranscriptRecord>(path.join(dir, "transcript.jsonl"));
  const log = readLines<Event>(path.join(dir, SESSION_LOG));
  const usage = readLines<UsageRecord>(path.join(dir, "usage.jsonl"));
  const confirmations = readJson<Record<string, unknown>>(path.join(dir, CONFIRMATIONS_JSON)) ?? {};
  const { added, ...answered } = confirmations;
  const answers = answered as Record<string, { answer: string }>;
  // An untracked prop is listed, not flagged (spec §4.3): Stas has nothing to answer for it.
  const narrationFlags: Flag[] = readLines<{ id: string; line?: number; claim?: string; kind?: string; untracked?: boolean }>(path.join(dir, NARRATION_CHECK)).filter((f) => !f.untracked).map((f) => {
    const answer = answers[f.id]?.answer;
    return { id: f.id, row: "3", text: `${f.kind ?? "flag"}: ${f.claim ?? ""}`.trim(), ...(answer === "confirmed" || answer === "dismissed" ? { answer } : {}) };
  });
  // Lines Stas ruled himself, which the judge missed (M10 P2): flags of row 3 like the judge's.
  const handFlags: Flag[] = (Array.isArray(added) ? (added as HandFlag[]) : []).map((f) => ({
    id: f.id,
    row: "3",
    text: `hand: ${f.claim}${f.line !== undefined ? ` (line ${f.line})` : ""}`,
    answer: f.answer === "dismissed" ? "dismissed" : "confirmed",
    source: "hand",
  }));
  narrationFlags.push(...handFlags);
  const retries = retryRows(run, transcript, answers);
  const rows = [timeRow(run), partyRow(run, log), ...auditRows(readJson(path.join(dir, AUDIT_JSON))), narrationRow(dir, narrationFlags), retries.row, latencyRow(usage)];
  const flags = [...narrationFlags, ...retries.flags];
  const not_eligible = [
    ...(run.build.dirty ? ["the checkout had changes"] : []),
    ...(run.plan.join(",") === run.adventure.join(",") ? [] : [`it played ${run.plan.length} of the adventure's ${run.adventure.length} scenes`]),
  ];
  const eligible = not_eligible.length === 0;
  const failed = rows.filter((r) => r.status === "fail");
  const pending = rows.filter((r) => r.status === "pending");
  if (run.stop && VOIDS.has(run.stop)) return { verdict: "VOID", why: `stopped from outside the game (${run.stop}): ${run.ended}`, eligible, not_eligible, rows, flags };
  if (failed.length > 0) return { verdict: "FAIL", why: `failed: ${failed.map((r) => `${r.row} ${r.title}`).join("; ")}`, eligible, not_eligible, rows, flags };
  if (pending.length > 0) return { verdict: "PENDING", why: `still open: ${pending.map((r) => `${r.row} ${r.title} (${r.detail})`).join("; ")}`, eligible, not_eligible, rows, flags };
  return { verdict: "PASS", why: "every gating row passed", eligible, not_eligible, rows, flags };
}

/** The verdict as the Markdown block at the top of `report.md`. */
export function verdictBlock(v: Verdict): string[] {
  return [
    VERDICT_START,
    `## Verdict: ${v.verdict}${v.eligible ? "" : ` (not eligible for acceptance: ${v.not_eligible.join("; ")})`}`,
    "",
    v.why,
    "",
    "| Row | Check | Result | Detail |",
    "|---|---|---|---|",
    ...v.rows.map((r) => `| ${r.row} | ${r.title} | ${r.status} | ${r.detail.replaceAll("|", "\\|")} |`),
    ...(v.flags.length > 0 ? ["", "Flags for Stas (confirm or dismiss in confirmations.json):", ...v.flags.map((f) => `- ${f.id} (row ${f.row}): ${f.text} — ${f.answer ?? "to confirm"}`)] : []),
    VERDICT_END,
  ];
}

const VERDICT_START = "<!-- verdict -->";
const VERDICT_END = "<!-- /verdict -->";

/**
 * Computes the verdict of the run in `dir`, writes `verdict.json`, and puts its block at the top of
 * `report.md` in place of the last one. Returns the verdict.
 */
export function writeVerdict(dir: string): Verdict {
  const v = computeVerdict(dir);
  writeFileSync(path.join(dir, VERDICT_JSON), JSON.stringify(v, null, 2) + "\n");
  const reportFile = path.join(dir, "report.md");
  if (existsSync(reportFile)) {
    const report = readFileSync(reportFile, "utf8");
    const start = report.indexOf(VERDICT_START);
    const end = report.indexOf(VERDICT_END);
    const rest = start >= 0 && end > start ? report.slice(0, start) + report.slice(end + VERDICT_END.length).replace(/^\n+/, "") : report;
    writeFileSync(reportFile, [...verdictBlock(v), "", rest].join("\n"));
  }
  return v;
}
