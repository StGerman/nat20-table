// The narration check over a run folder (M7 spec §4.3, design §3.3 and §3.4, TASKS.md AGT-9): the
// digest stage (`nat20-digest` writes `narration-digest.jsonl`), then the judge stage, which
// writes `narration-check.jsonl`: one line per flag for Stas to confirm or dismiss, and one per
// untracked prop, listed and not flagged. The verdict's row 3 reads that file.
//
//   npm run audit:narration -- <run-dir> [--pack DIR] [--judge model|scripted]
//
// The model judge runs on Stas's Mac under his Claude login (decision 0036), like the run itself;
// `--judge scripted` reports nothing and calls no model, for a thread or a test.
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NARRATION_DIGEST, readDigest, runDigest } from "./digest.ts";
import { judgeRun, type Judge } from "./judge.ts";
import { NARRATION_CHECK } from "../play/verdict.ts";

export interface NarrationCheck {
  /** Both stages ran: `narration-check.jsonl` is written. */
  ok: boolean;
  /** What to print and put in the report. */
  lines: string[];
}

/**
 * Runs whichever of the two stages is missing. A replay divergence or a judge that fails leaves
 * no `narration-check.jsonl`, so the verdict's row 3 stays pending and says why.
 */
export async function narrationCheck(pack: string, dir: string, judge: Judge): Promise<NarrationCheck> {
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
  writeFileSync(path.join(dir, NARRATION_CHECK), found.map((f) => JSON.stringify(f) + "\n").join(""));
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
