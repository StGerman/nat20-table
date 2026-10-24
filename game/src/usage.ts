// Token and latency records for every model call (M6 spec §7, TASKS.md AGT-10). One JSON line per
// agent turn in `usage.jsonl` next to the transcript. Live runs use Stas's Claude subscription
// (decision 0036), so the cost here is the API-equivalent price, kept as a reference.
import { appendFileSync } from "node:fs";

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
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  /** API calls the turn made (each tool round trip is one). */
  api_calls: number;
  /** Time from sending the message to the turn's result. */
  wall_ms: number;
  /** Time to the first token of the first API call, when the SDK reports it. */
  ttft_ms: number | null;
  /** API list price of the tokens above, in US dollars (reference only, decision 0036). */
  api_equivalent_usd: number;
  /** MCP tools the agent called during the turn, in order (names without the server prefix). */
  tools: string[];
  at: string;
}

/** API list prices per million tokens, 2026-10-23 (M6 spec §7). Cache writes at 1.25× input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

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

  /** Creates `file` at once, so a run folder always has one, even for a run with no model call. */
  constructor(file?: string) {
    this.file = file;
    if (file) appendFileSync(file, "");
  }

  add(record: UsageRecord): void {
    this.records.push(record);
    if (this.file) appendFileSync(this.file, JSON.stringify(record) + "\n");
  }
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
      p50_ms: percentile(mine.map((r) => r.wall_ms), 50),
      p95_ms: percentile(mine.map((r) => r.wall_ms), 95),
      input_tokens: sum((r) => r.input_tokens),
      cache_read_tokens: sum((r) => r.cache_read_tokens),
      cache_write_tokens: sum((r) => r.cache_write_tokens),
      output_tokens: sum((r) => r.output_tokens),
      api_equivalent_usd: Math.round(sum((r) => r.api_equivalent_usd) * 10_000) / 10_000,
    };
  });
}
