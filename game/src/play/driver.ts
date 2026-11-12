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
// --stall-rounds N, --upload REPO, --no-upload, --zip (AGT-41), --no-preview (with --seat ink: hide the
// DM's narration as it is written, AGT-66; on by default since `npm run spike:partial` passed on the Mac),
// --roster NAME (API-45: play the party saved as `rosters/NAME.json` and save it again on every exit;
// --seat ink asks "continue or new party" first, and "play the last journey again" once the party
// has one), --new-party (start the pack's pregens instead), --replay-journey (API-51: play the saved
// party's last journey again from where it began, the start screen's third answer for a run nobody
// sits at),
// --rosters DIR, --suggest-model (AGT-49: the model that suggests the human's moves out of a fight
// at the terminal, Haiku by default), --no-suggest (no suggestions; `/suggest` toggles them in play).
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import { ModelDm, type CraftMode } from "../agents/dm.ts";
import type { Language } from "../agents/language.ts";
import { ModelPlayer } from "../agents/player.ts";
import { Suggester } from "../agents/suggest.ts";
import { sessionOptions } from "../agents/sdk-session.ts";
import { GameEngine, REPO } from "../engine.ts";
import { readCampaign } from "../pack/campaign.ts";
import { readPack } from "../pack/read.ts";
import { TableLoop, type Progress, type RunReport } from "../table/loop.ts";
import { chainDm, chainScenes, roadDm, ScriptedPlayer, ScriptedSeat, walkOnDm } from "../table/scripted.ts";
import { TableState } from "../table/state.ts";
import { Transcript } from "../table/transcript.ts";
import type { DmAgent, PlayerAgent, Seat, StopKind } from "../table/types.ts";
import type { Instance } from "ink";
import { InkSeat } from "../ui/ink-seat.ts";
import { glyphsFor } from "../ui/panel.ts";
import { pickOnScreen, savedCharacters } from "../ui/pick.ts";
import { usageBlock, UsageLog } from "../usage.ts";
import { ScriptedJudge } from "../check/judge.ts";
import { modelJudgeFor, narrationCheck } from "../check/narration.ts";
import { SUGGESTED_CARDS, wordReport } from "./word.ts";
import { checkout, RUN_FORMAT, writeRunRecord, type RunRecord } from "./record.ts";
import { readRoster, replayRoster, ROSTER_NAME, rosterLine, rosterRefusal, saveRoster, type SavedRoster } from "./roster.ts";
import { audit, castParty, endState, guards, partyRoster, refuseApiKey, reportSections, runFolder, scenePlan, startAt, suggestionLine, timingLines, type Casting, type PackParty } from "./run.ts";
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
  // A pack with a campaign file plays the living world (AGT-80): days on the map, not scenes in order.
  let campaign: ReturnType<typeof readCampaign>;
  try {
    campaign = readCampaign(flags.pack);
  } catch (error) {
    console.error(`--pack: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
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
  const modelDm = (usage?: UsageLog, preview?: (text: string | undefined) => void) =>
    new ModelDm({
      ...(preview ? { preview } : {}),
      pack,
      human: party.human,
      players: party.ai,
      choice: dmChoice,
      craft,
      language,
      usage,
      ...(flags["dm-timeout-ms"] !== undefined ? { turnTimeoutMs: flags["dm-timeout-ms"] } : {}),
      livingWorld: campaign !== undefined,
    });

  // The saved party (API-45): read before anything starts, so a bad name or file costs nothing.
  if (flags.roster !== undefined && !ROSTER_NAME.test(flags.roster)) {
    console.error(`--roster ${flags.roster}: a roster's name is lowercase letters, digits and dashes`);
    process.exit(2);
  }
  if (flags["new-party"] && flags.roster === undefined) {
    console.error("--new-party starts a saved party over: name it with --roster.");
    process.exit(2);
  }
  let saved: SavedRoster | undefined;
  try {
    saved = flags.roster === undefined ? undefined : readRoster(flags.rosters, flags.roster);
  } catch (error) {
    console.error(`--roster ${flags.roster}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  if (flags["replay-journey"] && (flags.roster === undefined || flags["new-party"])) {
    console.error("--replay-journey plays a saved party's last journey again: name it with --roster, without --new-party.");
    process.exit(2);
  }
  // A party saved by an older game can't be carried on (API-51): say so before anything starts.
  const refused = saved && !flags["new-party"] ? rosterRefusal(saved.roster) : undefined;
  if (refused) {
    console.error(`--roster ${flags.roster}: ${refused}`);
    process.exit(2);
  }
  const again = saved ? replayRoster(saved.roster) : undefined;
  if (flags["replay-journey"] && !again) {
    console.error(`--roster ${flags.roster}: this party has no journey to play again yet.`);
    process.exit(2);
  }
  let partyChoice: "continue" | "new" | "again" = saved && !flags["new-party"] ? (flags["replay-journey"] ? "again" : "continue") : "new";

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
  // Scripted players never move the caravan (AGT-80): on a campaign, the road needs model players or you at the keyboard.
  if (campaign && flags.players === "scripted" && flags.seat !== "ink") {
    console.error(`${flags.pack} is a campaign: scripted players never move the caravan, so play it with --players model or --seat ink.`);
    process.exit(2);
  }
  if (flags.seat === "ink" && !(process.stdin.isTTY && process.stdout.isTTY)) {
    console.error("--seat ink needs your keyboard and screen: run it in a terminal, not through a pipe or Remote Control.");
    process.exit(2);
  }
  // The pick screen opens the alternate screen the table then takes over (AGT-69); --play skips it.
  let screen: Instance | undefined;
  if (flags.seat === "ink" && !flags.play && party.human) {
    const entries = partyRoster(flags.pack);
    const ask = saved && partyChoice !== "new" ? saved : undefined;
    const picked = await pickOnScreen(entries, party.human, {
      title: pack.adventure.title,
      ...(ask
        ? {
            saved: {
              line: rosterLine(ask.roster, new Map(entries.map((e) => [e.handle, e.name]))),
              characters: savedCharacters(ask.roster.characters),
              ...(again ? { startCharacters: savedCharacters(again.characters) } : {}),
            },
          }
        : {}),
    });
    screen = picked.instance;
    if (picked.party) partyChoice = picked.party;
    if (picked.handle !== party.human) party = castParty(flags.pack, { play: picked.handle });
  }
  // Playing the last journey again loads the party and the world as they stood when it began; the
  // run still saves over the roster it named, and run.json says which answer it took.
  const loaded = partyChoice === "continue" ? saved : partyChoice === "again" && saved && again ? { ...saved, roster: again } : undefined;
  const everyone = [...(party.human ? [party.human] : []), ...party.ai];

  // You at the keyboard, or a seat that fights by rule. Ctrl+C ends the table between decisions
  // (before the table is set, it exits). The keyboard seat draws from here, so the engine's start
  // shows its loading indicator too.
  let quit: () => void = () => process.exit(130);
  const ink =
    flags.seat === "ink" && party.human
      ? new InkSeat(party.human, { onQuit: () => quit(), verbose: flags.verbose, glyphs: glyphsFor(process.env, party.glyphs), title: pack.adventure.title })
      : undefined;
  // Interactive even if CI is set in the shell: Ink would otherwise draw only the last frame. The
  // seat owns the alternate screen (AGT-69, decision 0054): the terminal comes back as it was when
  // it stops, and everything printed after that lands on the normal screen.
  if (ink && screen) ink.adopt(screen);
  else ink?.start({ interactive: true, alternateScreen: true });
  ink?.busy("The engine is starting");

  const runDir = runFolder(flags.out, play.folder);
  const usage = new UsageLog(path.join(runDir, "usage.jsonl"));
  // A failed start gives the terminal back before its error prints.
  const started = await (async () => {
    let engine: GameEngine | undefined;
    try {
      engine = await GameEngine.start({ pack: flags.pack, runDir, seed: flags.seed, ...(loaded ? { roster: loaded.roster } : {}) });
      // A campaign starts at its start place, with the party fresh in it; the loop starts the campaign.
      return { engine, carried: campaign ? undefined : await startAt(engine, flags.pack, plan.first, everyone) };
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
    ...(campaign ? { campaign: { start_day: campaign.startDay, day_limit: campaign.dayLimit ?? null } } : {}),
    scenes: [],
    started_at: new Date().toISOString(),
    ended_at: null,
    ended: null,
    stop: null,
    ...(flags.roster !== undefined
      ? { roster: { name: flags.roster, party: partyChoice, loaded_sha256: loaded?.sha256 ?? null, chain: loaded?.chain ?? null, saved_sha256: null, not_saved: null } }
      : {}),
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
    ...guards(flags.pack, engine, language),
  });
  // Who plays whom, in the transcript as in run.json (AGT-35).
  table.log("system", party.human ? `the human plays ${party.human}; AI players: ${party.ai.join(", ")}` : `no human; AI players: ${party.ai.join(", ")}`);
  if (record.roster) {
    const r = record.roster;
    table.log("system", loaded ? `the party saved as ${r.name}${partyChoice === "again" ? ", playing its last journey again from where it began" : ""}: ${rosterLine(loaded.roster)}${r.chain === "broken" ? "; its file was changed after its last save" : ""}` : `a new party, saved as ${r.name} when the run ends`);
  }
  quit = () => table.end("the human quit", "operator");
  // Without a keyboard seat, Ctrl+C stops the run between decisions; a second one exits at once.
  const interrupted = () => {
    if (table.ended) process.exit(130);
    console.log("\nStopping after the decision in flight (Ctrl+C again exits at once).");
    table.end("stopped with Ctrl+C", "operator");
  };
  if (!ink) process.on("SIGINT", interrupted);
  // A pack with a campaign file runs the living world: the AI players get the road tools (AGT-80).
  const livingWorld = campaign !== undefined;
  const players: PlayerAgent[] = party.ai.map((handle) =>
    flags.players === "scripted" ? new ScriptedPlayer(handle) : new ModelPlayer({ handle, card: party.cards.get(handle)!, characterClass: party.classes.get(handle)!, choice: playerChoice, language, withHuman: Boolean(party.human), ...(party.human ? { human: party.human } : {}), russianNames: party.russianNames, usage, livingWorld }),
  );
  const fights = Object.fromEntries(pack.adventure.scenes.flatMap((s) => (s.encounters[0] ? [[s.id, s.encounters[0].encounter]] : [])));
  // A scripted whole-adventure run walks every scene (AGT-39); a scene run ends after its first fight.
  const scripted = () =>
    // On the road the journey loads the scenes (AGT-80): the scripted DM narrates each wake in one line.
    campaign
      ? roadDm()
      : play.allScenes
      ? chainDm(chainScenes(pack.adventure.scenes), everyone, everyone[0])
      : walkOnDm(pack.adventure.scenes.map((s) => s.id), fights, everyone);
  // The narration preview (M10 S4) reaches the terminal seat only, unless --no-preview.
  const dm: DmAgent = flags.dm === "scripted" ? scripted() : modelDm(usage, ink && !flags["no-preview"] ? (text) => ink.preview(text) : undefined);

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
    // A seat shows the scene's number in its header, or on the road the place's name; the terminal prints progress only when nobody plays in it.
    if (ink) {
      if (p.kind === "scene_start" && campaign) ink.place(pack.adventure.scenes.find((s) => s.id === p.scene)?.title ?? p.scene);
      else if (p.kind === "scene_start") ink.scene(pack.adventure.scenes.findIndex((s) => s.id === p.scene) + 1, pack.adventure.scenes.length);
      return;
    }
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
    language,
    // A campaign goes wherever the road takes it, and ends on its own terms (AGT-80).
    ...(campaign ? {} : { onScene: plan.onScene }),
    // The adventure ends only after the run's last scene has loaded (or with the party down).
    ...(campaign ? {} : { finale: played.at(-1) }),
    // Leaving a scene that offers a Short Rest, unrested and hurt, reminds the DM once (AGT-46).
    rests: pack.adventure.scenes.filter((s) => s.rest).map((s) => s.id),
    // The creatures the DM may bring in beyond the scene files (AGT-24).
    statBlocks: pack.adventure.stat_blocks,
    maxSteps: flags["max-steps"],
    // The situation panel (AGT-36) is drawn only at the terminal.
    situation: ink !== undefined,
    names: party.names,
    stallRounds: flags["stall-rounds"],
    onProgress: progress,
    usage,
    // Three moves out of a fight for the human at the terminal (AGT-49), from a model only when the players are models.
    ...(ink && party.human && !flags["no-suggest"] && flags.players === "model"
      ? {
          suggester: new Suggester({
            handle: party.human,
            card: party.humanCard ?? "",
            language,
            choice: { model: flags["suggest-model"], effort: "low" },
            usage,
          }),
        }
      : {}),
    ...(campaign
      ? {
          campaign: {
            party: everyone,
            ...(campaign.dayLimit !== undefined ? { dayLimit: campaign.dayLimit } : {}),
            startDay: campaign.startDay,
            ...(record.roster ? { keepsParty: true } : {}),
            // The party is saved after every night too, so a crash loses at most one day (API-45).
            ...(record.roster
              ? {
                  onNight: async () => {
                    const r = record.roster!;
                    const saved = await saveRoster(engine, flags.rosters, r.name, record.run_id);
                    if ("sha256" in saved) table.log("system", `the party saved as ${r.name} after the night: ${saved.sha256.slice(0, 12)}`);
                    else table.log("error", `the party was not saved after the night: ${saved.not_saved}`);
                  },
                }
              : {}),
          },
        }
      : {}),
  });

  const who = (kind: string | undefined, choice: { model: string; effort: string }) => (kind === "scripted" ? "scripted" : `${choice.model} (${choice.effort})`);
  const playing = (text: string) => (ink ? ink.note(text) : console.log(text));
  playing(
    `Playing ${played.join(", ")} of ${pack.adventure.title} (seed ${engine.seed}${settings.profile ? `, profile ${settings.profile.name}` : ""}): DM ${who(flags.dm, dmChoice)}, ${party.ai.join(", ")} ${who(flags.players, playerChoice)}, ${party.human ? `${party.human} ${ink ? "played by you" : "scripted"}` : "no human"}. Run folder ${path.relative(process.cwd(), runDir)}/.`,
  );
  ink?.busy(undefined);
  let run: RunReport | undefined;
  let failure: unknown;
  try {
    run = await loop.run(campaign ? campaign.startScene : plan.first, carried);
  } catch (error) {
    failure = error;
  }
  clearTimeout(deadline);
  caffeinate?.kill();
  process.off("SIGINT", interrupted);
  // What the run cost, once at its end (M10 U1): printed once the terminal is back.
  const usageLines = ["Usage:", ...usageBlock(usage.records).map((l) => `  ${l}`)].join("\n");
  if (!ink) console.log(usageLines);
  const stop = run?.stop ?? table.stop ?? (failure ? "crash" : undefined);
  const endedText = run?.ended ?? (failure instanceof Error ? `the run failed: ${failure.message}` : String(failure));
  // The end screen (AGT-69 step 4): the table stays up while the post-run checks run, until they
  // finish or a key is pressed; the run's output then prints on the normal screen as before.
  const checks = [...(flags["no-audit"] ? [] : [CHECK_AUDIT, CHECK_NARRATION]), CHECK_REPORT, ...(flags["no-upload"] && !flags.zip ? [] : [CHECK_UPLOAD])];
  ink?.finish(endScreen(endedText, stop), checks);
  void ink?.left.then(() => ink.stop());
  // A breath for the screen to draw a step before work that blocks the event loop (the audit, the report, the upload).
  const breath = () => (ink ? new Promise((resolve) => setTimeout(resolve, 30)) : Promise.resolve());
  const checking = async <T>(name: string, work: () => T | Promise<T>): Promise<T> => {
    ink?.check(name, "running");
    await breath();
    try {
      const result = await work();
      ink?.check(name, "done");
      return result;
    } catch (error) {
      ink?.check(name, "failed");
      throw error;
    }
  };
  const end = await endState(engine).catch(() => []);
  // The party is saved on every exit (API-45): the end, the time limit, a quit, a stop. A crash
  // that took the engine down leaves the saved roster as it was.
  if (record.roster) {
    const result = await saveRoster(engine, flags.rosters, record.roster.name, record.run_id).catch((error: unknown) => ({
      not_saved: error instanceof Error ? error.message : String(error),
    }));
    if ("sha256" in result) record.roster.saved_sha256 = result.sha256;
    else record.roster.not_saved = result.not_saved;
  }
  engine.close();

  record.ended_at = new Date().toISOString();
  record.ended = run?.ended ?? (failure instanceof Error ? `the run failed: ${failure.message}` : String(failure));
  record.stop = run?.stop ?? table.stop ?? (failure ? "crash" : null);
  record.scenes = (run?.sceneTimes ?? []).map((s) => ({ ...s, target_minutes: targets.get(s.id) ?? null }));
  // The days the contract played on the world clock: a next contract starts later than its pack's day.
  if (record.campaign && run?.campaignDays) record.campaign = { start_day: run.campaignDays.start, day_limit: run.campaignDays.last };
  writeRunRecord(runDir, record);

  // The DM's suggested cards (AGT-91): their own file, which the report reads and nothing loads.
  if (run?.suggestedCards) writeFileSync(path.join(runDir, SUGGESTED_CARDS), JSON.stringify(run.suggestedCards, null, 2) + "\n");

  // The post-run stages (design §3.3): each reads the folder and writes its own file.
  const checked = flags["no-audit"] ? undefined : await checking(CHECK_AUDIT, () => audit(flags.pack, runDir));
  if (checked && !checked.passed) ink?.check(CHECK_AUDIT, "failed");
  if (checked) writeFileSync(path.join(runDir, AUDIT_JSON), JSON.stringify(checked, null, 2) + "\n");
  // The narration check (AGT-9): a run with a scripted DM has nothing a model judge should read.
  const narration = flags["no-audit"] ? undefined : await checking(CHECK_NARRATION, () => narrationCheck(flags.pack, runDir, flags.dm === "model" ? modelJudgeFor(runDir) : new ScriptedJudge()));
  ink?.check(CHECK_REPORT, "running");
  await breath();

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
    ...(run?.suggestions ? [`- ${suggestionLine(run.suggestions)}`] : []),
    ...(record.roster ? [`- ${rosterReport(record.roster)}`] : []),
    ...reportSections({ run, failure, transcript: transcript.records, usage: usage.records, endState: end, audit: checked }),
    ...wordReport(runDir),
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
  ink?.check(CHECK_REPORT, "done");
  // Last, so a slow or failed push never holds back the record or the verdict.
  const uploaded = flags["no-upload"] && !flags.zip ? [] : await checking(CHECK_UPLOAD, () => uploadStage(runDir, flags));
  if (ink) {
    ink.stop();
    console.log(usageLines);
  }
  // The report is the DM's view (monster Hit Points, lines said to AI players only), so the terminal
  // you just played in shows only how the run ended; the rest stays in the run folder.
  const kept = record.roster ? `\n${record.roster.saved_sha256 ? `Your party is saved as ${record.roster.name}: --roster ${record.roster.name} plays it again.` : `The party was not saved (${record.roster.not_saved}).`}` : "";
  console.log(ink ? `\nThe run is over: ${record.ended}. ${verdictLine}${kept}\n${written}` : `\n${[...verdictBlock(verdict).slice(1, -1), "", report].join("\n")}\n\n${written}`);
  for (const line of uploaded) console.log(line);
  process.exitCode = failure || (checked && !checked.passed) ? 1 : 0;
}

/** The report's line on the saved party. */
export function rosterReport(r: NonNullable<RunRecord["roster"]>): string {
  const loaded = `(sha256 ${r.loaded_sha256?.slice(0, 12)}${r.chain === "broken" ? ", changed after its last save" : r.chain === "unlogged" ? ", no save logged for it" : ""})`;
  const started =
    r.party === "continue"
      ? `continued the party saved as ${r.name} ${loaded}`
      : r.party === "again"
        ? `played the last journey of the party saved as ${r.name} again from where it began ${loaded}`
        : `a new party for the roster ${r.name}`;
  const ended = r.saved_sha256 ? `saved (sha256 ${r.saved_sha256.slice(0, 12)})` : `not saved: ${r.not_saved}`;
  return `Roster: ${started}; ${ended}`;
}

const CHECK_AUDIT = "Audit: every roll against the engine log";
const CHECK_NARRATION = "Narration check";
const CHECK_REPORT = "Report and verdict";
const CHECK_UPLOAD = "Upload";

/**
 * How the end screen says the run ended (screens 12 and 13): the end of the adventure, a quit and
 * the time limit read as an end; a crash, a stall, the subscription's limit and going offline as
 * a stop, with one line on what to do.
 */
export function endScreen(ended: string, stop: StopKind | null | undefined): { text: string; todo?: string } {
  switch (stop) {
    case "crash":
      return { text: `Stopped: ${ended}`, todo: "The run folder keeps everything so far: send engine-stderr.log and report.md back to the thread." };
    case "stalled":
      return { text: `Stopped: ${ended}`, todo: "The table stopped moving. The run folder keeps everything so far: send report.md back to the thread." };
    case "usage_limit":
      return { text: `Stopped: ${ended}`, todo: "The Claude subscription's limit is spent: run again after it resets." };
    case "offline":
      return { text: `Stopped: ${ended}`, todo: "Claude couldn't be reached: check the network and run again." };
    default:
      return { text: `The run is over: ${ended}` };
  }
}

/** On macOS, keeps the Mac awake for exactly the run's life (`caffeinate -i -w <pid>`). */
function keepAwake(): ChildProcess | undefined {
  if (process.platform !== "darwin") return undefined;
  const child = spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
  return child;
}
