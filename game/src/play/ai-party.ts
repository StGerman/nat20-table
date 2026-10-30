// The step 9 live run (M6 spec §8, runbook Part 2): the AI players on the Agent SDK, with Bren on a
// scripted seat and a scripted DM, through the Milestone 5 yard fight. Run on Stas's Mac under his
// Claude login (decision 0036), never in CI or a cloud session: `npm run play:ai-party`.
//
// Writes `runs/ai-party-<time>/` (transcript, engine and session logs, every input each seat got,
// usage per model call), runs the audit and leak scan over it, and prints a report, also written
// to `report.md` in the folder.
//
// Flags: --seed N, --player-model, --effort, --pack (where the cards come from), --scenes and
// --scene and --encounter (what the engine plays), --players scripted (no model: checks the command
// itself), --dry-run (prints each player's prompt and session settings, starts nothing),
// --no-audit, --out DIR, --max-steps N, --lang en|ru (what the AI players write; decision 0038),
// --upload REPO, --no-upload, --zip (the runs repo, AGT-41).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import { LANGUAGES, type Language } from "../agents/language.ts";
import { ModelPlayer } from "../agents/player.ts";
import { sessionOptions } from "../agents/sdk-session.ts";
import { GameEngine, REPO } from "../engine.ts";
import { TableLoop, type RunReport } from "../table/loop.ts";
import { ScriptedPlayer, ScriptedSeat, yardDm } from "../table/scripted.ts";
import { TableState } from "../table/state.ts";
import { Transcript } from "../table/transcript.ts";
import type { PlayerAgent } from "../table/types.ts";
import { UsageLog } from "../usage.ts";
import { uploadStage } from "./upload.ts";
import { audit, endState, guards, castParty, refuseApiKey, reportSections, runFolder } from "./run.ts";

const { values: flags } = parseArgs({
  options: {
    seed: { type: "string" },
    "player-model": { type: "string", default: "claude-sonnet-5-5" },
    effort: { type: "string", default: "low" },
    pack: { type: "string", default: path.join(REPO, "scenarios/the_silent_mill") },
    scenes: { type: "string", default: path.join(REPO, "crates/nat20-api-server/data") },
    scene: { type: "string", default: "m5_s3_yard" },
    encounter: { type: "string", default: "yard_fight" },
    players: { type: "string", default: "model" },
    lang: { type: "string", default: "en" },
    "dry-run": { type: "boolean", default: false },
    "no-audit": { type: "boolean", default: false },
    out: { type: "string", default: path.join(REPO, "runs") },
    "max-steps": { type: "string", default: "2000" },
    upload: { type: "string" },
    "no-upload": { type: "boolean", default: false },
    zip: { type: "boolean", default: false },
  },
});
if (flags.players !== "model" && flags.players !== "scripted") {
  console.error("--players is model or scripted");
  process.exit(2);
}
if (!(LANGUAGES as readonly string[]).includes(flags.lang!)) {
  console.error(`--lang is one of ${LANGUAGES.join(", ")}`);
  process.exit(2);
}
const language = flags.lang as Language;
const scripted = flags.players === "scripted";
const choice = { model: flags["player-model"]!, effort: flags.effort as EffortLevel };
const cast = castParty(flags.pack!);
// The AI party plays beside a scripted human's character: this command always has one.
if (!cast.human) throw new Error(`${flags.pack}: the party has no human seat`);
const party = { ...cast, human: cast.human };

if (flags["dry-run"]) {
  for (const handle of party.ai) {
    const player = new ModelPlayer({ handle, card: party.cards.get(handle)!, characterClass: party.classes.get(handle)!, choice, language });
    const { mcpServers, systemPrompt, env, ...options } = sessionOptions(
      { agent: handle, choice, systemPrompt: player.systemPrompt, tools: player.seatTools },
      "<empty temp dir>",
    );
    const shown = { ...options, mcpServers: Object.keys(mcpServers ?? {}), seatTools: player.seatTools.map((t) => t.name), env: Object.keys(env ?? {}) };
    console.log(`## ${handle}\n\n${JSON.stringify(shown, null, 2)}\n\n${systemPrompt}\n`);
  }
  process.exit(0);
}
if (!scripted) refuseApiKey();

const runDir = runFolder(flags.out!, "ai-party");
const usage = new UsageLog(path.join(runDir, "usage.jsonl"));
const engine = await GameEngine.start({ pack: flags.scenes!, runDir, seed: flags.seed === undefined ? undefined : Number(flags.seed) });
const transcript = new Transcript(path.join(runDir, "transcript.jsonl"), () => engine.logHead);
const table = new TableState({
  engine,
  human: party.human,
  players: party.ai,
  seat: new ScriptedSeat(party.human, [], ScriptedSeat.fight, party.ai),
  transcript,
  inputsFile: path.join(runDir, "inputs.jsonl"),
  ...guards(flags.scenes!, engine),
});
const players: PlayerAgent[] = party.ai.map((handle) =>
  scripted ? new ScriptedPlayer(handle) : new ModelPlayer({ handle, card: party.cards.get(handle)!, characterClass: party.classes.get(handle)!, choice, language, usage }),
);
const loop = new TableLoop({ table, dm: yardDm(flags.encounter), players, maxSteps: Number(flags["max-steps"]), names: party.names });

console.log(`Playing ${flags.scene} (seed ${engine.seed}): ${party.ai.join(", ")} on ${scripted ? "scripted players" : `${choice.model} (${choice.effort})`}, ${party.human} scripted, DM scripted.`);
let run: RunReport | undefined;
let failure: unknown;
try {
  run = await loop.run(flags.scene!);
} catch (error) {
  failure = error;
}
const end = await endState(engine).catch(() => []);
engine.close();
const checked = flags["no-audit"] ? undefined : audit(flags.scenes!, runDir);

const report = [
  `# All-AI party run, ${new Date().toISOString()}`,
  "",
  `- Scene: ${flags.scene} from ${path.relative(REPO, path.resolve(flags.scenes!)) || "."}, seed ${engine.seed}`,
  `- AI players: ${party.ai.join(", ")} on ${scripted ? "scripted players" : `${choice.model}, effort ${choice.effort}`}; cards from ${path.relative(REPO, path.resolve(flags.pack!))}`,
  `- ${party.human} on a scripted seat; the DM scripted`,
  ...(language === "en" ? [] : [`- Language of the AI players' lines: ${language}`]),
  ...reportSections({ run, failure, transcript: transcript.records, usage: usage.records, endState: end, audit: checked }),
].join("\n");
writeFileSync(path.join(runDir, "report.md"), report + "\n");
console.log(`\n${report}\n\nWritten to ${path.relative(process.cwd(), runDir)}/. Send report.md back to the thread.`);
for (const line of uploadStage(runDir, flags)) console.log(line);
process.exitCode = failure || (checked && !checked.passed) ? 1 : 0;
