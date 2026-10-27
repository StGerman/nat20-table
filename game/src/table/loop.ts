// The turn loop (M6 spec §3.3, TASKS.md AGT-3) and its retry and fallback model (§6, AGT-11). Plain,
// deterministic TypeScript, not an agent: after every engine response it reads `awaiting` and
// decides who is woken next. Agents act only through their bound tools and the human only through
// the seat; every number the human picks becomes a complete command with no model call (D5).
import { EngineStopped, type Event, type Handle, type State } from "@nat20-table/engine-client";
import { TurnTimeout, UsageLimitReached } from "../errors.ts";
import { eventLine, formatOptions, formatSheet, formatState, tellable, type LegalActionsResult } from "../view.ts";
import { buildChoices, choiceLines, type Choice, type ChoiceAct } from "./choices.ts";
import type { TableState } from "./state.ts";
import { DmTools, PlayerTools, send } from "./tools.ts";
import type { DmAgent, DmWake, HumanPrompt, PlayerAgent, PlayerIntent, PlayerWake, ToolOutcome } from "./types.ts";

export interface LoopOptions {
  table: TableState;
  dm: DmAgent;
  players: PlayerAgent[];
  /**
   * Called with every scene that loads, the first one included: go on, or end the run before it
   * (the exit run plays one scene and stops when the DM loads the next).
   */
  onScene?: (sceneId: string) => "continue" | "stop";
  /** Loop steps before the run is stopped: a safety net for scripted runs. Default 5000. */
  maxSteps?: number;
}

/** How a run went, for the run report (spec §6, §11). */
export interface RunReport {
  ended: string;
  steps: number;
  scenes: string[];
  fallbacks: number;
  humanRejections: number;
}

/** What the nudge says when an AI player's turn is still open after its wake (spec §6). */
const NUDGE = "It is still your turn. Act with submit_decision or move, and call end_turn when you are done.";

/** Event kinds that are only bookkeeping: a part made of nothing else isn't narrated. */
const QUIET = new Set<Event["kind"]>(["turn_start", "turn_end", "round"]);

/** A wake that ended in a model error or timeout: the decision falls back (spec §6). */
const FAILED = Symbol("failed");

/** A plan limit or a dead engine stops the run; nothing falls back (spec §6). */
function stopsTheRun(error: unknown): error is Error {
  return error instanceof UsageLimitReached || error instanceof EngineStopped;
}

export class TableLoop {
  private readonly table: TableState;
  private readonly dm: DmAgent;
  private readonly agents = new Map<Handle, PlayerAgent>();
  private readonly tools = new Map<Handle, PlayerTools>();
  private readonly dmTools: DmTools;
  private readonly onScene: (sceneId: string) => "continue" | "stop";
  private readonly maxSteps: number;
  /** `/pause`: AI players aren't woken until `/pause` again (spec §3.4). */
  private paused = false;
  private readonly scenes: string[] = [];
  /** The human's numbered list (`/options`), and the follow-up pick on screen inside it, if any. */
  private top: Choice[] = [];
  private shown: Choice[] = [];
  /** The human's last `legal_actions`, for the DM when it maps the human's words (D5). */
  private lastOptions: LegalActionsResult | undefined;
  /** DM events read but held back for the next DM wake (a fight's end, kept for `combat_over`). */
  private dmBacklog: Event[] = [];

  constructor(options: LoopOptions) {
    this.table = options.table;
    this.dm = options.dm;
    for (const agent of options.players) {
      this.agents.set(agent.handle, agent);
      this.tools.set(agent.handle, new PlayerTools(agent.handle, this.table));
    }
    this.dmTools = new DmTools(this.table);
    this.onScene = options.onScene ?? (() => "continue");
    this.maxSteps = options.maxSteps ?? 5000;
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
          this.table.end(`stopped after ${this.maxSteps} steps`);
          break;
        }
        await this.step();
      }
    } catch (error) {
      if (stopsTheRun(error)) this.table.end(error.message);
      else {
        failure = error;
        this.table.end(`the loop failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const ended = this.table.ended ?? "ended";
    try {
      await this.table.flush();
    } catch {
      // The engine is gone; the lines it showed are already written.
    }
    this.table.log("system", `run ended: ${ended}`);
    this.table.show({ kind: "end", text: ended });
    await Promise.allSettled([this.dm.close?.(), ...[...this.agents.values()].map((a) => a.close?.())]);
    if (failure) throw failure;
    return { ended, steps, scenes: [...this.scenes], fallbacks: this.table.fallbacks, humanRejections: this.table.humanRejections };
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
    const awaiting = this.table.awaiting;
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
    if (this.onScene(sceneId) === "stop") {
      this.table.end(`the run stops before ${sceneId}`);
      return;
    }
    const first = this.scenes.length === 0;
    this.scenes.push(sceneId);
    this.table.log("system", `scene ${sceneId}`);
    if (!first) await this.closeScene();
    await this.wakeDm("scene_open", undefined, `Scene ${sceneId} is loaded. Open it for the table: what the characters see, and what they can obviously do.`);
    await this.settle();
  }

  /**
   * A scene ended: each agent sums it up in a few sentences of fiction and starts its next session
   * from that summary, so context stays bounded by one scene (AGT-6).
   */
  private async closeScene(): Promise<void> {
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
    const human = this.table.human;
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
    const human = this.table.human;
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
        outcome = await send(this.table, human, { cmd: "move", actor: human, ...prompt, to: act.to }, () => "moved");
        break;
      case "end_turn":
        if (!promptId) return { ok: false, text: "There is no turn to end." };
        outcome = await send(this.table, human, { cmd: "end_turn", actor: human, prompt_id: promptId }, () => "turn ended");
        break;
    }
    // The human sees their own action's lines at once. What follows their turn (the monsters'
    // turns, a fight's end) waits for the DM to narrate the turn first.
    await this.table.flush((e) => e.kind === "combat_over" || (e.kind === "turn_end" && e.actor === human));
    return outcome;
  }

  private async humanRejected(outcome: ToolOutcome): Promise<void> {
    this.table.humanRejections += 1;
    const message = (outcome.data as { message?: string } | undefined)?.message ?? outcome.text;
    this.table.log("retry", `${this.table.human}'s choice was not accepted: ${message}`, this.table.human);
    this.table.show({ kind: "info", title: "Not accepted", text: message });
  }

  /** The human typed words on their combat turn: the DM maps them to the human's decisions (D5). */
  private async mapHumanWords(text: string, since: number): Promise<void> {
    const human = this.table.human;
    await this.table.declare(human, text);
    const acted = this.table.acted;
    await this.wakeDm(
      "map_combat",
      undefined,
      `It is ${human}'s turn, and the human playing ${human} said what ${human} does (above).`,
      `Map it to ${human}'s options with legal_actions, submit, move and end_turn, then narrate. If it can't be done, say so in narration.`,
      `${human}'s options:`,
      this.lastOptions ? formatOptions(this.lastOptions) : "(call legal_actions)",
    );
    await this.table.flush((e) => e.kind === "combat_over" || (e.kind === "turn_end" && e.actor === human));
    const still = await this.sameTurn(human, since);
    if (this.table.acted === acted && still) {
      this.table.fallbacks += 1;
      this.table.log("fallback", `the DM didn't map ${human}'s words; back to the human`, "dm");
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
    const woke = await this.wakePlayer(agent, "combat_turn", briefing);
    if (woke !== FAILED && this.table.retries(handle) < this.table.maxRetries && (await this.sameTurn(handle, since))) {
      this.table.retry(handle, `${handle} didn't end its turn; nudged`);
      await this.wakePlayer(agent, "combat_turn", NUDGE);
    }
    if (await this.sameTurn(handle, since)) await this.fallBack(handle, "end_turn");
    await this.narrateNew(handle);
  }

  private async humanReaction(): Promise<void> {
    const human = this.table.human;
    await this.table.flush();
    const a = this.table.awaiting;
    if (a.kind !== "reaction" || a.actor !== human) return;
    this.table.show({ kind: "reaction", summary: a.trigger.summary, options: a.options.map((o) => o.name) });
    const intent = await this.ask({ kind: "reaction" });
    if (!intent) return;
    const take = intent.kind === "reaction" ? intent.take : intent.kind === "option" || (intent.kind === "text" && /^\s*y/i.test(intent.text));
    const option = intent.kind === "option" ? a.options[intent.number - 1] ?? a.options[0] : a.options[0];
    this.table.resetRetries(human);
    const outcome = await send(this.table, human, { cmd: "react", actor: human, prompt_id: a.prompt_id, choice: take && option ? option.choice : null }, () => "done");
    if (!outcome.ok) await this.humanRejected(outcome);
    // What follows (the rest of the monsters' turns) is shown with its narration, before the next turn.
  }

  /** An AI player's reaction: one wake, then the fallback declines it (spec §6). */
  private async playerReaction(handle: Handle): Promise<void> {
    if (this.paused) return this.waitWhilePaused();
    const a = this.table.awaiting;
    if (a.kind !== "reaction") return;
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

  /** The fallback never invents an action: it ends the turn or declines the reaction (spec §6). */
  private async fallBack(handle: Handle, what: "end_turn" | "decline"): Promise<void> {
    const a = this.table.awaiting;
    this.table.fallbacks += 1;
    this.table.log("fallback", what === "end_turn" ? `${handle}'s turn ends` : `${handle} lets the reaction pass`, handle);
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

  /** The fight is over: the DM wraps it up, and the loop is back in explore mode (spec §3.3 step 7). */
  private async combatOver(event: Event): Promise<void> {
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
    let events = [...this.dmBacklog, ...tellable(await this.table.engine.newEvents("dm", "brief"))];
    this.dmBacklog = [];
    const over = events.findIndex((e) => e.kind === "combat_over");
    if (over >= 0) {
      this.dmBacklog = events.slice(over);
      events = events.slice(0, over);
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
    await this.table.flush();
    this.top = this.shown = [];
    for (;;) {
      const intent = await this.ask(this.table.question ? { kind: "answer" } : this.shown !== this.top ? { kind: "pick" } : { kind: "explore" });
      if (!intent) return;
      if (intent.kind === "text") {
        this.table.question = undefined;
        await this.table.declare(human, intent.text);
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
        break;
      }
      this.table.show({ kind: "info", title: "Nothing to react to", text: "Say what you do, or type /options." });
    }
    if (!this.paused) await this.declarations();
    await this.wakeDm(
      "table_turn",
      undefined,
      "The table has spoken (above). Resolve it: call checks and moves, grant AI players their own options, answer in fiction, or ask the human a question. Then narrate.",
    );
    await this.grantedActions();
    await this.settle();
  }

  /** Every AI player declares at most one thing, in parallel, heard in seat order (step 3). */
  private async declarations(): Promise<void> {
    const players = [...this.agents.values()];
    const briefings: string[] = [];
    for (const agent of players) {
      this.table.resetRetries(agent.handle);
      briefings.push(await this.playerBriefing(agent.handle, "Declare at most one thing your character does now: speak with say, and answer with what you set out to do in one sentence. Answer with nothing to pass."));
    }
    this.table.collect();
    const declared = await Promise.all(players.map((agent, i) => this.wakePlayer(agent, "declare", briefings[i])));
    await this.table.commit();
    for (const [i, agent] of players.entries()) {
      const intent = declared[i];
      if (typeof intent !== "string" || intent.trim() === "") continue;
      const outcome = await this.table.declare(agent.handle, intent.trim());
      if (!outcome.ok) {
        this.table.fallbacks += 1;
        this.table.log("fallback", `${agent.handle}'s declaration is dropped: ${outcome.text}`, agent.handle);
      }
    }
  }

  /** AI players the DM granted an action take it now, one after another (step 4). */
  private async grantedActions(): Promise<void> {
    let acted = false;
    for (const [handle, agent] of this.agents) {
      if (!this.table.grants.has(handle) || this.table.ended) continue;
      this.table.resetRetries(handle);
      const options = await this.tools.get(handle)!.legalActions();
      const before = this.table.acted;
      const briefing = await this.playerBriefing(handle, "The DM lets you act now. Your options:", options.text, "Take one with submit_decision.");
      await this.wakePlayer(agent, "granted", briefing);
      if (this.table.grants.delete(handle)) {
        this.table.fallbacks += 1;
        this.table.log("fallback", `${handle} passes on the action it was granted`, handle);
      }
      acted ||= this.table.acted > before;
    }
    if (acted) await this.wakeDm("narrate", undefined, "Narrate what the players just did, in one to three sentences.");
  }

  // --- The human seat ------------------------------------------------------------------------------

  /**
   * Asks the human, answering slash commands until something else comes back. Returns undefined
   * when the run ended meanwhile, or (for the paused prompt) when `/pause` was lifted.
   */
  private async ask(prompt: HumanPrompt): Promise<PlayerIntent | undefined> {
    for (;;) {
      if (this.table.ended) return undefined;
      const intent = await this.table.seat.ask(prompt);
      if (intent.kind === "text" || intent.kind === "option") {
        this.table.recordInput(this.table.human, JSON.stringify(intent), true);
      }
      if (intent.kind !== "command") return intent;
      await this.command(intent.name);
      if (prompt.kind === "paused" && !this.paused) return undefined;
    }
  }

  private async command(name: "sheet" | "where" | "options" | "log" | "pause" | "quit"): Promise<void> {
    const human = this.table.human;
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
        this.table.end("the human quit");
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

  private async humanState(): Promise<State | undefined> {
    const r = this.table.observe(await this.table.engine.request(this.table.human, { cmd: "get_state" }));
    return r.result?.cmd === "get_state" ? r.result.state : undefined;
  }

  /** Shows the human's numbered options: their own `legal_actions` and state, projected for them. */
  private async offerChoices(combat: boolean): Promise<void> {
    const human = this.table.human;
    const listed = this.table.observe(await this.table.engine.request(human, { cmd: "legal_actions", actor: human }));
    const state = combat ? await this.humanState() : undefined;
    if (!listed.ok || listed.result?.cmd !== "legal_actions") {
      this.top = this.shown = [];
      this.table.show({ kind: "info", title: "Options", text: listed.error?.message ?? "No options now." });
      return;
    }
    this.lastOptions = listed.result as LegalActionsResult;
    this.top = this.shown = buildChoices(this.lastOptions, state, combat);
    this.table.show({ kind: "options", lines: choiceLines(this.top), choices: this.top });
  }

  // --- Waking agents -------------------------------------------------------------------------------

  /** What an AI player hears before a wake: lines said to it, then events projected for it. */
  private async playerBriefing(handle: Handle, ...lines: string[]): Promise<string> {
    const heard = this.table.drainInbox(handle);
    const events = tellable(await this.table.engine.newEvents(handle));
    return [
      ...(heard.length > 0 ? ["What you heard:", ...heard] : []),
      ...(events.length > 0 ? ["What happened:", ...events.map(eventLine)] : []),
      ...lines,
    ].join("\n");
  }

  /** Wakes an AI player. A model error or timeout makes the decision fall back; a plan limit stops the run. */
  private async wakePlayer(agent: PlayerAgent, wake: PlayerWake, briefing: string): Promise<string | void | typeof FAILED> {
    this.table.recordInput(agent.handle, briefing);
    try {
      return await agent.wake(wake, briefing, this.tools.get(agent.handle)!);
    } catch (error) {
      if (stopsTheRun(error)) throw error;
      const why = error instanceof TurnTimeout ? "timed out" : `failed: ${error instanceof Error ? error.message : String(error)}`;
      this.table.log("error", `${agent.handle} (${wake}) ${why}`, agent.handle);
      return FAILED;
    }
  }

  /**
   * Wakes the DM with what it heard, the events it hasn't been told (or `events`), and the ask. When
   * the wake fails or spends its retries, the engine lines stand alone (spec §6).
   */
  private async wakeDm(wake: DmWake, events: Event[] | undefined, ...lines: string[]): Promise<string | void> {
    this.table.resetRetries("dm");
    const heard = this.table.drainDmInbox();
    let told = events;
    if (!told) {
      told = [...this.dmBacklog, ...tellable(await this.table.engine.newEvents("dm", "brief"))];
      this.dmBacklog = [];
    }
    const briefing = [
      ...(heard.length > 0 ? ["What the table said:", ...heard] : []),
      ...(told.length > 0 ? ["What happened:", ...told.map(eventLine)] : []),
      ...lines,
    ].join("\n");
    try {
      const said = await this.dm.wake(wake, briefing, this.dmTools);
      if (this.table.exhausted("dm")) {
        this.table.fallbacks += 1;
        this.table.log("fallback", `the DM's retries ran out (${wake}); the engine lines stand alone`, "dm");
      }
      return said;
    } catch (error) {
      if (stopsTheRun(error)) throw error;
      const why = error instanceof TurnTimeout ? "timed out" : `failed: ${error instanceof Error ? error.message : String(error)}`;
      this.table.log("error", `dm (${wake}) ${why}`, "dm");
      this.table.fallbacks += 1;
      this.table.log("fallback", `the DM's ${wake} is skipped; the engine lines stand alone`, "dm");
      return undefined;
    }
  }
}
