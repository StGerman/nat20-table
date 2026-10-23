// What every live-run command shares (M6 spec §8 "where things run", runbook Part 2): the party and
// its cards from a scenario pack, a run folder, the audit and leak scan over it, and the report.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Handle, State } from "@nat20-table/engine-client";
import { REPO, type GameEngine } from "../engine.ts";
import { Adventure } from "../pack/adventure.ts";
import type { RunReport } from "../table/loop.ts";
import type { TranscriptRecord } from "../table/types.ts";
import { percentile, summarize, type UsageRecord } from "../usage.ts";

/** p95 latency targets (scope §6.4): an AI player's turn, a DM narration. */
export const TARGET_P95_MS = { player: 10_000, dm: 6_000 };

export interface PackParty {
  /** The human's character. */
  human: Handle;
  /** The AI players' characters, in seat order. */
  ai: Handle[];
  /** Each AI player's personality card (CHR-5). */
  cards: Map<Handle, string>;
}

/** The party of a scenario pack's skeleton, with the AI players' cards read from the pack. */
export function packParty(pack: string): PackParty {
  const adventure = Adventure.parse(JSON.parse(readFileSync(path.join(pack, "adventure.json"), "utf8")));
  const human = adventure.party.find((p) => p.seat === "human")?.handle;
  if (!human) throw new Error(`${pack}: the party has no human seat`);
  const ai = adventure.party.filter((p) => p.seat === "ai");
  const cards = new Map(ai.map((p) => [p.handle, readFileSync(path.resolve(pack, p.card!), "utf8")]));
  return { human, ai: ai.map((p) => p.handle), cards };
}

/** A new run folder, `<out>/<name>-<time>/`. */
export function runFolder(out: string, name: string): string {
  const dir = path.resolve(out, `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Refuses a model run while an API key is set: it would bill the API, not Stas's plan (decision 0036). */
export function refuseApiKey(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is set, so the run would bill the API instead of your Claude plan (decision 0036). Unset it and run again.");
    process.exit(2);
  }
}

/** The audit and the leak scan over a run folder (`nat20-audit`, decision 0033). */
export function audit(scenes: string, runDir: string): { passed: boolean; output: string } {
  const run = spawnSync("cargo", ["run", "--quiet", "-p", "nat20-duel", "--bin", "nat20-audit", "--", "--pack", scenes, runDir], {
    cwd: REPO,
    encoding: "utf8",
  });
  if (run.error) return { passed: false, output: `nat20-audit didn't run: ${run.error.message}` };
  return { passed: run.status === 0, output: `${run.stdout}${run.stderr}`.trim() };
}

/** Every creature as the DM sees it at the end: Hit Points and life state, for the report. */
export async function endState(engine: GameEngine): Promise<string[]> {
  const r = await engine.request("dm", { cmd: "get_state" });
  const state = r.result?.cmd === "get_state" ? (r.result.state as State) : undefined;
  if (state?.view !== "dm") return [];
  return state.creatures.map((c) => `${c.handle} (${c.side}): ${c.hp}/${c.hp_max} HP, ${c.life_state}`);
}

/** The report's Markdown sections on the run, the usage and the audit. */
export function reportSections(options: {
  run: RunReport | undefined;
  failure?: unknown;
  transcript: TranscriptRecord[];
  usage: UsageRecord[];
  endState: string[];
  audit?: { passed: boolean; output: string };
}): string[] {
  const { run, transcript, usage } = options;
  const lines = (kind: string) => transcript.filter((r) => r.channel === "run" && r.kind === kind).map((r) => `${r.speaker}: ${r.text}`);
  const outcome = transcript.filter((r) => r.channel === "dm" && r.text.startsWith("Combat is over")).map((r) => r.text);
  const players = usage.filter((r) => r.agent !== "dm");
  const turns = players.filter((r) => r.purpose === "combat_turn").map((r) => r.wall_ms);
  const out = [
    `- Ended: ${run?.ended ?? `the run failed: ${options.failure instanceof Error ? options.failure.message : String(options.failure)}`}`,
    ...(outcome.length > 0 ? [`- Fights: ${outcome.join(" ")}`] : []),
    `- Fallbacks: ${run?.fallbacks ?? "n/a"}; retries: ${lines("retry").length}; errors and timeouts: ${lines("error").length}`,
    `- Player combat turns: ${turns.length}, p50 ${percentile(turns, 50) || "n/a"} ms, p95 ${percentile(turns, 95) || "n/a"} ms (target ${TARGET_P95_MS.player} ms)`,
    "",
    "| Agent | Turns | p50 ms | p95 ms | Target p95 | Input | Cache read | Cache write | Output | API-equivalent $ |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...summarize(usage).map(
      (s) =>
        `| ${s.agent} | ${s.turns} | ${s.p50_ms} | ${s.p95_ms} | ${s.agent === "dm" ? TARGET_P95_MS.dm : TARGET_P95_MS.player} | ${s.input_tokens} | ${s.cache_read_tokens} | ${s.cache_write_tokens} | ${s.output_tokens} | ${s.api_equivalent_usd} |`,
    ),
    "",
    "End state (DM view):",
    ...options.endState.map((line) => `- ${line}`),
  ];
  for (const [title, kind] of [["Retries", "retry"], ["Fallbacks", "fallback"], ["Errors and timeouts", "error"]] as const) {
    const found = lines(kind);
    if (found.length > 0) out.push("", `${title}:`, ...found.map((line) => `- ${line}`));
  }
  if (options.audit) out.push("", `Audit and leak scan: ${options.audit.passed ? "passed" : "FAILED"}`, "", "```", options.audit.output, "```");
  return out;
}
