// The turn loop (M6 spec §3.3, TASKS.md AGT-3) and its retry and fallback model (§6, AGT-11). Plain,
// deterministic TypeScript, not an agent: after every engine response it reads `awaiting` and
// decides who is woken next. Agents act only through their bound tools and the human only through
// the seat; every number the human picks becomes a complete command with no model call (D5).
import { EngineStopped, type Event, type Handle, type State } from "@nat20-table/engine-client";
import { ConnectionLost, ModelOffline, TurnTimeout, UsageLimitReached } from "../errors.ts";
import { eventLine, formatOptions, formatSheet, formatState, reactingTo, tellable, type LegalActionsResult } from "../view.ts";
import { buildChoices, choiceLines, type Choice, type ChoiceAct } from "./choices.ts";
import { handAnswer, handOff, namedIn, speakingOrder, type Address, type Hand, type HandedOff } from "./floor.ts";
import { doerAfter, mayReact, triggerIn, type TriggerKind } from "./reactions.ts";
import { situationOf } from "./situation.ts";
import type { TableState } from "./state.ts";
import { BarkTools, DmTools, HandTools, movedText, PlayerTools, ReactionFloor, send } from "./tools.ts";
import type { DmAgent, DmWake, FallbackCause, HumanPrompt, PlayerAgent, PlayerIntent, PlayerWake, StopKind, ToolOutcome } from "./types.ts";

/**
 * What the run does with a scene the DM loads: play it, end the run before it, or pass over it, so
 * `skipTo` loads in its place with the party the DM named (the exit run plays Scene 1 and Scene 3,
 * not Scene 2).
 */
export type SceneChoice = "continue" | "stop" | { skipTo: string };

export interface LoopOptions {
  table: TableState;
  dm: DmAgent;
  players: PlayerAgent[];
  /**
   * Called with every scene the DM loads and every scene that loads, the first one included, and the
   * scenes played so far. Default: play every scene.
   */
  onScene?: (sceneId: string, played: readonly string[]) => SceneChoice;
  /**
   * The run's last scene: the DM may end the adventure only once it has loaded, unless the whole
   * party is down (the first M7 run ended in Scene 5 and never played the wrap-up). None by default.
   */
  finale?: string;
  /** Scenes that offer a Short Rest (the skeleton's `rest`): leaving one unrested reminds the DM once. None by default. */
  rests?: string[];
  /** Loop steps before the run is stopped: a safety net for scripted runs. Default 5000. */
  maxSteps?: number;
  /**
   * Sends the human's seat a `situation` before each decision and with each set of options, for
   * the terminal's situation panel (AGT-36). Off for seats that draw no panel. Default false.
   */
  situation?: boolean;
  /**
   * What the table calls each AI player (`PackParty.names`): a line that names one gives it the
   * floor first (party talk §4.2). A player missing here is named by its handle.
   */
  names?: ReadonlyMap<Handle, readonly string[]>;
  /** How long another wake of a player waits for its reaction in flight before cancelling it. Default `REACTION_GRACE_MS`. */
  reactionGraceMs?: number;
  /** How long a reaction may take before it is cancelled. Default `BARK_TIMEOUT_MS`. */
  barkTimeoutMs?: number;
  /**
   * Explore rounds in a row with no engine event before the run stops as `stalled` (M7 design §3.1):
   * the DM never moved the story on. Default 0: no stall stop.
   */
  stallRounds?: number;
  /** Told each time a scene starts or ends and each time a fight ends: the unattended run's progress lines. */
  onProgress?: (progress: Progress) => void;
}

/** A moment the unattended run prints a line for (M7 design §3.1). */
export type Progress =
  | { kind: "scene_start"; scene: string }
  | { kind: "scene_end"; scene: string; rounds: number }
  | { kind: "fight_end"; scene: string; text: string };

/** One scene as the run played it, for `run.json` (M7 spec §4.1). */
export interface SceneTime {
  id: string;
  started_at: string;
  /** Absent for the scene the run ended in before it was left. */
  ended_at?: string;
  /** Combat rounds fought in it. */
  rounds: number;
}

/** One trigger in a fight and the reactions it woke, for the report (party talk §5 R1, AGT-34). */
export interface FightReaction {
  trigger: TriggerKind;
  /** The combat round it happened in. */
  round: number;
  /** The AI players woken to react, all at once. */
  woke: Handle[];
  /** The one whose line was heard, and how long after the wakes began. */
  spoke?: Handle;
  line_ms?: number;
  /** Who passed or said nothing; who spoke too late, or was cancelled once a line was heard; who was cancelled by its own next wake or a timeout. */
  passed: Handle[];
  beaten: Handle[];
  cut: Handle[];
}

/** One talk round out of combat, for the report (party talk §2, §7). */
export interface TalkRound {
  /** The AI players the human's line named or the DM's narration spoke to, who had the floor first. */
  named: Handle[];
  /** What each other AI player answered its hand wake with: `unread` for an answer that isn't one of the four, or a failed wake. */
  hands: Partial<Record<Handle, Hand["kind"]>>;
  /** Floor wakes in the round: the named players', the speakers' and the hand-off's. Retries of a refused declaration don't count. */
  floor_wakes: number;
  /**
   * Named players and raised hands that never got the floor. Every one of them speaks in its round
   * (decision 0049), so only a table that ended mid-round leaves any: the report keeps the count as a guard.
   */
  lapsed: Handle[];
  /** The AI player a line spoken to it gave the floor next, the round's one hand-off (party talk §4.4). */
  handed_to?: Handle;
  /** AI players spoken to after the round's hand-off and not answered in it: they have the floor first next round. */
  carried: Handle[];
  /** The AI players who spoke a line, who declared something, and who did neither. */
  spoke: Handle[];
  declared: Handle[];
  silent: Handle[];
  /** From the round's start to its first AI line on the human's screen; absent when nobody said or did anything. */
  first_line_ms?: number;
  /** From the round's start to the last AI player's answer, before the DM's wake. */
  wall_ms: number;
}

/** How a run went, for the run report (spec §6, §11). */
export interface RunReport {
  ended: string;
  steps: number;
  /** The scenes played, in order. */
  scenes: string[];
  /** The scenes that loaded and were passed over, in order. */
  passedOver: string[];
  fallbacks: number;
  humanRejections: number;
  /**
   * Each AI player's combat turn as the table waited for it: from its first wake to the end of its
   * last, the nudge included (scope §6.4 measures a turn, not a model call).
   */
  playerTurns: Array<{ handle: Handle; wall_ms: number; wakes: number }>;
  /** Each talk round out of combat (party talk §7). */
  talkRounds: TalkRound[];
  /** Each fight trigger the AI players were woken to react to (party talk §5 R1). */
  reactions: FightReaction[];
  /** Combat rounds played, and the AI players' lines in them: on their turns and between them (party talk goal 4). */
  fight: { rounds: number; lines: number };
  /** Which stop ended the run early; absent when it ended in play (M7 design §3.1). */
  stop?: StopKind;
  /** Each scene played, with when it started and ended (M7 spec §4.1). */
  sceneTimes: SceneTime[];
}

/** Model wakes in a row that lost the connection before the run stops as `offline` (M7 design §3.1). */
export const OFFLINE_WAKES = 3;

/** How long another wake of a player waits for its reaction in flight (R1 spec §6). */
export const REACTION_GRACE_MS = 5_000;
/** A reaction slower than this has missed its moment (R1 spec §5). */
export const BARK_TIMEOUT_MS = 8_000;

/** The ask of a `bark` wake, after what just happened in the player's own view (R1 spec §5). */
const BARK_ASK = "Something just happened in the fight, and it isn't your turn. If you react aloud, say one short line with say; otherwise answer PASS. Call no other tool.";

/** What the nudge says when an AI player's turn is still open after its wake (spec §6). */
const NUDGE = "It is still your turn. Act with submit_decision or move, and call end_turn when you are done.";

/** Event kinds that are only bookkeeping: a part made of nothing else isn't narrated. */
const QUIET = new Set<Event["kind"]>(["turn_start", "turn_end", "round"]);

/** A wake that ended in a model error or timeout: the decision falls back (spec §6). */
const FAILED = Symbol("failed");

/** A plan limit, a lost network or a dead engine stops the run; nothing falls back (spec §6). */
function stopsTheRun(error: unknown): error is Error {
  return error instanceof UsageLimitReached || error instanceof EngineStopped || error instanceof ModelOffline;
}

/** Which stop an error that stops the run is (M7 design §3.1). */
function stopOf(error: Error): StopKind {
  return error instanceof UsageLimitReached ? "usage_limit" : error instanceof ModelOffline ? "offline" : "crash";
}

export class TableLoop {
  private readonly table: TableState;
  private readonly dm: DmAgent;
  private readonly agents = new Map<Handle, PlayerAgent>();
  private readonly tools = new Map<Handle, PlayerTools>();
  /** Each AI player's tools for a hand wake: they answer in text only (party talk §4.3). */
  private readonly handTools = new Map<Handle, HandTools>();
  private readonly names: ReadonlyMap<Handle, readonly string[]>;
  private readonly dmTools: DmTools;
  private readonly onScene: (sceneId: string, played: readonly string[]) => SceneChoice;
  private readonly maxSteps: number;
  private readonly situation: boolean;
  /** `/pause`: AI players aren't woken until `/pause` again (spec §3.4). */
  private paused = false;
  /** The model wakes in flight, oldest first, for the seat's loading indicator. */
  private readonly waitingOn: string[] = [];
  private readonly scenes: string[] = [];
  private readonly passed: string[] = [];
  /** Scenes passed over since the last one played: the DM hears of them when the next one opens. */
  private passedSince: string[] = [];
  /** The human's numbered list (`/options`), and the follow-up pick on screen inside it, if any. */
  private top: Choice[] = [];
  private shown: Choice[] = [];
  /** The human's last `legal_actions`, for the DM when it maps the human's words (D5). */
  private lastOptions: LegalActionsResult | undefined;
  /** DM events read but held back for the next DM wake (a fight's end, kept for `combat_over`). */
  private dmBacklog: Event[] = [];
  /** AI players' combat turns so far, for the report. */
  private readonly playerTurns: RunReport["playerTurns"] = [];
  /** Talk rounds so far, for the report; their count shifts the speakers' seat order (party talk §4.2.6). */
  private readonly talkRounds: TalkRound[] = [];
  /** AI players spoken to who didn't get the floor in the last talk round: they go first in the next one. */
  private carried: Handle[] = [];
  /** The AI players with a wake in flight that the loop waits on: never woken to react meanwhile. */
  private readonly busy = new Set<Handle>();
  /** Each AI player's reaction in flight (R1): `done` settles once it is over, `cut` cancels it. */
  private readonly barks = new Map<Handle, { done: Promise<void>; cut: () => void }>();
  private readonly reactionGraceMs: number;
  private readonly barkTimeoutMs: number;
  /** Fight triggers reacted to so far, for the report. */
  private readonly reactions: FightReaction[] = [];
  /** The fight, scene and round of the last trigger reacted to: at most one a round. */
  private reactedIn: string | undefined;
  /** Every fight, scene and combat round seen, for the report's count of fight rounds. */
  private readonly fightRounds = new Set<string>();
  /** Fights over so far: rounds count again from 1 in the next one. */
  private fightsOver = 0;
  /** Who last acted, as of the last look at the fight's events: a trigger's `by` (`doerAfter`). */
  private doer: Handle | undefined;
  private readonly stallRounds: number;
  /** Explore rounds in a row that changed nothing in the engine. */
  private quietRounds = 0;
  /** Explore rounds so far: the decision a human's refusal out of combat belongs to. */
  private exploreRounds = 0;
  /** Model wakes in a row that lost the connection. */
  private offlineWakes = 0;
  /** Why each seat's last wake failed, while it is the seat's last: a fallback's cause. */
  private readonly failedWake = new Map<string, "timeout" | "error">();
  /** Whether the DM's last wake failed (and its fallback is already recorded). */
  private dmWakeFailed = false;
  private readonly onProgress: (progress: Progress) => void;
  private readonly sceneTimes: SceneTime[] = [];

  constructor(options: LoopOptions) {
    this.table = options.table;
    this.dm = options.dm;
    for (const agent of options.players) {
      this.agents.set(agent.handle, agent);
      this.tools.set(agent.handle, new PlayerTools(agent.handle, this.table));
      this.handTools.set(agent.handle, new HandTools(agent.handle, this.table));
    }
    this.names = options.names ?? new Map();
    this.reactionGraceMs = options.reactionGraceMs ?? REACTION_GRACE_MS;
    this.barkTimeoutMs = options.barkTimeoutMs ?? BARK_TIMEOUT_MS;
    this.dmTools = new DmTools(this.table, {
      insteadOf: (sceneId) => {
        const choice = this.onScene(sceneId, this.scenes);
        return typeof choice === "object" ? choice.skipTo : undefined;
      },
      passedOver: (sceneId, next) => this.passedOver(sceneId, next),
      current: () => this.scenes.at(-1),
      ...(options.finale ? { finale: options.finale } : {}),
      ...(options.rests ? { rests: new Set(options.rests) } : {}),
    });
    this.onScene = options.onScene ?? (() => "continue");
    this.maxSteps = options.maxSteps ?? 5000;
    this.situation = options.situation ?? false;
    this.stallRounds = options.stallRounds ?? 0;
    this.onProgress = options.onProgress ?? (() => undefined);
  }

  /** Plays from `firstScene` until the adventure ends, the human quits, or the run is stopped. */
  async run(firstScene: string, party?: Handle[]): Promise<RunReport> {
    let steps = 0;
    let failure: unknown;
    try {
      const loaded = await this.dmTools.loadScene(firstScene, party);
      if (!loaded.ok) throw new Error(`the first scene didn't load: ${loaded.text}`);
      while (!this.table.ended) {
        if (++steps > this.maxSteps) {
          this.table.end(`stopped after ${this.maxSteps} steps`, "stalled");
          break;
        }
        await this.step();
      }
    } catch (error) {
      if (stopsTheRun(error)) this.table.end(error.message, stopOf(error));
      else {
        failure = error;
        this.table.end(`the loop failed: ${error instanceof Error ? error.message : String(error)}`, "crash");
      }
    }
    // A run that ended in play left its last scene; one a stop cut short didn't.
    if (!this.table.stop) this.endScene();
    // A reaction still in flight has nothing left to react to.
    await Promise.all([...this.barks.values()].map((bark) => (bark.cut(), bark.done)));
    const ended = this.table.ended ?? "ended";
    // A stopped engine leaves the run's record short, and the run says why it stopped. Any other
    // failure to write the record (a full disk, a folder it can't write) fails the run, once the
    // agents are closed: the audit needs that record.
    let unwritten: unknown;
    const writing = async (write: () => Promise<void>) => {
      try {
        await write();
      } catch (error) {
        if (!(error instanceof EngineStopped)) unwritten ??= error;
      }
    };
    // When the engine is gone, the lines it showed are already written.
    await writing(() => this.table.flush());
    this.table.log("system", `run ended: ${ended}`);
    this.table.show({ kind: "end", text: ended });
    // When the engine is gone, the run has its transcript and the engine's request log, not the
    // session log, so the audit can't run on it (spec §6: no resume).
    await writing(() => this.table.engine.writeLog());
    await Promise.allSettled([this.dm.close?.(), ...[...this.agents.values()].map((a) => a.close?.())]);
    if (failure) throw failure;
    if (unwritten) throw unwritten;
    return {
      ended,
      steps,
      scenes: [...this.scenes],
      passedOver: [...this.passed],
      fallbacks: this.table.fallbacks,
      humanRejections: this.table.humanRejections,
      playerTurns: [...this.playerTurns],
      talkRounds: [...this.talkRounds],
      reactions: [...this.reactions],
      fight: { rounds: this.fightRounds.size, lines: this.table.fightLines },
      ...(this.table.stop ? { stop: this.table.stop } : {}),
      // A scene a stop cut short keeps no end time, and counts the rounds it got to.
      sceneTimes: this.sceneTimes.map((t) => ({ ...t, ...(t.ended_at ? {} : { rounds: this.roundsIn(t.id) }) })),
    };
  }

  /** One decision: whatever the engine waits on next. */
  private async step(): Promise<void> {
    // A fight that ended or a scene that loaded changes the phase, whoever caused it. Handling one
    // can cause the next (the DM loads the next scene when a fight ends), so read until it's quiet.
    for (let events = await this.watch(); events.length > 0; events = await this.watch()) {
      for (const event of events) {
        if (this.table.ended) return;
        if (event.kind === "combat_over") await this.combatOver(event);
        if (event.kind === "scene_loaded") await this.sceneLoaded(event.scene_id);
      }
    }
    if (this.table.ended) return;
    await this.showSituation();
    const awaiting = this.table.awaiting;
    // A fight drops the requests the talk before it carried or left pending (party talk §4.4).
    if (this.table.inCombat) {
      this.carried = [];
      this.table.takeAddresses();
    }
    switch (awaiting.kind) {
      case "action":
        if (awaiting.actor === this.table.human) return this.humanTurn();
        if (this.agents.has(awaiting.actor)) return this.playerTurn(awaiting.actor);
        throw new Error(`the engine waits on ${awaiting.actor}, who has no seat at the table`);
      case "reaction":
        if (awaiting.actor === this.table.human) return this.humanReaction();
        if (this.agents.has(awaiting.actor)) return this.playerReaction(awaiting.actor);
        throw new Error(`the engine waits on a reaction from ${awaiting.actor}, who has no seat at the table`);
      case "no_session":
        throw new Error("the engine has no session");
      case "none":
      case "combat_over":
        return this.exploreRound();
    }
  }

  private watch(): Promise<Event[]> {
    return this.table.engine.newEvents("dm", "watch");
  }

  // --- Scenes -------------------------------------------------------------------------------------

  private async sceneLoaded(sceneId: string): Promise<void> {
    // A scene the run passes over never loads (`DmTools.loadScene` loads the next one instead).
    if (this.onScene(sceneId, this.scenes) !== "continue") {
      this.table.end(`the run stops before ${sceneId}`);
      return;
    }
    const first = this.scenes.length === 0;
    this.endScene();
    this.scenes.push(sceneId);
    this.sceneTimes.push({ id: sceneId, started_at: new Date().toISOString(), rounds: 0 });
    this.onProgress({ kind: "scene_start", scene: sceneId });
    this.table.log("system", `scene ${sceneId}`);
    if (!first) await this.closeScene();
    if (this.table.ended) return;
    const passed = this.passedSince;
    this.passedSince = [];
    await this.wakeDm(
      "scene_open",
      undefined,
      ...(passed.length > 0
        ? [
            `This run passes over ${passed.join(", ")}: the party went through on the way here, and nothing in it happened at the table. Bridge it in a sentence at most, without its checks or what they would find.`,
          ]
        : []),
      `Scene ${sceneId} is loaded. Open it for the table: what the characters see, and what they can obviously do.`,
    );
    await this.settle();
  }

  /** The combat rounds fought in a scene so far. */
  private roundsIn(sceneId: string): number {
    return [...this.fightRounds].filter((key) => key.split(":")[1] === sceneId).length;
  }

  /** The scene being played is over: its end time and its fight rounds, for `run.json`. */
  private endScene(): void {
    const scene = this.sceneTimes.at(-1);
    if (!scene || scene.ended_at) return;
    scene.ended_at = new Date().toISOString();
    scene.rounds = this.roundsIn(scene.id);
    this.onProgress({ kind: "scene_end", scene: scene.id, rounds: scene.rounds });
  }

  /**
   * The DM loaded a scene the run doesn't play, and `next` loaded in its place: the human hears so
   * now, the DM when `next` opens. The scene before is summed up then too.
   */
  private passedOver(sceneId: string, next: string): void {
    this.passed.push(sceneId);
    this.passedSince.push(sceneId);
    this.table.log("system", `scene ${sceneId} passed over; on to ${next}`);
    this.table.show({ kind: "info", title: "Passed over", text: `This run doesn't play ${sceneId}: the party goes on to ${next}.` });
  }

  /**
   * A scene ended: each agent sums it up in a few sentences of fiction and starts its next session
   * from that summary, so context stays bounded by one scene (AGT-6).
   */
  private async closeScene(): Promise<void> {
    if (this.paused) await this.waitWhilePaused();
    if (this.table.ended) return;
    const ask = "The scene is over. Sum it up for yourself in a few sentences of fiction: what happened, who you met, what you promised or suspect.";
    const players = [...this.agents.values()];
    const briefings: string[] = [];
    for (const agent of players) briefings.push(await this.playerBriefing(agent.handle, ask));
    this.table.collect();
    const summaries = await Promise.all(players.map((agent, i) => this.wakePlayer(agent, "summary", briefings[i])));
    await this.table.commit();
    for (const [i, agent] of players.entries()) {
      const summary = typeof summaries[i] === "string" ? summaries[i] : "";
      if (summary) this.table.transcript.add({ speaker: agent.handle, channel: `notes:${agent.handle}`, kind: "note", text: `summary: ${summary}` });
      await agent.newScene?.(summary);
    }
    const dmSummary = await this.wakeDm("summary", undefined, ask);
    if (typeof dmSummary === "string" && dmSummary) {
      this.table.transcript.add({ speaker: "dm", channel: "memory:dm", kind: "memory", text: `summary: ${dmSummary}` });
    }
    await this.dm.newScene?.(typeof dmSummary === "string" ? dmSummary : "");
  }

  // --- Combat -------------------------------------------------------------------------------------

  private isTurnOf(handle: Handle): boolean {
    const a = this.table.awaiting;
    return a.kind === "action" && a.actor === handle;
  }

  /**
   * Whether the turn `handle` had when the log stood at `since` is still running. The engine can
   * hand the same creature its next turn in the same response (everyone else is down or acts inside
   * the engine), so whose turn it is doesn't say whether the turn ended.
   */
  private async sameTurn(handle: Handle, since: number): Promise<boolean> {
    if (!this.isTurnOf(handle)) return false;
    if (this.table.engine.logHead === since) return true;
    const r = await this.table.engine.request("dm", { cmd: "events", since });
    const events = r.result?.cmd === "events" ? r.result.events : [];
    return !events.some((e) => e.kind === "turn_end" && e.actor === handle);
  }

  /** The human's combat turn: numbers act directly, words go to the DM to map (D5). */
  private async humanTurn(): Promise<void> {
    const human = this.human;
    await this.narrateNew();
    if (!this.isTurnOf(human)) return;
    this.table.show({ kind: "status", text: "Your turn: pick a number from the list, or say what you do." });
    const since = this.table.engine.logHead;
    await this.offerChoices(true);
    while (!this.table.ended && (await this.sameTurn(human, since))) {
      const intent = await this.ask(this.shown === this.top ? { kind: "combat_turn" } : { kind: "pick" });
      if (!intent) break;
      if (intent.kind === "option") {
        const picked = await this.pick(intent.number);
        if (picked === undefined) continue;
        const outcome = await this.humanAct(picked.act);
        if (!outcome.ok) await this.humanRejected(outcome);
        if (await this.sameTurn(human, since)) await this.offerChoices(true);
      } else if (intent.kind === "text") {
        await this.mapHumanWords(intent.text, since);
      } else {
        this.table.show({ kind: "info", title: "Nothing to react to", text: "Pick a number from the list, or say what you do." });
      }
    }
    await this.narrateNew(human);
  }

  /**
   * Resolves a number on the list on screen. A line that opens a follow-up pick shows it and
   * returns undefined; a number not on the list says so.
   */
  private async pick(number: number): Promise<{ act: ChoiceAct; label: string } | undefined> {
    const choice = this.shown.find((c) => c.number === number);
    if (!choice) {
      this.table.show({ kind: "info", title: "No such number", text: `There is no ${number} on the list. Type /options to see it again.` });
      return undefined;
    }
    if (choice.next) {
      this.shown = choice.next;
      this.table.show({ kind: "options", title: choice.label, lines: choiceLines(choice.next), choices: choice.next });
      return undefined;
    }
    this.shown = this.top;
    return choice.act ? { act: choice.act, label: choice.label } : undefined;
  }

  /** Sends what a number stands for, as the human's own viewer: its refusal is projected for them. */
  private async humanAct(act: ChoiceAct): Promise<ToolOutcome> {
    const human = this.human;
    const a = this.table.awaiting;
    const promptId = a.kind === "action" && a.actor === human ? a.prompt_id : undefined;
    const prompt = promptId ? { prompt_id: promptId } : {};
    // The human's own decisions have no retry budget (spec §6): only their count is kept.
    this.table.resetRetries(human);
    let outcome: ToolOutcome;
    switch (act.kind) {
      case "submit":
        outcome = await send(this.table, human, { cmd: "submit", actor: human, ...prompt, ...act.decision }, () => "accepted");
        break;
      case "move":
        outcome = await send(this.table, human, { cmd: "move", actor: human, ...prompt, to: act.to, partial: true }, movedText);
        break;
      case "dash_move": {
        // Two decisions on one number: the Dash takes this prompt, the walk the one it leaves.
        outcome = await send(this.table, human, { cmd: "submit", actor: human, ...prompt, option_id: "dash" }, () => "dashed");
        const next = this.table.awaiting;
        if (!outcome.ok || next.kind !== "action" || next.actor !== human) break;
        const walk = await send(this.table, human, { cmd: "move", actor: human, prompt_id: next.prompt_id, to: act.to, partial: true }, movedText);
        outcome = walk.ok ? { ...walk, text: `dashed, ${walk.text}` } : walk;
        break;
      }
      case "end_turn":
        if (!promptId) return { ok: false, text: "There is no turn to end." };
        outcome = await send(this.table, human, { cmd: "end_turn", actor: human, prompt_id: promptId }, () => "turn ended");
        break;
    }
    // The human sees their own action's lines at once. What follows their turn (the monsters'
    // turns, a fight's end) waits for the DM to narrate the turn first.
    await this.table.flush((e) => e.kind === "combat_over" || (e.kind === "turn_end" && e.actor === human));
    // The engine's line says only that the character moved: a walk that ran out of movement says so.
    const moved = outcome.ok ? (outcome.data as { cmd?: string; reached?: boolean } | undefined) : undefined;
    if (moved?.cmd === "move" && moved.reached === false) {
      this.table.show({ kind: "info", title: "Stopped short", text: `You ${outcome.text}.` });
    }
    return outcome;
  }

  private async humanRejected(outcome: ToolOutcome): Promise<void> {
    this.table.humanRejections += 1;
    const message = (outcome.data as { message?: string } | undefined)?.message ?? outcome.text;
    this.table.log("retry", `${this.human}'s choice was not accepted: ${message}`, this.human, { decision: this.humanDecision() });
    this.table.show({ kind: "info", title: "Not accepted", text: message });
  }

  /**
   * The decision the human is making now (M7 design §3.3): the engine's prompt in a fight, the
   * explore round out of one.
   */
  private humanDecision(): string {
    const a = this.table.awaiting;
    return a.kind === "action" || a.kind === "reaction" ? a.prompt_id : `explore:${this.exploreRounds}`;
  }

  /**
   * Why `seat`'s decision falls back (M7 design §3.3): its retries were spent on refusals (even if
   * the wake then failed too), its last wake failed, or it ended with nothing refused and nothing done.
   */
  private causeOf(seat: string): FallbackCause {
    return this.table.exhausted(seat) ? "retries" : (this.failedWake.get(seat) ?? "unanswered");
  }

  /** The human typed words on their combat turn: the DM maps them to the human's decisions (D5). */
  private async mapHumanWords(text: string, since: number): Promise<void> {
    const human = this.human;
    await this.table.declare(human, text);
    const acted = this.table.acted;
    const answered = this.table.dmToHuman;
    const narrated = this.table.narratedTo;
    const turnOver = (e: Event) => e.kind === "combat_over" || (e.kind === "turn_end" && e.actor === human);
    // The DM's narration in this wake is about this turn: what follows the turn (the monsters'
    // turns, a fight's end) waits for its own narration (spec §3.3 step 6).
    this.table.hold = turnOver;
    try {
      await this.wakeDm(
        "map_combat",
        undefined,
        `It is ${human}'s turn, and the human playing ${human} said what ${human} does (above).`,
        `Map it to ${human}'s options with legal_actions, submit, move and end_turn, then narrate only what the engine did. If it can't be done, or a move is refused, say so in narration.`,
        `${human}'s options:`,
        this.lastOptions ? formatOptions(this.lastOptions) : "(call legal_actions)",
      );
    } finally {
      this.table.hold = undefined;
    }
    await this.table.flush(turnOver);
    if (this.table.narratedTo !== narrated) {
      // What the DM's narration came after is told; the rest is narrated with the turn's end.
      const events = tellable(await this.table.engine.newEvents("dm", "brief"), this.table.deaths);
      this.dmBacklog = [...this.dmBacklog, ...events.filter((e) => e.seq > this.table.narratedTo)];
    }
    const still = await this.sameTurn(human, since);
    // Words the DM only answered (talk, a question back) are understood: the turn goes on. A wake
    // that failed is latency, not a refusal, and has its own fallback.
    if (this.table.acted === acted && this.table.dmToHuman === answered && still && !this.dmWakeFailed) {
      this.table.fallbacks += 1;
      this.table.log("fallback", `the DM didn't map ${human}'s words; back to the human`, "dm", { cause: "unmapped", decision: this.humanDecision() });
      this.table.show({ kind: "info", title: "Not understood", text: "I didn't get that; pick from /options." });
    }
    if (still) await this.offerChoices(true);
  }

  /** An AI player's combat turn: one wake, one nudge, then the fallback (spec §6). */
  private async playerTurn(handle: Handle): Promise<void> {
    await this.narrateNew();
    if (!this.isTurnOf(handle)) return;
    if (this.paused) return this.waitWhilePaused();
    const agent = this.agents.get(handle)!;
    const tools = this.tools.get(handle)!;
    this.table.resetRetries(handle);
    const options = await tools.legalActions();
    const briefing = await this.playerBriefing(handle, "It is your turn in the fight. Your options:", options.text, "Act with your tools, then call end_turn.");
    const since = this.table.engine.logHead;
    const started = performance.now();
    let wakes = 1;
    const woke = await this.wakePlayer(agent, "combat_turn", briefing);
    if (woke !== FAILED && this.table.retries(handle) < this.table.maxRetries && (await this.sameTurn(handle, since))) {
      this.table.retry(handle, `${handle} didn't end its turn; nudged`);
      wakes += 1;
      await this.wakePlayer(agent, "combat_turn", NUDGE);
    }
    this.playerTurns.push({ handle, wall_ms: Math.round(performance.now() - started), wakes });
    if (await this.sameTurn(handle, since)) await this.fallBack(handle, "end_turn");
    await this.narrateNew(handle);
  }

  /**
   * The human's reaction: a numbered choice. A reaction to a party member is declined without
   * asking, as for the AI seats: nobody stabs a friend in this demo, and every window is a stop in
   * play (TASKS.md ENG-22, spec decision D2).
   */
  private async humanReaction(): Promise<void> {
    const human = this.human;
    await this.table.flush();
    const a = this.table.awaiting;
    if (a.kind !== "reaction" || a.actor !== human) return;
    if (await this.declineReactionToAlly(human, false)) return;
    this.table.show({ kind: "reaction", summary: a.trigger.summary, options: a.options.map((o) => o.name) });
    let intent = await this.ask({ kind: "reaction" });
    // A number that isn't one of the reactions shown asks again: it never takes another one.
    while (intent?.kind === "option" && !a.options[intent.number - 1]) {
      const numbers = a.options.length <= 2 ? a.options.map((_, i) => i + 1).join(" or ") : `1 to ${a.options.length}`;
      this.table.show({ kind: "info", title: "No such reaction", text: `There is no reaction ${intent.number}. Answer y or n, or ${numbers}.` });
      intent = await this.ask({ kind: "reaction" });
    }
    if (!intent) return;
    const take = intent.kind === "reaction" ? intent.take : intent.kind === "option" || (intent.kind === "text" && /^\s*y/i.test(intent.text));
    const option = intent.kind === "option" ? a.options[intent.number - 1] : a.options[0];
    this.table.resetRetries(human);
    const outcome = await send(this.table, human, { cmd: "react", actor: human, prompt_id: a.prompt_id, choice: take && option ? option.choice : null }, () => "done");
    if (!outcome.ok) await this.humanRejected(outcome);
    // What follows (the rest of the monsters' turns) is shown with its narration, before the next turn.
  }

  /**
   * An AI player's reaction: one wake, then the fallback declines it (spec §6). A reaction to a
   * party member (an Opportunity Attack on an ally) is declined with no wake: the engine asks every
   * creature in reach, and no AI player attacks its friends (TASKS.md AGT-27).
   */
  private async playerReaction(handle: Handle): Promise<void> {
    if (this.paused) return this.waitWhilePaused();
    const a = this.table.awaiting;
    if (a.kind !== "reaction") return;
    if (await this.declineReactionToAlly(handle, true)) return;
    this.table.resetRetries(handle);
    const briefing = await this.playerBriefing(
      handle,
      `You may react now: ${a.trigger.summary}`,
      ...a.options.map((o) => `- ${o.choice}: ${o.name}`),
      "Call react with the choice number, or react with null to let it pass.",
    );
    await this.wakePlayer(this.agents.get(handle)!, "reaction", briefing);
    const still = this.table.awaiting;
    if (still.kind === "reaction" && still.prompt_id === a.prompt_id) await this.fallBack(handle, "decline");
  }

  /**
   * Declines `handle`'s pending reaction when it answers a party member; true if it did. A
   * reaction to the reactor's own action (Reckless Attack) counts as one only when `self` is set.
   */
  private async declineReactionToAlly(handle: Handle, self: boolean): Promise<boolean> {
    const a = this.table.awaiting;
    if (a.kind !== "reaction" || a.actor !== handle) return false;
    const about = reactingTo(a.trigger.summary);
    if (!about || !this.table.party.includes(about)) return false;
    if (about === handle && !self) return false;
    const response = await this.table.engine.request(handle, { cmd: "react", actor: handle, prompt_id: a.prompt_id, choice: null });
    this.table.observe(response);
    if (!response.ok) throw new Error(`declining ${handle}'s reaction to ${about} was refused: ${response.error?.message}`);
    return true;
  }

  /** The fallback never invents an action: it ends the turn or declines the reaction (spec §6). */
  private async fallBack(handle: Handle, what: "end_turn" | "decline"): Promise<void> {
    const a = this.table.awaiting;
    this.table.fallbacks += 1;
    this.table.log("fallback", what === "end_turn" ? `${handle}'s turn ends` : `${handle} lets the reaction pass`, handle, { cause: this.causeOf(handle) });
    const response =
      what === "end_turn" && a.kind === "action" && a.actor === handle
        ? await this.table.engine.request(handle, { cmd: "end_turn", actor: handle, prompt_id: a.prompt_id })
        : what === "decline" && a.kind === "reaction" && a.actor === handle
          ? await this.table.engine.request(handle, { cmd: "react", actor: handle, prompt_id: a.prompt_id, choice: null })
          : undefined;
    if (!response) return;
    this.table.observe(response);
    if (!response.ok) throw new Error(`the fallback for ${handle} was refused: ${response.error?.message}`);
  }

  /**
   * The human answers the DM's surrender offer (AGT-30): accept it, and the table ends the fight
   * with no model call; fight on, and the offer closes. Words go to the DM, which may accept the
   * surrender for them or answer in fiction, and the offer stays open until it is answered.
   */
  private async answerSurrender(): Promise<void> {
    const human = this.human;
    while (this.table.surrender && !this.table.ended) {
      const { handles } = this.table.surrender;
      if (!this.table.inCombat) {
        this.table.surrender = undefined;
        return;
      }
      await this.table.flush();
      const choices: Choice[] = [
        { number: 1, label: `Accept the surrender of ${handles.join(", ")}` },
        { number: 2, label: "Fight on" },
      ];
      this.table.show({ kind: "options", title: "Surrender", lines: choiceLines(choices), choices });
      const intent = await this.ask({ kind: "surrender" });
      if (!intent) return;
      if (intent.kind === "option" && (intent.number === 1 || intent.number === 2)) {
        this.table.surrender = undefined;
        if (intent.number === 2) {
          this.table.log("system", `${human} fights on`, human);
          this.table.tellDm(`${human} refused the surrender of ${handles.join(", ")}: the fight goes on. Narrate the refusal with what happens next.`);
          return;
        }
        this.table.log("system", `${human} accepts the surrender of ${handles.join(", ")}`, human);
        const outcome = await send(this.table, "dm", { cmd: "end_combat", reason: "surrender" }, () => "the fight ended (surrender)");
        if (!outcome.ok) await this.humanRejected(outcome);
        return;
      }
      if (intent.kind !== "text") {
        this.table.show({ kind: "info", title: "Surrender", text: "Pick 1 or 2, or say what you do." });
        continue;
      }
      await this.table.declare(human, intent.text);
      this.table.surrender.words = true;
      try {
        await this.wakeDmOnce(
          "surrender_words",
          undefined,
          `You offered ${human} the surrender of ${handles.join(", ")}, and the human playing ${human} answered in words (above).`,
          `If they accept it, call end_combat with surrender. Otherwise answer in fiction with narrate: the offer stays open until ${human} accepts it or fights on.`,
        );
      } finally {
        if (this.table.surrender) this.table.surrender.words = false;
      }
    }
  }

  /** The fight is over: the DM wraps it up, and the loop is back in explore mode (spec §3.3 step 7). */
  private async combatOver(event: Event): Promise<void> {
    // Its last blow or a surrender gets its reactions too (party talk R1).
    await this.startReactions();
    this.onProgress({ kind: "fight_end", scene: this.scenes.at(-1) ?? "", text: event.text });
    await this.wakeDm("combat_over", undefined, `The fight is over: ${event.text}`, "Narrate how it ends, then go on with the scene.");
    await this.table.flush();
  }

  /**
   * The DM narrates what happened since it last narrated (spec §3.3 step 6): after a PC's turn,
   * that turn first and then the monsters' turns that followed it, each part on its own, with the
   * human shown each part's engine lines just before its narration. A fight's end is kept for the
   * `combat_over` wake.
   */
  private async narrateNew(pc?: Handle): Promise<void> {
    await this.startReactions();
    let events = [...this.dmBacklog, ...tellable(await this.table.engine.newEvents("dm", "brief"), this.table.deaths)];
    this.dmBacklog = [];
    const over = events.findIndex((e) => e.kind === "combat_over");
    if (over >= 0) {
      this.dmBacklog = events.slice(over);
      events = events.slice(0, over);
    }
    // A turn stopped at a reaction window (a walk passing an ally's reach) hasn't done what it set
    // out to do yet, so its lines so far can't be narrated without guessing (AGT-53). They wait
    // for the window to close; the turns that ended before it are narrated now.
    if (this.table.awaiting.kind === "reaction") {
      const ended = events.map((e) => e.kind).lastIndexOf("turn_end") + 1;
      this.dmBacklog = [...events.slice(ended), ...this.dmBacklog];
      events = events.slice(0, ended);
    }
    const cut = pc ? events.findIndex((e) => e.kind === "turn_end" && e.actor === pc) : -1;
    const parts = cut >= 0 ? [events.slice(0, cut + 1), events.slice(cut + 1)] : [events];
    for (const part of parts) {
      if (!part.some((e) => !QUIET.has(e.kind))) continue;
      // The next turn's opening lines show after the narration of what came before them.
      this.table.flushLimit = [...part].reverse().find((e) => e.kind !== "turn_start" && e.kind !== "round")!.seq;
      try {
        await this.wakeDm("narrate", part, "Narrate these events for the table in one to three sentences.");
        await this.table.flush();
      } finally {
        this.table.flushLimit = undefined;
      }
    }
    await this.table.flush();
  }

  // --- Explore and social mode -------------------------------------------------------------------

  /**
   * Shows the human what is left to see, unless a fight is running: then the lines wait for the DM
   * to narrate them, part by part, at the next turn (`narrateNew`).
   */
  private async settle(): Promise<void> {
    if (!this.table.inCombat) await this.table.flush();
  }

  /** One round out of combat (spec §3.3): the human, the AI players' declarations, the DM. */
  private async exploreRound(): Promise<void> {
    const human = this.table.human;
    this.exploreRounds += 1;
    const head = this.table.engine.logHead;
    if (human) await this.exploreRoundBody(human);
    else await this.aiRound();
    // Out of combat the engine logs no turn bookkeeping, so a round that left the log as it was
    // changed nothing: no check, move, rest, scene or fight (M7 design §3.1).
    this.quietRounds = this.table.engine.logHead === head ? this.quietRounds + 1 : 0;
    if (this.stallRounds > 0 && this.quietRounds >= this.stallRounds && !this.table.ended) {
      this.table.end(`stalled: ${this.quietRounds} explore rounds in a row changed nothing in the engine`, "stalled");
    }
  }

  /**
   * A round out of combat at a table with no human (M7 spec §4.2, AGT-40): it starts from the DM's
   * narration, so only the players the DM spoke to have the floor first; then the DM resolves it.
   */
  private async aiRound(): Promise<void> {
    await this.table.flush();
    await this.talkRound("");
    await this.wakeDm(
      "table_turn",
      undefined,
      "The table has spoken (above). Resolve it: call checks and moves, grant AI players their own options, or answer in fiction. Then narrate.",
    );
    await this.grantedActions();
    await this.settle();
  }

  private async exploreRoundBody(human: Handle): Promise<void> {
    await this.table.flush();
    this.top = this.shown = [];
    let line = "";
    for (;;) {
      const intent = await this.ask(this.table.question ? { kind: "answer" } : this.shown !== this.top ? { kind: "pick" } : { kind: "explore" });
      if (!intent) return;
      if (intent.kind === "text") {
        this.table.question = undefined;
        await this.table.declare(human, intent.text);
        line = intent.text;
        break;
      }
      if (intent.kind === "option") {
        if (this.top.length === 0) await this.offerChoices(false);
        const picked = await this.pick(intent.number);
        if (picked === undefined) continue;
        const outcome = await this.humanAct(picked.act);
        if (!outcome.ok) {
          await this.humanRejected(outcome);
          continue;
        }
        this.table.question = undefined;
        this.table.log("intent", `${human} picked: ${picked.label}`, human);
        this.table.tellDm(`${human} took an option: ${picked.label}`);
        line = picked.label;
        break;
      }
      this.table.show({ kind: "info", title: "Nothing to react to", text: "Say what you do, or type /options." });
    }
    if (!this.paused) await this.talkRound(line);
    await this.wakeDm(
      "table_turn",
      undefined,
      "The table has spoken (above). Resolve it: call checks and moves, grant AI players their own options, answer in fiction, or ask the human a question. Then narrate.",
    );
    await this.grantedActions();
    await this.settle();
  }

  /**
   * The AI players' part of a round out of combat (step 3; party talk §4.2, §4.3, decision 0039).
   * An AI player that `humanLine` names, or that the DM's narration since the last round speaks to,
   * has the floor first. Every other one answers a hand wake meanwhile: SPEAK, BOTH, ACT with what
   * it does without a word, or PASS. A silent act is declared once the hands are in, with no floor
   * wake. Then every raised hand has the floor, one at a time, each hearing what was said before
   * it: no hand lapses (decision 0049). A line spoken to a companion on the floor hands it the
   * floor next, once a round (§4.4, decision 0040). An address made after that hand-off opens the
   * next round.
   */
  private async talkRound(humanLine: string): Promise<void> {
    const started = performance.now();
    const handles = [...this.agents.keys()];
    // The DM's narration names the characters it tells about; only one it speaks to has the floor first.
    const narrations = this.table.takeNarrations().map((text) => ({ text, addressOnly: true }));
    // A table with no AI player has no talk round, and the report counts none.
    if (handles.length === 0) return;
    this.table.beginTalk();
    for (const handle of handles) this.table.resetRetries(handle);
    // An address made outside a floor wake (a granted action) or carried from the last round gives
    // its addressee the floor first, after the players the human and the DM named. Every one of
    // them has it, however many there are (decision 0049).
    const byName = namedIn([{ text: humanLine }, ...narrations], handles, this.names);
    const named = [...new Set([...byName, ...this.carried, ...handOff(this.table.takeAddresses(), [], handles, true).carried])];
    this.carried = [];
    const raising = handles.filter((h) => !named.includes(h));
    let floorWakes = 0;
    const hadFloor = new Set<Handle>();
    // Every hand wake's brief is built before any wake runs, so none depends on which model is faster.
    const asks: string[] = [];
    for (const handle of raising) {
      asks.push(await this.playerBriefing(handle, "Do you raise your hand? Answer SPEAK, BOTH, ACT: and what you do without a word, or PASS. Call no tool."));
    }
    // What the named players say to each other: a line to one who has the floor after the speaker
    // is answered there, so only a line to one who spoke before it can hand off.
    const namedAddresses: Address[] = [];
    const namedFirst = async () => {
      for (const [i, handle] of named.entries()) {
        if (this.table.ended) return;
        floorWakes += 1;
        const why = byName.includes(handle) ? "you were named" : "a companion spoke to you, and you haven't answered yet";
        hadFloor.add(handle);
        await this.takeFloor(handle, `You have the floor first: ${why}. Answer: say your line with say if you have one, and answer with what you set out to do in one sentence, or PASS.`);
        namedAddresses.push(...this.table.takeAddresses().filter((a) => named.indexOf(a.to) <= i));
      }
    };
    const [, answers] = await Promise.all([
      namedFirst(),
      Promise.all(raising.map((handle, i) => this.wakePlayer(this.agents.get(handle)!, "hand", asks[i], this.handTools.get(handle)))),
    ]);
    const hands = new Map<Handle, Hand>();
    for (const [i, handle] of raising.entries()) {
      const answer = answers[i];
      const hand: Hand = typeof answer === "string" ? handAnswer(answer) : { kind: "unread", text: answer === FAILED ? "(the wake failed)" : "" };
      hands.set(handle, hand);
      const said = hand.kind === "unread" ? hand.text : hand.kind === "act" ? [hand.intent, hand.why].filter(Boolean).join(" / ") : hand.why;
      this.table.logHand(handle, hand.kind.toUpperCase(), said);
    }
    for (const [handle, hand] of hands) {
      if (hand.kind === "act" && !this.table.ended) await this.declareFor(handle, hand.intent);
    }
    const carried: Handle[] = [];
    // Lines spoken to a companion on the floor may hand it the floor next (party talk §4.4).
    let queue = speakingOrder(hands, handles, this.talkRounds.length);
    let used = false;
    let pending: HandedOff | undefined;
    let handedWake: Handle | undefined;
    const heard = (addresses = this.table.takeAddresses()) => {
      const after = handOff(addresses, queue, handles, used);
      queue = after.queue;
      if (after.handedTo) {
        used = true;
        pending = after.handedTo;
      }
      for (const handle of after.carried) if (!carried.includes(handle)) carried.push(handle);
    };
    heard([...namedAddresses, ...this.table.takeAddresses()]);
    while (queue.length > 0 && !this.table.ended) {
      const handle = queue.shift()!;
      const handed = pending?.to === handle ? pending : undefined;
      if (handed) pending = undefined;
      floorWakes += 1;
      hadFloor.add(handle);
      if (handed) handedWake = handle;
      const why = !handed ? "you raised your hand" : `${handed.from} spoke to you${handed.raised ? ", and you raised your hand" : ""}`;
      await this.takeFloor(handle, `You have the floor: ${why}. Say your line with say if it still needs saying, and answer with what you set out to do in one sentence, or PASS.`);
      heard();
    }
    this.carried = carried;
    // Only a table that ended mid-round leaves a named player or a raised hand without the floor.
    const lapsed = [...named, ...speakingOrder(hands, handles, this.talkRounds.length)].filter((h) => !hadFloor.has(h));
    for (const handle of lapsed) this.table.log("hand", "lapsed: the table ended before its floor", handle);
    const { spoke, declared, firstLineMs } = this.table.talkSoFar();
    this.talkRounds.push({
      named,
      hands: Object.fromEntries([...hands].map(([handle, hand]) => [handle, hand.kind])),
      floor_wakes: floorWakes,
      lapsed,
      ...(handedWake ? { handed_to: handedWake } : {}),
      carried,
      spoke,
      declared,
      silent: handles.filter((h) => !spoke.includes(h) && !declared.includes(h)),
      ...(firstLineMs === undefined ? {} : { first_line_ms: firstLineMs }),
      wall_ms: Math.round(performance.now() - started),
    });
  }

  /** An AI player has the floor: one declare wake, its line heard at once, its intent declared. */
  private async takeFloor(handle: Handle, ask: string): Promise<void> {
    const declared = await this.wakePlayer(this.agents.get(handle)!, "declare", await this.playerBriefing(handle, ask));
    await this.declareFor(handle, declared);
  }

  /**
   * Declares what an AI player sets out to do. A refused declaration goes back to its player, who
   * declares again while it has retries (spec §6).
   */
  private async declareFor(handle: Handle, intent: string | void | typeof FAILED): Promise<void> {
    while (typeof intent === "string" && intent.trim() !== "" && !this.table.ended) {
      const outcome = await this.table.declare(handle, intent.trim());
      if (outcome.ok) return;
      if (!outcome.retryable) {
        this.table.fallbacks += 1;
        this.table.log("fallback", `${handle}'s declaration is dropped: ${outcome.text}`, handle, { cause: this.causeOf(handle) });
        return;
      }
      intent = await this.wakePlayer(
        this.agents.get(handle)!,
        "declare",
        await this.playerBriefing(handle, `Your declaration: ${outcome.text}`, "Declare again in one sentence, or PASS."),
      );
    }
    // A wake that spent its retries on refusals (its line, say) and then passed still fell back.
    if (!this.table.ended && this.table.exhausted(handle)) {
      this.table.fallbacks += 1;
      this.table.log("fallback", `${handle}'s declaration is dropped`, handle, { cause: "retries" });
    }
  }

  /** AI players the DM granted an action take it now, one after another (step 4). */
  private async grantedActions(): Promise<void> {
    let acted = false;
    for (const [handle, agent] of this.agents) {
      if (!this.table.grants.has(handle)) continue;
      if (this.paused) await this.waitWhilePaused();
      if (this.table.ended) return;
      this.table.resetRetries(handle);
      const options = await this.tools.get(handle)!.legalActions();
      const before = this.table.acted;
      const briefing = await this.playerBriefing(handle, "The DM lets you act now. Your options:", options.text, "Take one with submit_decision.");
      await this.wakePlayer(agent, "granted", briefing);
      if (this.table.grants.delete(handle)) {
        this.table.fallbacks += 1;
        this.table.log("fallback", `${handle} passes on the action it was granted`, handle, { cause: this.causeOf(handle) });
      }
      acted ||= this.table.acted > before;
    }
    if (acted) await this.wakeDm("narrate", undefined, "Narrate what the players just did, in one to three sentences.");
  }

  // --- The human seat ------------------------------------------------------------------------------

  /**
   * The human's character. Only the human's own paths read it (their turn, reaction, words, list and
   * commands), and a table with no human never takes them (M7 spec §4.2, AGT-40).
   */
  private get human(): Handle {
    const human = this.table.human;
    if (!human) throw new Error("this table has no human");
    return human;
  }

  private get seat(): NonNullable<TableState["seat"]> {
    const seat = this.table.seat;
    if (!seat) throw new Error("this table has no human seat");
    return seat;
  }

  /**
   * Asks the human, answering slash commands until something else comes back. Returns undefined
   * when the run ended meanwhile, or (for the paused prompt) when `/pause` was lifted.
   */
  private async ask(prompt: HumanPrompt): Promise<PlayerIntent | undefined> {
    for (;;) {
      if (this.table.ended) return undefined;
      const intent = await this.seat.ask(prompt);
      if (intent.kind === "text" || intent.kind === "option") {
        this.table.recordInput(this.human, JSON.stringify(intent), true);
      }
      if (intent.kind !== "command") return intent;
      await this.command(intent.name);
      if (prompt.kind === "paused" && !this.paused) return undefined;
    }
  }

  private async command(name: "sheet" | "where" | "options" | "log" | "pause" | "quit"): Promise<void> {
    const human = this.human;
    switch (name) {
      case "sheet": {
        const r = this.table.observe(await this.table.engine.request(human, { cmd: "get_sheet", actor: human }));
        this.table.show({ kind: "info", title: "Sheet", text: r.result?.cmd === "get_sheet" ? formatSheet(r.result.sheet) : (r.error?.message ?? "") });
        return;
      }
      case "where": {
        const state = await this.humanState();
        this.table.show({ kind: "info", title: "Where", text: state ? formatState(state) : "" });
        return;
      }
      case "options":
        if (this.isTurnOf(human)) {
          this.shown = this.top;
          this.table.show({ kind: "options", lines: choiceLines(this.top), choices: this.top });
        } else if (this.table.inCombat) {
          this.table.show({ kind: "info", title: "Options", text: "It isn't your turn." });
        } else {
          await this.offerChoices(false);
          this.table.show({ kind: "info", title: "Options", text: "Pick a number, or say what you do: the DM offers the rest." });
        }
        return;
      case "log":
        this.table.show({ kind: "info", title: "Log", text: this.table.recent.join("\n") });
        return;
      case "pause":
        this.paused = !this.paused;
        this.table.log("system", this.paused ? "paused" : "resumed", human);
        this.table.show({ kind: "status", text: this.paused ? "Paused: AI players wait until /pause again." : "Resumed." });
        return;
      case "quit":
        this.table.end("the human quit", "operator");
        return;
    }
  }

  /** While paused and an AI player is next, the table waits on the human (spec §3.4). */
  private async waitWhilePaused(): Promise<void> {
    this.table.show({ kind: "status", text: "Paused. Type /pause to go on." });
    while (this.paused && !this.table.ended) {
      const intent = await this.ask({ kind: "paused" });
      if (intent) this.table.show({ kind: "info", title: "Paused", text: "Only commands while paused; /pause goes on." });
    }
  }

  /**
   * The human's situation panel, from the human's own state (and, on their turn, their own options
   * for who is in reach). A failed read sends an empty situation: the panel shows its last as stale.
   */
  private async showSituation(state?: State, options?: LegalActionsResult): Promise<void> {
    if (!this.situation || this.table.ended || !this.table.human) return;
    const seen = state ?? (await this.humanState());
    const a = this.table.awaiting;
    const turn = a.kind === "action" ? a.actor : undefined;
    const situation = seen ? situationOf(seen, turn, turn === this.table.human ? options : undefined) : undefined;
    this.table.show({ kind: "situation", ...(situation ? { situation } : {}) });
  }

  private async humanState(): Promise<State | undefined> {
    const r = this.table.observe(await this.table.engine.request(this.human, { cmd: "get_state" }));
    return r.result?.cmd === "get_state" ? r.result.state : undefined;
  }

  /** Shows the human's numbered options: their own `legal_actions` and state, projected for them. */
  private async offerChoices(combat: boolean): Promise<void> {
    const human = this.human;
    const listed = this.table.observe(await this.table.engine.request(human, { cmd: "legal_actions", actor: human }));
    const state = combat || this.situation ? await this.humanState() : undefined;
    if (!listed.ok || listed.result?.cmd !== "legal_actions") {
      this.top = this.shown = [];
      this.table.show({ kind: "info", title: "Options", text: listed.error?.message ?? "No options now." });
      return;
    }
    this.lastOptions = listed.result as LegalActionsResult;
    this.top = this.shown = buildChoices(this.lastOptions, combat ? state : undefined, combat);
    if (state) await this.showSituation(state, this.lastOptions);
    const budget = this.lastOptions.budget ?? undefined;
    this.table.show({ kind: "options", lines: choiceLines(this.top), choices: this.top, ...(budget ? { budget } : {}) });
  }

  // --- Waking agents -------------------------------------------------------------------------------

  /** What an AI player hears before a wake: lines said to it, then events projected for it. */
  private async playerBriefing(handle: Handle, ...lines: string[]): Promise<string> {
    const heard = this.table.drainInbox(handle);
    const events = tellable(await this.table.engine.newEvents(handle), this.table.deaths);
    return [
      ...(heard.length > 0 ? ["What you heard:", ...heard] : []),
      ...(events.length > 0 ? ["What happened:", ...events.map(eventLine)] : []),
      ...lines,
    ].join("\n");
  }

  /**
   * Wakes an AI player, with its own tools unless `tools` says otherwise. A model error or timeout
   * makes the decision fall back; a plan limit stops the run.
   */
  private async wakePlayer(agent: PlayerAgent, wake: PlayerWake, briefing: string, tools?: PlayerTools): Promise<string | void | typeof FAILED> {
    this.busy.add(agent.handle);
    await this.quiet(agent.handle);
    this.table.recordInput(agent.handle, briefing);
    const done = this.waitFor(`${agent.handle} is thinking`);
    this.failedWake.delete(agent.handle);
    try {
      const answer = await agent.wake(wake, briefing, tools ?? this.tools.get(agent.handle)!);
      this.online();
      return answer;
    } catch (error) {
      if (stopsTheRun(error)) throw error;
      this.offline(error);
      this.failedWake.set(agent.handle, error instanceof TurnTimeout ? "timeout" : "error");
      const why = error instanceof TurnTimeout ? "timed out" : `failed: ${error instanceof Error ? error.message : String(error)}`;
      this.table.log("error", `${agent.handle} (${wake}) ${why}`, agent.handle);
      return FAILED;
    } finally {
      done();
      this.busy.delete(agent.handle);
    }
  }

  // --- Reactions in a fight (party talk §5 R1, TASKS.md AGT-34) -----------------------------------

  /**
   * On the most salient event since the last look (`triggerIn`), every AI player who may react gets
   * a `bark` wake at once, at most once a round (R1 spec D1 B). Nothing waits for them: the first line
   * is heard the moment it is ready, even before the DM narrates what it reacts to (D2 B), and the
   * other wakes are cancelled then.
   */
  private async startReactions(): Promise<void> {
    const events = await this.table.engine.newEvents("dm", "reactions");
    const doer = this.doer;
    this.doer = doerAfter(events, doer);
    for (const e of events) {
      if (e.kind === "combat_over") this.fightsOver += 1;
      else if (e.round !== null && e.round !== undefined) this.fightRounds.add(`${this.fightsOver}:${e.scene ?? ""}:${e.round}`);
    }
    // The fight running, or else the one this batch ended: a surrender, or the last foe down, ends
    // a fight in the same batch. What came before a fight ended belongs to that fight.
    const overs = events.flatMap((e, i) => (e.kind === "combat_over" ? [i] : []));
    const inRound = (e: Event) => e.round !== null && e.round !== undefined;
    let start = (overs.at(-1) ?? -1) + 1;
    let fight = events.slice(start);
    let fightIndex = this.fightsOver;
    if (!fight.some(inRound) && overs.length > 0) {
      start = (overs.at(-2) ?? -1) + 1;
      fight = events.slice(start, overs.at(-1));
      fightIndex -= 1;
    }
    if (this.table.ended || this.paused || !fight.some(inRound)) return;
    const reacting = [...this.agents.values()].filter((a) => a.reacts).map((a) => a.handle);
    if (reacting.length === 0) return;
    const r = this.table.observe(await this.table.engine.request("dm", { cmd: "get_state" }));
    const state = r.result?.cmd === "get_state" ? r.result.state : undefined;
    if (state?.view !== "dm") return;
    const party = state.creatures.filter((c) => c.side === "party").map((c) => c.handle);
    const trigger = triggerIn(fight, party, reacting, doerAfter(events.slice(0, start), doer));
    if (!trigger) return;
    const key = `${fightIndex}:${this.scenes.at(-1) ?? ""}:${trigger.round}`;
    if (this.reactedIn === key) return;
    const conscious = new Set(state.creatures.filter((c) => c.life_state === "conscious").map((c) => c.handle));
    const a = this.table.awaiting;
    const next = a.kind === "action" || a.kind === "reaction" ? a.actor : undefined;
    const who = mayReact(trigger, reacting, conscious, next).filter((h) => !this.barks.has(h) && !this.busy.has(h));
    if (who.length === 0) return;
    this.reactedIn = key;
    // Every brief first: once the first wake starts, a line can be heard at any await, and a wake
    // started after it would never be cut.
    const from = fight[0].seq;
    const briefs = new Map<Handle, string>();
    for (const handle of who) {
      const seen = tellable(await this.table.engine.newEvents(handle, `bark:${handle}`), this.table.deaths).filter((e) => e.seq >= from);
      briefs.set(handle, [...(seen.length > 0 ? ["What just happened:", ...seen.map(eventLine)] : []), BARK_ASK].join("\n"));
    }
    const record: FightReaction = { trigger: trigger.kind, round: trigger.round, woke: who, passed: [], beaten: [], cut: [] };
    this.reactions.push(record);
    this.table.log("system", `reactions to ${trigger.kind.replace("_", " ")}: ${who.join(", ")}`);
    const started = performance.now();
    const cuts = new Map<Handle, (why: "beaten" | "cut") => void>();
    const floor = new ReactionFloor((speaker) => {
      record.spoke = speaker;
      record.line_ms = Math.round(performance.now() - started);
      for (const [handle, cut] of cuts) if (handle !== speaker) cut("beaten");
    });
    const dones = who.map((handle) =>
      this.bark(handle, briefs.get(handle)!, new BarkTools(handle, this.table, floor), (cut) => cuts.set(handle, cut)).then((why) => {
        if (floor.speaker === handle) return;
        if (why === "beaten" || floor.late.has(handle)) record.beaten.push(handle);
        else if (why === "cut") record.cut.push(handle);
        else record.passed.push(handle);
      }),
    );
    void Promise.all(dones).then(() => {
      floor.closed = true;
    });
  }

  /**
   * One AI player's `bark` wake, in the background. It ends when the player answers, when another's
   * line is heard (`beaten`), or when its own next wake or the timeout cuts it (`cut`); then any line
   * of its own is refused.
   */
  private bark(handle: Handle, briefing: string, tools: BarkTools, onCut: (cut: (why: "beaten" | "cut") => void) => void): Promise<"beaten" | "cut" | undefined> {
    const agent = this.agents.get(handle)!;
    let why: "beaten" | "cut" | undefined;
    /** Once the wake is over, a cut does nothing: `agent.cancel` would end the player's next wake. */
    let over = false;
    let stop!: () => void;
    const stopped = new Promise<void>((resolve) => (stop = resolve));
    const cut = (reason: "beaten" | "cut") => {
      if (why || over) return;
      why = reason;
      tools.end();
      agent.cancel?.();
      stop();
    };
    onCut(cut);
    const timer = setTimeout(() => cut("cut"), this.barkTimeoutMs);
    this.table.recordInput(handle, briefing);
    const woke = agent.wake("bark", briefing, tools).catch((error) => {
      if (stopsTheRun(error)) this.table.end(error.message, stopOf(error));
      else if (!(error instanceof TurnTimeout)) this.table.log("error", `${handle} (bark) failed: ${error instanceof Error ? error.message : String(error)}`, handle);
    });
    const done = Promise.race([woke, stopped]).then(() => {
      over = true;
      clearTimeout(timer);
      tools.end();
      this.barks.delete(handle);
      return why;
    });
    this.barks.set(handle, { done: done.then(() => undefined), cut: () => cut("cut") });
    return done;
  }

  /**
   * Before any other wake of `handle`: its reaction in flight gets `reactionGraceMs` to finish, then
   * is cancelled (R1 spec §6), since a session runs one turn at a time.
   */
  private async quiet(handle: Handle): Promise<void> {
    const bark = this.barks.get(handle);
    if (!bark) return;
    let timer: NodeJS.Timeout | undefined;
    const grace = new Promise<void>((resolve) => (timer = setTimeout(resolve, this.reactionGraceMs)));
    await Promise.race([bark.done, grace]);
    clearTimeout(timer);
    bark.cut();
    await bark.done;
  }

  /**
   * Wakes the DM with what it heard, the events it hasn't been told (or `events`), and the ask. When
   * the wake fails or spends its retries, the engine lines stand alone (spec §6).
   */
  private async wakeDm(wake: DmWake, events: Event[] | undefined, ...lines: string[]): Promise<string | void> {
    const said = await this.wakeDmOnce(wake, events, ...lines);
    // A surrender the DM offered is answered at once, before anything else reaches the engine (AGT-30).
    if (this.table.surrender && !this.table.surrender.words && !this.table.ended) await this.answerSurrender();
    return said;
  }

  private async wakeDmOnce(wake: DmWake, events: Event[] | undefined, ...lines: string[]): Promise<string | void> {
    this.table.resetRetries("dm");
    this.dmWakeFailed = false;
    const heard = this.table.drainDmInbox();
    let told = events;
    if (!told) {
      told = [...this.dmBacklog, ...tellable(await this.table.engine.newEvents("dm", "brief"), this.table.deaths)];
      this.dmBacklog = [];
    }
    const briefing = [
      ...(heard.length > 0 ? ["What the table said:", ...heard] : []),
      ...(told.length > 0 ? ["What happened:", ...told.map(eventLine)] : []),
      ...lines,
    ].join("\n");
    const done = this.waitFor("The DM is thinking");
    try {
      const said = await this.dm.wake(wake, briefing, this.dmTools);
      this.online();
      if (this.table.exhausted("dm")) {
        this.table.fallbacks += 1;
        this.table.log("fallback", `the DM's retries ran out (${wake}); the engine lines stand alone`, "dm", { cause: "retries" });
      }
      return said;
    } catch (error) {
      if (stopsTheRun(error)) throw error;
      this.offline(error);
      const why = error instanceof TurnTimeout ? "timed out" : `failed: ${error instanceof Error ? error.message : String(error)}`;
      this.table.log("error", `dm (${wake}) ${why}`, "dm");
      this.table.fallbacks += 1;
      this.dmWakeFailed = true;
      const cause = this.table.exhausted("dm") ? "retries" : error instanceof TurnTimeout ? "timeout" : "error";
      this.table.log("fallback", `the DM's ${wake} is skipped; the engine lines stand alone`, "dm", { cause });
      return undefined;
    } finally {
      done();
    }
  }

  /** A model wake came back: the connection is there. */
  private online(): void {
    this.offlineWakes = 0;
  }

  /**
   * A model wake failed: one that lost the connection counts toward the `offline` stop, which the
   * next wake throws (M7 design §3.1). Any other failure says nothing about the network.
   */
  private offline(error: unknown): void {
    if (!(error instanceof ConnectionLost)) return;
    this.offlineWakes += 1;
    if (this.offlineWakes >= OFFLINE_WAKES) this.table.end(`${this.offlineWakes} model wakes in a row lost the connection to the API`, "offline");
  }

  /** Tells the seat a model wake started; the returned call says it ended. The newest one in flight is shown. */
  private waitFor(on: string): () => void {
    this.waitingOn.push(on);
    this.table.seat?.busy?.(on);
    return () => {
      this.waitingOn.splice(this.waitingOn.lastIndexOf(on), 1);
      this.table.seat?.busy?.(this.waitingOn.at(-1));
    };
  }
}
