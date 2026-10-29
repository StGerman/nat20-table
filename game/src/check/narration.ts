// The narration check over a run folder (M7 spec §4.3, design §3.3 and §3.4, TASKS.md AGT-9): the
// digest stage (`nat20-digest` writes `narration-digest.jsonl`), then the judge stage, which
// writes `narration-check.jsonl`: one line per flag for Stas to confirm or dismiss, and one per
// untracked prop, listed and not flagged. The verdict's row 3 reads that file.
//
//   npm run audit:narration -- <run-dir> [--pack DIR] [--judge model|scripted]
//
// The model judge runs on Stas's Mac under his Claude login (decision 0036), like the run itself;
// `--judge scripted` reports nothing and calls no model, for a thread or a test.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NARRATION_DIGEST, readDigest, runDigest } from "./digest.ts";
import { judgeRun, type CheckLine, type Judge } from "./judge.ts";
import { CONFIRMATIONS_JSON, NARRATION_CHECK } from "../play/verdict.ts";

/** An earlier check, moved aside while a new one runs: its answers carry over only to the same flags. */
export const PREVIOUS_CHECK = "narration-check.previous.jsonl";

export interface NarrationCheck {
  /** Both stages ran: `narration-check.jsonl` is written. */
  ok: boolean;
  /** What to print and put in the report. */
  lines: string[];
}

/**
 * Runs whichever of the two stages is missing. A replay divergence or a judge that fails leaves
 * no `narration-check.jsonl`, so the verdict's row 3 stays pending and says why: an earlier check
 * is moved aside first, and a new one is written only once both stages succeed.
 */
export async function narrationCheck(pack: string, dir: string, judge: Judge): Promise<NarrationCheck> {
  const current = path.join(dir, NARRATION_CHECK);
  const previous = path.join(dir, PREVIOUS_CHECK);
  // A previous attempt that failed already moved the last good check aside: keep that one.
  if (existsSync(current)) renameSync(current, previous);
  if (!existsSync(path.join(dir, NARRATION_DIGEST))) {
    // A replay that diverges still writes its digest (and exits 1): the run record below says where.
    const digest = runDigest(pack, dir);
    if (!existsSync(path.join(dir, NARRATION_DIGEST))) return { ok: false, lines: [`Narration check: the digest failed, so the judge didn't run. ${digest.output}`] };
  }
  const run = readDigest(dir);
  if (run.diverged) return { ok: false, lines: [`Narration check: the engine log didn't replay (${run.diverged}), so the judge didn't run.`] };
  let found;
  try {
    found = await judgeRun(run, judge);
  } catch (error) {
    return { ok: false, lines: [`Narration check: the judge stopped: ${(error as Error).message}. Run it again with npm run audit:narration -- ${dir}`] };
  }
  writeFileSync(current, found.map((f) => JSON.stringify(f) + "\n").join(""));
  if (existsSync(previous)) {
    dropStaleAnswers(dir, readLines(previous), found);
    rmSync(previous);
  }
  const flags = found.filter((f) => !("untracked" in f));
  const untracked = found.filter((f) => "untracked" in f);
  return {
    ok: true,
    lines: [
      `Narration check: ${run.digests.length} narration lines, ${flags.length} flags for Stas, ${untracked.length} untracked props.`,
      ...flags.map((f) => ("claim" in f ? `- ${f.id} (line ${f.line}, ${f.kind}): ${f.claim}; evidence ${f.evidence_seq.join(", ") || "the state"}. "${f.text}"` : "")),
      ...untracked.map((f) => ("item" in f ? `- ${f.id} (line ${f.line}): untracked: ${f.item}` : "")),
    ],
  };
}

function readLines(file: string): CheckLine[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as CheckLine);
}

/**
 * Flag ids count the judge's reports on a line (`n4-1`, `n4-2`), so a new check can give an old id
 * to another claim. An answer Stas gave stays only where the new flag of that id is the same line,
 * kind and claim; any other answer to an old flag is dropped, and the flag asks him again.
 */
export function dropStaleAnswers(dir: string, before: CheckLine[], after: CheckLine[]): void {
  const file = path.join(dir, CONFIRMATIONS_JSON);
  if (!existsSync(file)) return;
  const answers = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const same = (a: CheckLine, b: CheckLine | undefined) =>
    b !== undefined && "claim" in a && "claim" in b && a.line === b.line && a.kind === b.kind && a.claim === b.claim;
  let dropped = false;
  for (const old of before) {
    if (!("claim" in old) || !(old.id in answers)) continue;
    if (same(old, after.find((f) => f.id === old.id))) continue;
    delete answers[old.id];
    dropped = true;
  }
  if (dropped) writeFileSync(file, JSON.stringify(answers, null, 2) + "\n");
}
