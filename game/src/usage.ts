// Token and latency records for every model call (M6 spec §7, TASKS.md AGT-10). One JSON line per
// agent turn in `usage.jsonl` next to the transcript, whether the turn ended with its result or not.
// Live runs use Stas's Claude subscription (decision 0036), so the cost here is the API-equivalent
// price, kept as a reference.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/** What one agent turn cost: one user message in, until the session's `result` for it. */
export interface UsageRecord {
  /** The seat the agent plays: `dm` or a character handle. */
  agent: string;
  /** The model that answered, as the API reported it. */
  model: string;
  effort: string;
  /** What the turn was for, such as `combat_turn`, `narration`, `spike/warm`. */
  purpose: string;
  /** 1 for the first turn of a session (cold cache), counting up. */
  session_turn: number;
  /**
   * How the turn ended: with its result, past its timeout, failed, or stopped at the plan's limit.
   * Tokens are what the turn's API calls reported until then; calls that answer after a timeout
   * are not counted.
   */
  outcome: "ok" | "timeout" | "cancelled" | "failed" | "limit" | "drained";
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  /** API calls the turn made (each tool round trip is one). */
  api_calls: number;
  /** Time from sending the message to the turn's result (for a settled-early turn, to the end of its drain). */
  wall_ms: number;
  /**
   * A settling tool ended the turn for the caller before the SDK's result (M10 S2, decision 0053);
   * `outcome` `drained` when the drain was cut at the turn's limit instead of ending.
   */
  settled_early?: boolean;
  /** For a settled-early turn: how long the table waited, from sending the message to the settling tool. */
  waited_ms?: number;
  /** Time to the first token of the first API call, when the SDK reports it. */
  ttft_ms: number | null;
  /** API list price of the tokens above, in US dollars (reference only, decision 0036). */
  api_equivalent_usd: number;
  /** MCP tools the agent called during the turn, in order (names without the server prefix). */
  tools: string[];
  /**
   * Each API call of the turn, in order (M10 S1): offsets in ms from sending the message. A call
   * starts when the message went out or the previous call's last tool answered, and ends with its
   * last content block. Absent in runs before Milestone 10.
   */
  calls?: ApiCallTiming[];
  /** Time spent inside our tool handlers in the turn (engine round trips, guards). */
  tool_ms?: number;
  at: string;
}

/** One API call of a turn (M10 S1). */
export interface ApiCallTiming {
  /** 1 for the turn's first call. */
  n: number;
  started_ms: number;
  /** The first call's time to first token, when the SDK reports it. */
  first_token_ms?: number;
  ended_ms: number;
  /** The tools this call used; none for a closing call. */
  tools: string[];
  tool_ms: number;
}

/** Where one agent's wakes spent their time (M10 S1), p50 and p95 of each phase. */
export interface PhaseSummary {
  agent: string;
  purpose: string;
  wakes: number;
  /** The first API call's time to first token; for a record without it, to the call's last block. */
  first_token: [number, number];
  /** Time inside our tool handlers per wake. */
  tool: [number, number];
  /** API calls per wake. */
  calls: [number, number];
  /** The closing call (the last one, when it used no tool), over the wakes that had one. */
  closing: [number, number];
  /** Wakes with a closing call. */
  closings: number;
}

/** API list prices per million tokens, 2026-10-23 (M6 spec §7). Cache writes at 1.25× input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** Whether the price table lists `model`: a run's settings refuse one it doesn't (M7 spec §4.1). */
export function priced(model: string): boolean {
  return Object.keys(PRICES).some((id) => model.startsWith(id));
}

/** The API-equivalent price of a turn; 0 for a model the table doesn't list. */
export function apiEquivalentUsd(
  model: string,
  tokens: { input: number; cacheRead: number; cacheWrite: number; output: number },
): number {
  const price = Object.entries(PRICES).find(([id]) => model.startsWith(id))?.[1];
  if (!price) return 0;
  const usd =
    (tokens.input * price.input +
      tokens.cacheWrite * price.input * 1.25 +
      tokens.cacheRead * price.cacheRead +
      tokens.output * price.output) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Appends usage records to a file, one JSON line each. */
export class UsageLog {
  readonly records: UsageRecord[] = [];
  private readonly file: string | undefined;

  /**
   * Creates `file` at once, and its folder if there is none yet, so a run folder always has one,
   * even for a run with no model call.
   */
  constructor(file?: string) {
    this.file = file;
    if (file) {
      mkdirSync(path.dirname(file), { recursive: true });
      appendFileSync(file, "");
    }
  }

  add(record: UsageRecord): void {
    this.records.push(record);
    if (this.file) appendFileSync(this.file, JSON.stringify(record) + "\n");
  }
}

/** How long the table waited on a turn: to its settling tool when it settled early, else to its end (M10 S2). */
export function waitedMs(record: UsageRecord): number {
  return record.waited_ms ?? record.wall_ms;
}

/** The nearest-rank percentile of a list of numbers; NaN for an empty list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/** Sums and latency percentiles per agent, for a run report. */
export function summarize(records: UsageRecord[]): Array<{
  agent: string;
  turns: number;
  p50_ms: number;
  p95_ms: number;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  api_equivalent_usd: number;
}> {
  const agents = [...new Set(records.map((r) => r.agent))];
  return agents.map((agent) => {
    const mine = records.filter((r) => r.agent === agent);
    const sum = (f: (r: UsageRecord) => number) => mine.reduce((total, r) => total + f(r), 0);
    return {
      agent,
      turns: mine.length,
      p50_ms: percentile(mine.map(waitedMs), 50),
      p95_ms: percentile(mine.map(waitedMs), 95),
      input_tokens: sum((r) => r.input_tokens),
      cache_read_tokens: sum((r) => r.cache_read_tokens),
      cache_write_tokens: sum((r) => r.cache_write_tokens),
      output_tokens: sum((r) => r.output_tokens),
      api_equivalent_usd: Math.round(sum((r) => r.api_equivalent_usd) * 10_000) / 10_000,
    };
  });
}

/**
 * The split of each agent's wakes by phase, per wake purpose (M10 S1): the numbers a latency lever
 * is judged by. Only records with `calls` (runs from Milestone 10 on) count.
 */
export function phases(records: UsageRecord[]): PhaseSummary[] {
  const timed = records.filter((r) => r.calls && r.calls.length > 0);
  const keys = [...new Set(timed.map((r) => `${r.agent}\u0000${r.purpose}`))];
  return keys.map((key) => {
    const [agent, purpose] = key.split("\u0000");
    const mine = timed.filter((r) => r.agent === agent && r.purpose === purpose);
    const pair = (values: number[]): [number, number] => [percentile(values, 50), percentile(values, 95)];
    const closing = mine.flatMap((r) => {
      const last = r.calls!.at(-1)!;
      return r.calls!.length > 1 && last.tools.length === 0 ? [last.ended_ms - last.started_ms] : [];
    });
    return {
      agent,
      purpose,
      wakes: mine.length,
      first_token: pair(mine.map((r) => r.calls![0].first_token_ms ?? r.calls![0].ended_ms)),
      tool: pair(mine.map((r) => r.tool_ms ?? 0)),
      calls: pair(mine.map((r) => r.calls!.length)),
      closing: pair(closing),
      closings: closing.length,
    };
  });
}

/**
 * Tokens and the API-equivalent cost so far, one line per agent and a total (M10 U1): `/usage` at
 * the table, and once at the run's end. Tokens lead; the dollars are the list price, a reference
 * while runs use the subscription (decision 0036).
 */
export function usageBlock(records: UsageRecord[]): string[] {
  if (records.length === 0) return ["No model calls yet."];
  const rows = summarize(records);
  const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n));
  const line = (who: string, r: { input_tokens: number; cache_read_tokens: number; cache_write_tokens: number; output_tokens: number; api_equivalent_usd: number }, wakes: number) =>
    `${who}: ${wakes} wakes, input ${k(r.input_tokens)}, cache write ${k(r.cache_write_tokens)}, cache read ${k(r.cache_read_tokens)}, output ${k(r.output_tokens)}, $${r.api_equivalent_usd.toFixed(2)}`;
  const total = rows.reduce(
    (sum, r) => ({
      input_tokens: sum.input_tokens + r.input_tokens,
      cache_read_tokens: sum.cache_read_tokens + r.cache_read_tokens,
      cache_write_tokens: sum.cache_write_tokens + r.cache_write_tokens,
      output_tokens: sum.output_tokens + r.output_tokens,
      api_equivalent_usd: sum.api_equivalent_usd + r.api_equivalent_usd,
    }),
    { input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, api_equivalent_usd: 0 },
  );
  return [
    ...rows.map((r) => line(r.agent, r, r.turns)),
    line("total", total, records.length),
    "Dollars are the API list price, for reference: this table runs on the subscription.",
  ];
}
