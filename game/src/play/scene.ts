// The step 10 live run (M6 spec §8, runbook Part 2): scenes of a scenario pack with the DM agent and
// the AI players on the Agent SDK, and Bren on a scripted seat, or played by you in the terminal UI
// with --seat ink (step 11). By default Scene 3 of The Silent Mill, the yard fight; the exit run
// (step 13, `npm run play:exit`) plays Scene 1 and Scene 3 with you as Bren. Run on Stas's Mac
// under his Claude login (decision 0036), never in CI or a cloud session: `npm run play:scene`.
//
// The scenes before the first one played are loaded first, the party carried along, and nobody is
// told about them. A scene the DM loads between two played ones is passed over: the party goes on
// to the next played scene, and the DM hears so. The run stops when the DM loads any other scene or
// ends the adventure. It writes `runs/scene-<time>/`, runs the audit and leak scan over it, and
// prints a report, also written to `report.md` in the folder.
//
// Flags: --scene ID, --scenes ID,ID (the scenes to play, in the pack's order; overrides --scene),
// --seed N, --dm-model, --player-model, --effort, --craft prompt|skills (D10), --dm-timeout-ms,
// --pack DIR, --dm scripted and --players scripted (no model: checks the command itself; the
// scripted DM starts each scene's fight from the pack, narrates plainly and moves on at the first
// table turn), --seat scripted|ink (ink: you play the human's character in this terminal),
// --dry-run (prints the DM's prompt and session settings, starts nothing), --no-audit, --out DIR,
// --max-steps N.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import { ModelDm, type CraftMode } from "../agents/dm.ts";
import { ModelPlayer } from "../agents/player.ts";
import { sessionOptions } from "../agents/sdk-session.ts";
import { GameEngine, REPO } from "../engine.ts";
import { readPack } from "../pack/read.ts";
import { TableLoop, type RunReport } from "../table/loop.ts";
import { ScriptedPlayer, ScriptedSeat, walkOnDm } from "../table/scripted.ts";
import { TableState } from "../table/state.ts";
import { Transcript } from "../table/transcript.ts";
import type { DmAgent, PlayerAgent, Seat } from "../table/types.ts";
import { InkSeat } from "../ui/ink-seat.ts";
import { UsageLog } from "../usage.ts";
import { audit, endState, guards, packParty, refuseApiKey, reportSections, runFolder, scenePlan, startAt } from "./run.ts";

const { values: flags } = parseArgs({
  options: {
    scene: { type: "string", default: "s3_mill_yard" },
    scenes: { type: "string" },
    seed: { type: "string" },
    "dm-model": { type: "string", default: "claude-opus-5-5" },
    "player-model": { type: "string", default: "claude-sonnet-5-5" },
    effort: { type: "string", default: "low" },
    craft: { type: "string", default: "prompt" },
    "dm-timeout-ms": { type: "string" },
    pack: { type: "string", default: path.join(REPO, "scenarios/the_silent_mill") },
    dm: { type: "string", default: "model" },
    players: { type: "string", default: "model" },
    seat: { type: "string", default: "scripted" },
    "dry-run": { type: "boolean", default: false },
    "no-audit": { type: "boolean", default: false },
    out: { type: "string", default: path.join(REPO, "runs") },
    "max-steps": { type: "string", default: "2000" },
  },
});
for (const [flag, value, allowed] of [
  ["--dm", flags.dm, ["model", "scripted"]],
  ["--players", flags.players, ["model", "scripted"]],
  ["--craft", flags.craft, ["prompt", "skills"]],
  ["--seat", flags.seat, ["scripted", "ink"]],
] as const) {
  if (!(allowed as readonly string[]).includes(value!)) {
    console.error(`${flag} is one of ${allowed.join(", ")}`);
    process.exit(2);
  }
}
const pack = readPack(flags.pack!);
const party = packParty(flags.pack!);
const played = (flags.scenes ?? flags.scene!).split(",").map((id) => id.trim()).filter((id) => id !== "");
let plan: ReturnType<typeof scenePlan>;
try {
  plan = scenePlan(flags.pack!, played);
} catch (error) {
  console.error(`${flags.scenes ? "--scenes" : "--scene"}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
const effort = flags.effort as EffortLevel;
const dmChoice = { model: flags["dm-model"]!, effort };
const playerChoice = { model: flags["player-model"]!, effort };
const craft = flags.craft as CraftMode;
const modelDm = (usage?: UsageLog) =>
  new ModelDm({
    pack,
    human: party.human,
    players: party.ai,
    choice: dmChoice,
    craft,
    usage,
    ...(flags["dm-timeout-ms"] ? { turnTimeoutMs: Number(flags["dm-timeout-ms"]) } : {}),
  });

if (flags["dry-run"]) {
  const dm = modelDm();
  const { mcpServers, systemPrompt, env, ...options } = sessionOptions(dm.sessionConfig(), "<empty temp dir>");
  const shown = { ...options, mcpServers: Object.keys(mcpServers ?? {}), seatTools: dm.seatTools.map((t) => t.name), env: Object.keys(env ?? {}) };
  console.log(`## dm\n\n${JSON.stringify(shown, null, 2)}\n\n${systemPrompt}\n`);
  console.log(`(${String(systemPrompt).length} characters of system prompt; the players' prompts: npm run play:ai-party -- --dry-run)`);
  process.exit(0);
}
if (flags.dm === "model" || flags.players === "model") refuseApiKey();
if (flags.seat === "ink" && !(process.stdin.isTTY && process.stdout.isTTY)) {
  console.error("--seat ink needs your keyboard and screen: run it in a terminal, not through a pipe or Remote Control.");
  process.exit(2);
}

const runDir = runFolder(flags.out!, "scene");
const usage = new UsageLog(path.join(runDir, "usage.jsonl"));
const engine = await GameEngine.start({ pack: flags.pack!, runDir, seed: flags.seed === undefined ? undefined : Number(flags.seed) });
const carried = await startAt(engine, flags.pack!, plan.first, [party.human, ...party.ai]);
const transcript = new Transcript(path.join(runDir, "transcript.jsonl"), () => engine.logHead);
// You at the keyboard, or a seat that fights by rule. Ctrl+C ends the table between decisions.
const ink = flags.seat === "ink" ? new InkSeat(party.human, { onQuit: () => table.end("the human quit") }) : undefined;
const seat: Seat = ink ?? new ScriptedSeat(party.human, [], ScriptedSeat.fight);
const table = new TableState({
  engine,
  human: party.human,
  players: party.ai,
  seat,
  transcript,
  inputsFile: path.join(runDir, "inputs.jsonl"),
  ...guards(flags.pack!, engine),
});
const players: PlayerAgent[] = party.ai.map((handle) =>
  flags.players === "scripted" ? new ScriptedPlayer(handle) : new ModelPlayer({ handle, card: party.cards.get(handle)!, choice: playerChoice, usage }),
);
const fights = Object.fromEntries(pack.adventure.scenes.flatMap((s) => (s.encounters[0] ? [[s.id, s.encounters[0].encounter]] : [])));
const dm: DmAgent = flags.dm === "scripted" ? walkOnDm(pack.adventure.scenes.map((s) => s.id), fights, [party.human, ...party.ai]) : modelDm(usage);
const loop = new TableLoop({
  table,
  dm,
  players,
  onScene: plan.onScene,
  maxSteps: Number(flags["max-steps"]),
});

const who = (kind: string | undefined, choice: { model: string; effort: string }) => (kind === "scripted" ? "scripted" : `${choice.model} (${choice.effort})`);
console.log(
  `Playing ${played.join(" and ")} of ${pack.adventure.title} (seed ${engine.seed}): DM ${who(flags.dm, dmChoice)}, ${party.ai.join(", ")} ${who(flags.players, playerChoice)}, ${party.human} ${ink ? "played by you" : "scripted"}.`,
);
// Interactive even if CI is set in the shell: Ink would otherwise draw only the last frame.
ink?.start({ interactive: true });
let run: RunReport | undefined;
let failure: unknown;
try {
  run = await loop.run(plan.first, carried);
} catch (error) {
  failure = error;
}
ink?.stop();
const end = await endState(engine).catch(() => []);
engine.close();
const checked = flags["no-audit"] ? undefined : audit(flags.pack!, runDir);

const report = [
  `# Scene run, ${new Date().toISOString()}`,
  "",
  `- Scenes: ${played.join(", ")} of ${pack.adventure.title} (${path.relative(REPO, path.resolve(flags.pack!))}), seed ${engine.seed}`,
  `- Played: ${run?.scenes.join(", ") || "none"}${run && run.passedOver.length > 0 ? `; passed over: ${run.passedOver.join(", ")}` : ""}`,
  `- DM: ${who(flags.dm, dmChoice)}${flags.dm === "model" ? `, craft guidance in the ${craft === "prompt" ? "system prompt" : "skills"}` : ""}`,
  `- AI players: ${party.ai.join(", ")}, ${who(flags.players, playerChoice)}; ${party.human} ${ink ? "played in the terminal UI" : "on a scripted seat"}`,
  ...(ink ? [`- Your decisions the engine refused: ${run?.humanRejections ?? "n/a"}`] : []),
  ...reportSections({ run, failure, transcript: transcript.records, usage: usage.records, endState: end, audit: checked }),
  "",
  "Narration:",
  ...transcript.records.filter((r) => r.speaker === "dm" && r.kind === "narration").map((r) => `> ${r.text}`),
].join("\n");
writeFileSync(path.join(runDir, "report.md"), report + "\n");
const folder = path.relative(process.cwd(), runDir);
const name = path.basename(runDir);
console.log(
  `\n${report}\n\nWritten to ${folder}/. Send report.md back to the thread, or the whole folder zipped: (cd ${JSON.stringify(path.dirname(folder))} && zip -qr ${name}.zip ${name})`,
);
process.exitCode = failure || (checked && !checked.passed) ? 1 : 0;
