// `npm run audit:narration -- <run-dir> [--pack DIR] [--judge model|scripted]`: the narration
// check over a finished run folder (narration.ts), then the verdict again, since row 3 reads it.
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { setTurnTracer } from "../agents/sdk-session.ts";
import { refuseApiKey } from "../play/run.ts";
import { tracerFromEnv } from "../tracing.ts";
import { packOfRun, tagsOfRun } from "../play/record.ts";
import { writeVerdict } from "../play/verdict.ts";
import { NARRATION_DIGEST } from "./digest.ts";
import { ScriptedJudge } from "./judge.ts";
import { modelJudgeFor, narrationCheck } from "./narration.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { pack: { type: "string" }, judge: { type: "string", default: "model" }, "new-digest": { type: "boolean", default: false } },
});
const dir = positionals[0];
if (!dir || !existsSync(dir) || !["model", "scripted"].includes(values.judge!)) {
  console.error("usage: npm run audit:narration -- <run-dir> [--pack DIR] [--judge model|scripted] [--new-digest]");
  process.exit(2);
}
if (values.judge === "model") refuseApiKey();
// A digest from an older build is replayed again only when asked: it is the engine's word for that run.
if (values["new-digest"]) rmSync(path.join(dir, NARRATION_DIGEST), { force: true });
// The judge's turns join the run's Langfuse session when tracing is on (AGT-16).
const tracer = values.judge === "model" ? await tracerFromEnv({ sessionId: path.basename(path.resolve(dir)), tags: [...tagsOfRun(dir), "audit:narration"] }) : undefined;
setTurnTracer(tracer);
const check = await narrationCheck(values.pack ?? packOfRun(dir), dir, values.judge === "scripted" ? new ScriptedJudge() : modelJudgeFor(dir)).finally(() => tracer?.flush());
for (const line of check.lines) console.log(line);
const verdict = writeVerdict(dir);
console.log(`Verdict: ${verdict.verdict}: ${verdict.why}`);
process.exit(check.ok ? 0 : 1);
