// The narration check's digest as the TS side reads it (M7 design §3.4, TASKS.md AGT-9): runs
// `nat20-digest` over a run folder, and reads the `narration-digest.jsonl` it writes.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { REPO } from "../paths.ts";

/** The digest's file in the run folder. */
export const NARRATION_DIGEST = "narration-digest.jsonl";

/** One party member as the pack names it. */
export interface DigestMember {
  handle: string;
  names: string[];
  pronouns?: string;
  coins?: string;
}

/** A carried item. */
export interface Item {
  name: string;
  quantity: number;
  equipped: boolean;
}

/** A creature as the digest keeps it: the DM view, without the stat line. */
export interface DigestCreature {
  handle: string;
  name: string;
  side: string;
  hp: number;
  hp_max: number;
  temp_hp?: number;
  life_state: string;
  conditions?: string[];
  surrendered?: boolean;
  offered_surrender?: boolean;
}

/** What the engine held when the DM said one narration line (`nat20_duel::digest::Digest`). */
export interface DigestRecord {
  line: number;
  text: string;
  channel: string;
  log_head: number;
  scene: string | null;
  mode: string | null;
  round: number | null;
  turn: string | null;
  combat_over: boolean;
  creatures: DigestCreature[];
  fled: string[];
  adjacent: Array<[string, string]>;
  nearest_foe_ft: Array<[string, number]>;
  foes_ft: Record<string, Record<string, number>>;
  engine_lines: string[];
  inventory: Array<[string, Item[]]>;
}

/** A whole run's digest. */
export interface DigestRun {
  party: DigestMember[];
  narrations: number;
  requests_replayed: number;
  diverged: string | null;
  digests: DigestRecord[];
}

/** Reads `narration-digest.jsonl` from a run folder: the `run` record, then one record per line. */
export function readDigest(dir: string): DigestRun {
  const lines = readFileSync(path.join(dir, NARRATION_DIGEST), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { kind: string } & Record<string, unknown>);
  const head = lines.find((l) => l.kind === "run") as unknown as Omit<DigestRun, "digests"> | undefined;
  if (!head) throw new Error(`${NARRATION_DIGEST} has no run record`);
  return { ...head, digests: lines.filter((l) => l.kind === "narration") as unknown as DigestRecord[] };
}

/** Runs `nat20-digest` over a run folder; it writes the digest, and fails (still writing it) on a replay divergence. */
export function runDigest(pack: string, dir: string): { ok: boolean; output: string } {
  const run = spawnSync("cargo", ["run", "--quiet", "-p", "nat20-duel", "--bin", "nat20-digest", "--", "--pack", pack, dir], { cwd: REPO, encoding: "utf8" });
  if (run.error) return { ok: false, output: `nat20-digest didn't run: ${run.error.message}` };
  return { ok: run.status === 0 && existsSync(path.join(dir, NARRATION_DIGEST)), output: `${run.stdout}${run.stderr}`.trim() };
}
