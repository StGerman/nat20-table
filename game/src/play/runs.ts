// Post-run stages over a run folder, again (M7 design §3.3, TASKS.md AGT-14). Each reads the folder
// and writes its own file, so a run cut off in a stage is finished later without a replay:
//   npm run runs:verdict -- <run-dir>   recomputes verdict.json and the verdict block in report.md
//   npm run runs:finish -- <run-dir>    runs the stages whose files are missing (the audit, the
//                                       report), then the verdict
// The verdict needs nothing but the folder, so a thread can recompute it once Stas has answered the
// flags in confirmations.json.
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO } from "../paths.ts";
import { readRunRecord } from "./record.ts";
import { audit, timingLines } from "./run.ts";
import { AUDIT_JSON, writeVerdict } from "./verdict.ts";

const [stage, dir] = process.argv.slice(2);
if (!dir || !["verdict", "finish"].includes(stage) || !existsSync(dir)) {
  console.error("usage: npm run runs:verdict -- <run-dir>, or npm run runs:finish -- <run-dir>");
  process.exit(2);
}
if (stage === "finish" && !existsSync(path.join(dir, AUDIT_JSON))) {
  // The pack as the run recorded it, when it is on this machine; a run from the Mac read in a thread
  // has a path that only the Mac has, and the repo's own pack in its place.
  const recorded = readRunRecord(dir).settings.pack?.value as string | undefined;
  const pack = recorded && existsSync(recorded) ? recorded : path.join(REPO, "scenarios/the_silent_mill");
  console.log(`Running the audit and leak scan over ${dir}`);
  writeFileSync(path.join(dir, AUDIT_JSON), JSON.stringify(audit(pack, dir), null, 2) + "\n");
}
if (stage === "finish" && !existsSync(path.join(dir, "report.md"))) {
  // The run stopped before its report: the timing table from run.json stands in for it. The
  // in-play counts (talk rounds, reactions) were the process's own and are not in the folder.
  const run = readRunRecord(dir);
  console.log(`Writing ${path.join(dir, "report.md")} from ${path.join(dir, "run.json")}`);
  const lines = [`# Run ${run.run_id}`, "", `Written by runs:finish: the run stopped before its own report, so this one has only what run.json holds.`, "", ...timingLines(run)];
  writeFileSync(path.join(dir, "report.md"), lines.join("\n") + "\n");
}
const verdict = writeVerdict(dir);
console.log(`Verdict: ${verdict.verdict}: ${verdict.why}`);
for (const row of verdict.rows) console.log(`- ${row.row} ${row.title}: ${row.status} (${row.detail})`);
