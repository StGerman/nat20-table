// One live run, shared by `play:scene`, `play:exit` and `play:full` (M7 design §3.1, TASKS.md AGT-14):
// scenes of a scenario pack with the DM agent and the AI players on the Agent SDK, and the human's
// character on a scripted seat or played in the terminal UI (--seat ink). Run on Stas's Mac under his
// Claude login (decision 0036), never in CI or a cloud session.
//
// The scenes before the first one played are loaded first, the party carried along, and nobody is
// told about them. A scene the DM loads between two played ones is passed over: the party goes on to
// the next played scene, and the DM hears so. The run stops when the DM loads any other scene or ends
// the adventure, or at a stop: the time limit, a stall, the plan's usage limit, a lost network,
// Ctrl+C, or a crash. It writes `runs/<name>-<time>/` with `run.json` (what ran: build, settings and
// where each came from, seed, seats, per-scene timing), then runs the post-run stages over it (the
// audit and leak scan, the narration check, the verdict), writes `report.md` with the verdict on top, and uploads the
// folder to the runs repo (upload.ts).
//
// Settings (game/src/play/settings.ts): --profile NAME|PATH, --scene ID, --scenes ID,ID, --seed N,
// --dm-model, --player-model, --dm-effort, --effort (the AI players'), --craft prompt|skills (D10),
// --dm-timeout-ms, --pack DIR, --dm scripted and --players scripted (no model), --seat scripted|ink,
// --dry-run (prints the DM's prompt and session settings, starts nothing), --no-audit (no audit and
// no narration check), --out DIR,
// --max-steps N, --lang en|ru (decision 0038), --verbose (with --seat ink: AGT-37), --time-limit-min N,
// --stall-rounds N, --upload REPO, --no-upload, --zip (AGT-41).
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import { ModelDm, type CraftMode } from "../agents/dm.ts";
import type { Language } from "../agents/language.ts";
import { ModelPlayer } from "../agents/player.ts";
import { sessionOptions } from "../agents/sdk-session.ts";
import { GameEngine, REPO } from "../engine.ts";
import { readPack } from "../pack/read.ts";
import { TableLoop, type Progress, type RunReport } from "../table/loop.ts";
import { chainDm, chainScenes, ScriptedPlayer, ScriptedSeat, walkOnDm } from "../table/scripted.ts";
import { TableState } from "../table/state.ts";
import { Transcript } from "../table/transcript.ts";
import type { DmAgent, PlayerAgent, Seat } from "../table/types.ts";
import { InkSeat } from "../ui/ink-seat.ts";
import { pickCharacter } from "../ui/pick.ts";
import { UsageLog } from "../usage.ts";
import { ModelJudge, ScriptedJudge } from "../check/judge.ts";
import { narrationCheck } from "../check/narration.ts";
import { checkout, RUN_FORMAT, writeRunRecord, type RunRecord } from "./record.ts";
import { audit, castParty, endState, guards, partyRoster, refuseApiKey, reportSections, runFolder, scenePlan, startAt, timingLines, type Casting, type PackParty } from "./run.ts";
import { resolveSettings, SettingError, type SettingName, type Settings } from "./settings.ts";
import { uploadStage } from "./upload.ts";
import { AUDIT_JSON, verdictBlock, writeVerdict } from "./verdict.ts";

export interface PlayCommand {
  /** The npm script, for `run.json`. */
  command: string;
  /** The run folder's name: `full` writes `runs/full-<time>/`. */
  folder: string;
  /** The command's own defaults, over the built-in ones. */
  defaults?: Partial<Record<SettingName, string | number | boolean>>;
  /** With neither --scene nor --scenes, play every scene of the pack, in order. */
  allScenes?: boolean;
}

/** The npm script that started this process, when it is a play command; `fallback` otherwise. */
export function npmCommand(fallback: string): string {
  const event = process.env.npm_lifecycle_event;
  return event?.startsWith("play:") ? event : fallback;
}

/** Runs one play command with the arguments typed after it, and sets the exit code. */
export async function playRun(play: PlayCommand, args: string[]): Promise<void> {
  let settings: Settings;
  try {
    settings = resolveSettings(args, play.defaults);
  } catch (error) {
    if (!(error instanceof SettingError)) throw error;
    console.error(error.message);
    process.exit(2);
  }
  const flags = settings.values;
  const pack = readPack(flags.pack);
  // `--seat ai`: no human at the table, and every character an AI player (AGT-40). `--play` puts
  // the human on another character (AGT-35); with `--seat ink` and no `--play`, the pick list does.
  if (flags.seat === "ai" && flags.play) {
    console.error("--play names the human's character, and --seat ai has no human.");
    process.exit(2);
  }
  const casting: Casting = flags.seat === "ai" ? "none" : flags.play ? { play: flags.play } : "default";
  let party: PackParty;
  try {
    party = castParty(flags.pack, casting);
  } catch (error) {
    console.error(`--play: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  const typedScenes = settings.provenance.scenes ?? settings.provenance.scene;
  const played =
    play.allScenes && (!typedScenes || typedScenes.from === "default")
      ? pack.adventure.scenes.map((s) => s.id)
      : (flags.scenes ?? flags.scene).split(",").map((id) => id.trim()).filter((id) => id !== "");
  if (play.allScenes && (!typedScenes || typedScenes.from === "default")) {
    // What the run plays, as run.json records it: every scene, by the command's default.
    delete settings.provenance.scene;
    settings.provenance.scenes = { value: played.join(","), from: "default" };
  }
  let plan: ReturnType<typeof scenePlan>;
  try {
    plan = scenePlan(flags.pack, played);
  } catch (error) {
    console.error(`${flags.scenes ? "--scenes" : "--scene"}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  const dmChoice = { model: flags["dm-model"], effort: flags["dm-effort"] as EffortLevel };
  const playerChoice = { model: flags["player-model"], effort: flags.effort as EffortLevel };
  const craft = flags.craft as CraftMode;
  const language = flags.lang as Language;
  const modelDm = (usage?: UsageLog) =>
    new ModelDm({
      pack,
      human: party.human,
      players: party.ai,
      choice: dmChoice,
      craft,
      language,
      usage,
      ...(flags["dm-timeout-ms"] !== undefined ? { turnTimeoutMs: flags["dm-timeout-ms"] } : {}),
    });

  if (flags["dry-run"]) {
    const dm = modelDm();
    const { mcpServers, systemPrompt, env, ...options } = sessionOptions(dm.sessionConfig(), "<empty temp dir>");
    const shown = { ...options, mcpServers: Object.keys(mcpServers ?? {}), seatTools: dm.seatTools.map((t) => t.name), env: Object.keys(env ?? {}) };
    console.log(`## dm\n\n${JSON.stringify(shown, null, 2)}\n\n${systemPrompt}\n`);
    console.log(`(${String(systemPrompt).length} characters of system prompt; the players' prompts: npm run play:ai-party -- --dry-run)`);
    console.log(`\nSettings:\n${Object.entries(settings.provenance).map(([name, s]) => `- ${name}: ${s.value} (${s.from})`).join("\n")}`);
    process.exit(0);
  }
  if (flags.dm === "model" || flags.players === "model") refuseApiKey();
  if (flags.seat === "ink" && !(process.stdin.isTTY && process.stdout.isTTY)) {
    console.error("--seat ink needs your keyboard and screen: run it in a terminal, not through a pipe or Remote Control.");
    process.exit(2);
  }
  if (flags.seat === "ink" && !flags.play && party.human) {
    const picked = await pickCharacter(partyRoster(flags.pack), party.human);
    if (picked !== party.human) party = castParty(flags.pack, { play: picked });
  }
  const everyone = [...(party.human ? [party.human] : []), ...party.ai];

  // You at the keyboard, or a seat that fights by rule. Ctrl+C ends the table between decisions
  // (before the table is set, it exits). The keyboard seat draws from here, so the engine's start
  // shows its loading indicator too.
  let quit: () => void = () => process.exit(130);
  const ink = flags.seat === "ink" && party.human ? new InkSeat(party.human, { onQuit: () => quit(), verbose: flags.verbose }) : undefined;
  // Interactive even if CI is set in the shell: Ink would otherwise draw only the last frame.
  ink?.start({ interactive: true });
  ink?.busy("The engine is starting");

  const runDir = runFolder(flags.out, play.folder);
  const usage = new UsageLog(path.join(runDir, "usage.jsonl"));
  // A failed start gives the terminal back before its error prints.
  const started = await (async () => {
    let engine: GameEngine | undefined;
    try {
      engine = await GameEngine.start({ pack: flags.pack, runDir, seed: flags.seed });
      return { engine, carried: await startAt(engine, flags.pack, plan.first, everyone) };
    } catch (error) {
      engine?.close();
      ink?.stop();
      throw error;
    }
  })();
  const { engine, carried } = started;
  const targets = new Map(pack.adventure.scenes.map((s) => [s.id, s.target_minutes]));
  const record: RunRecord = {
    run_format: RUN_FORMAT,
    run_id: path.basename(runDir),
    command: play.command,
    profile: settings.profile ? { name: settings.profile.name, sha256: settings.profile.sha256 } : null,
    settings: settings.provenance,
    build: {
      ...checkout(),
      engine_rev: engine.hello.engine_rev,
      contract: engine.hello.version,
      schema_sha256: engine.hello.schema_sha256,
      node: process.version,
      os: `${process.platform} ${process.arch}`,
    },
    seed: engine.seed,
    seats: { human: party.human ?? null, ai: party.ai },
    plan: played,
    adventure: pack.adventure.scenes.map((s) => s.id),
    time_limit_min: flags["time-limit-min"],
    scenes: [],
    started_at: new Date().toISOString(),
    ended_at: null,
    ended: null,
    stop: null,
  };
  writeRunRecord(runDir, record);

  const transcript = new Transcript(path.join(runDir, "transcript.jsonl"), () => engine.logHead);
  const seat: Seat | undefined = ink ?? (party.human ? new ScriptedSeat(party.human, [], ScriptedSeat.fight, party.ai) : undefined);
  const table = new TableState({
    engine,
    human: party.human,
    players: party.ai,
    seat,
    transcript,
    inputsFile: path.join(runDir, "inputs.jsonl"),
    ...guards(flags.pack, engine),
  });
  // Who plays whom, in the transcript as in run.json (AGT-35).
  table.log("system", party.human ? `the human plays ${party.human}; AI players: ${party.ai.join(", ")}` : `no human; AI players: ${party.ai.join(", ")}`);
  quit = () => table.end("the human quit", "operator");
  // Without a keyboard seat, Ctrl+C stops the run between decisions; a second one exits at once.
  const interrupted = () => {
    if (table.ended) process.exit(130);
    console.log("\nStopping after the decision in flight (Ctrl+C again exits at once).");
    table.end("stopped with Ctrl+C", "operator");
  };
  if (!ink) process.on("SIGINT", interrupted);
  const players: PlayerAgent[] = party.ai.map((handle) =>
    flags.players === "scripted" ? new ScriptedPlayer(handle) : new ModelPlayer({ handle, card: party.cards.get(handle)!, choice: playerChoice, language, withHuman: Boolean(party.human), usage }),
  );
  const fights = Object.fromEntries(pack.adventure.scenes.flatMap((s) => (s.encounters[0] ? [[s.id, s.encounters[0].encounter]] : [])));
  // A scripted whole-adventure run walks every scene (AGT-39); a scene run ends after its first fight.
  const scripted = () =>
    play.allScenes
      ? chainDm(chainScenes(pack.adventure.scenes), everyone, everyone[0])
      : walkOnDm(pack.adventure.scenes.map((s) => s.id), fights, everyone);
  const dm: DmAgent = flags.dm === "scripted" ? scripted() : modelDm(usage);

  // The time limit runs from the first scene's load; the loop stops between decisions, so a wake in
  // flight finishes or times out first.
  let firstLoad: number | undefined;
  let deadline: NodeJS.Timeout | undefined;
  const progress = (p: Progress) => {
    if (firstLoad === undefined) {
      firstLoad = Date.now();
      const limit = flags["time-limit-min"];
      // The table keeps the first reason, so the quit that frees a waiting prompt doesn't replace it.
      const stop = () => {
        table.end(`the ${limit}-minute time limit`, "time_limit");
        ink?.stopAsking(`the ${limit}-minute time limit`);
      };
      if (limit > 0) deadline = setTimeout(stop, limit * 60_000);
    }
    // The terminal shows the progress only when nobody plays in it.
    if (ink) return;
    const runLines = transcript.records.filter((r) => r.channel === "run");
    const counts = `retries ${runLines.filter((r) => r.kind === "retry").length}, fallbacks ${runLines.filter((r) => r.kind === "fallback").length}`;
    const at = `[${((Date.now() - firstLoad) / 60_000).toFixed(1).padStart(5)} min]`;
    const what = p.kind === "scene_start" ? `${p.scene} starts` : p.kind === "scene_end" ? `${p.scene} ends after ${p.rounds} combat rounds` : `fight over in ${p.scene}: ${p.text}`;
    console.log(`${at} ${what}; ${counts}`);
  };
  const caffeinate = keepAwake();
  const loop = new TableLoop({
    table,
    dm,
    players,
    onScene: plan.onScene,
    maxSteps: flags["max-steps"],
    // The situation panel (AGT-36) is drawn only at the terminal.
    situation: ink !== undefined,
    names: party.names,
    stallRounds: flags["stall-rounds"],
    onProgress: progress,
  });

  const who = (kind: string | undefined, choice: { model: string; effort: string }) => (kind === "scripted" ? "scripted" : `${choice.model} (${choice.effort})`);
  console.log(
    `Playing ${played.join(", ")} of ${pack.adventure.title} (seed ${engine.seed}${settings.profile ? `, profile ${settings.profile.name}` : ""}): DM ${who(flags.dm, dmChoice)}, ${party.ai.join(", ")} ${who(flags.players, playerChoice)}, ${party.human ? `${party.human} ${ink ? "played by you" : "scripted"}` : "no human"}. Run folder ${path.relative(process.cwd(), runDir)}/.`,
  );
  ink?.busy(undefined);
  let run: RunReport | undefined;
  let failure: unknown;
  try {
    run = await loop.run(plan.first, carried);
  } catch (error) {
    failure = error;
  }
  clearTimeout(deadline);
  caffeinate?.kill();
  process.off("SIGINT", interrupted);
  ink?.stop();
  const end = await endState(engine).catch(() => []);
  engine.close();

  record.ended_at = new Date().toISOString();
  record.ended = run?.ended ?? (failure instanceof Error ? `the run failed: ${failure.message}` : String(failure));
  record.stop = run?.stop ?? table.stop ?? (failure ? "crash" : null);
  record.scenes = (run?.sceneTimes ?? []).map((s) => ({ ...s, target_minutes: targets.get(s.id) ?? null }));
  writeRunRecord(runDir, record);

  // The post-run stages (design §3.3): each reads the folder and writes its own file.
  const checked = flags["no-audit"] ? undefined : audit(flags.pack, runDir);
  if (checked) writeFileSync(path.join(runDir, AUDIT_JSON), JSON.stringify(checked, null, 2) + "\n");
  // The narration check (AGT-9): a run with a scripted DM has nothing a model judge should read.
  const narration = flags["no-audit"] ? undefined : await narrationCheck(flags.pack, runDir, flags.dm === "model" ? new ModelJudge() : new ScriptedJudge());

  const report = [
    `# ${play.command} run, ${new Date().toISOString()}`,
    "",
    `- Scenes: ${played.join(", ")} of ${pack.adventure.title} (${path.relative(REPO, path.resolve(flags.pack))}), seed ${engine.seed}`,
    `- Settings: ${settings.profile ? `profile ${settings.profile.name}; ` : ""}build ${record.build.table_commit.slice(0, 7)}${record.build.dirty ? " with local changes" : ""}, engine ${record.build.engine_rev.slice(0, 7)}, contract ${record.build.contract}`,
    `- Played: ${run?.scenes.join(", ") || "none"}${run && run.passedOver.length > 0 ? `; passed over: ${run.passedOver.join(", ")}` : ""}`,
    `- DM: ${who(flags.dm, dmChoice)}${flags.dm === "model" ? `, craft guidance in the ${craft === "prompt" ? "system prompt" : "skills"}` : ""}`,
    ...(language === "en" ? [] : [`- Language of the DM's and the AI players' lines: ${language}`]),
    `- AI players: ${party.ai.join(", ")}, ${who(flags.players, playerChoice)}; ${party.human ? `${party.human} ${ink ? "played in the terminal UI" : "on a scripted seat"}` : "no human at the table"}`,
    ...(ink ? [`- Your decisions the engine refused: ${run?.humanRejections ?? "n/a"}`] : []),
    ...reportSections({ run, failure, transcript: transcript.records, usage: usage.records, endState: end, audit: checked }),
    ...(narration ? ["", ...narration.lines] : []),
    "",
    ...timingLines(record),
    "",
    "Narration:",
    ...transcript.records.filter((r) => r.speaker === "dm" && r.kind === "narration").map((r) => `> ${r.text}`),
  ].join("\n");
  writeFileSync(path.join(runDir, "report.md"), report + "\n");
  const verdict = writeVerdict(runDir);
  const folder = path.relative(process.cwd(), runDir);
  const name = path.basename(runDir);
  const written = `Written to ${folder}/. Send report.md back to the thread, or the whole folder zipped: (cd ${JSON.stringify(path.dirname(folder))} && zip -qr ${name}.zip ${name})`;
  const verdictLine = `Verdict: ${verdict.verdict}: ${verdict.why}`;
  // The report is the DM's view (monster Hit Points, lines said to AI players only), so the terminal
  // you just played in shows only how the run ended; the rest stays in the run folder.
  console.log(ink ? `\nThe run is over: ${record.ended}. ${verdictLine}\n${written}` : `\n${[...verdictBlock(verdict).slice(1, -1), "", report].join("\n")}\n\n${written}`);
  // Last, so a slow or failed push never holds back the record or the verdict.
  for (const line of uploadStage(runDir, flags)) console.log(line);
  process.exitCode = failure || (checked && !checked.passed) ? 1 : 0;
}

/** On macOS, keeps the Mac awake for exactly the run's life (`caffeinate -i -w <pid>`). */
function keepAwake(): ChildProcess | undefined {
  if (process.platform !== "darwin") return undefined;
  const child = spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
  return child;
}
