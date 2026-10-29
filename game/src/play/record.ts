// What a run folder records about the run itself (M7 spec §4.1, design §3.1, TASKS.md AGT-14):
// `run.json`, written when the run starts and again when it ends, so a crash still leaves the run's
// identity behind. Run folders stay out of the repo (`runs/` is gitignored); they go to the runs repo.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Handle } from "@nat20-table/engine-client";
import { REPO } from "../paths.ts";
import type { SceneTime } from "../table/loop.ts";
import type { StopKind } from "../table/types.ts";
import type { Settings } from "./settings.ts";

/** The run folder's format: bumped when a file in it changes shape. */
export const RUN_FORMAT = 1;

export const RUN_JSON = "run.json";

/** `run.json`. */
export interface RunRecord {
  run_format: number;
  run_id: string;
  /** The npm script that started it: `play:full`, `play:scene` or `play:exit`. */
  command: string;
  profile: { name: string; sha256: string } | null;
  /** Every resolved setting, with where its value came from. */
  settings: Settings["provenance"];
  build: {
    /** The table's commit, and whether the checkout had changes to tracked files: such a run isn't eligible for acceptance. */
    table_commit: string;
    dirty: boolean;
    /** From the engine's own `hello`, so they name what actually ran. */
    engine_rev: string;
    contract: string;
    schema_sha256: string;
    node: string;
    os: string;
  };
  seed: number;
  /** Who played whom: the human's character (null for a table with no human) and the AI players'. */
  seats: { human: Handle | null; ai: Handle[] };
  /** The scenes the run set out to play, in order. */
  plan: string[];
  /** The pack's whole adventure, in order: a run whose plan is less can't count for acceptance. */
  adventure: string[];
  /** The stop after this many minutes from the first scene's load; 0 for none. */
  time_limit_min: number;
  /** Each scene played, with the pack's time target. */
  scenes: Array<SceneTime & { target_minutes: number | null }>;
  started_at: string;
  ended_at: string | null;
  /** Why the run ended, as the table said it. */
  ended: string | null;
  /** Which stop ended it early, or null when it ended in play. */
  stop: StopKind | null;
}

/** The checkout a run comes from: its commit, and whether tracked files had changes. */
export function checkout(): { table_commit: string; dirty: boolean } {
  const git = (...args: string[]) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  const head = git("rev-parse", "HEAD");
  const status = git("status", "--porcelain", "--untracked-files=no");
  return { table_commit: head.status === 0 ? head.stdout.trim() : "unknown", dirty: status.status !== 0 || status.stdout.trim() !== "" };
}

export function writeRunRecord(runDir: string, record: RunRecord): void {
  writeFileSync(path.join(runDir, RUN_JSON), JSON.stringify(record, null, 2) + "\n");
}

export function readRunRecord(runDir: string): RunRecord {
  return JSON.parse(readFileSync(path.join(runDir, RUN_JSON), "utf8")) as RunRecord;
}
