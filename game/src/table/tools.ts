// The tools each seat acts through (M6 spec §3.1, §3.2; TASKS.md AGT-18). The orchestrator binds
// every call: `viewer` is the seat's own handle (a player) or `dm`; a player's `actor` is always
// its own character; the DM's decision tools act only for the human's character; the prompt id
// comes from the engine's current `awaiting`. No tool input has a viewer, actor or prompt id field,
// and the commands are built from named fields only, so extra input fields go nowhere.
import type {
  Aim,
  CheckSpec,
  Command,
  EndCombatReason,
  Handle,
  HelpSpec,
  HitDiceSpend,
  MoveTarget,
  Response,
  State,
  Viewer,
} from "@nat20-table/engine-client";
import { formatDmState, formatOptions, formatState, type LegalActionsResult } from "../view.ts";
import type { NoteKind, TableState } from "./state.ts";
import type { ToolOutcome } from "./types.ts";

/** What an agent may give `submit`: an option, and its targets, variant or aim. */
export interface DecisionInput {
  option_id: string;
  targets?: string[];
  variant?: string;
  aim?: Aim;
}

/** The engine's refusal as one line for the caller, with the DM's hint when it has one. */
function refusal(response: Response): string {
  const error = response.error;
  if (!error) return "refused";
  const reason = error.reason ? ` (${error.reason})` : "";
  const known = error.hint?.known_ids?.length ? ` Known ids: ${error.hint.known_ids.join(", ")}.` : "";
  return `${error.code}${reason}: ${error.message}${known}`;
}

/** Commands that change the session. The rest only read it. */
const CHANGES = new Set<Command["cmd"]>([
  "submit", "move", "end_turn", "react", "request_check", "help", "short_rest", "start_combat", "end_combat", "spawn", "load_scene",
]);

/**
 * Sends one bound command and turns the response into a tool outcome. A `stale_prompt` is the
 * orchestrator's problem (spec §6): it refreshes the prompt and resends once, which is not a retry.
 * A retryable refusal counts as one of the decision's retries; a refusal that isn't retryable ends
 * the decision. Once a decision is spent, no further change reaches the engine and the loop falls
 * back. A seat's changes go one at a time, so each sees what the ones before it spent.
 */
export function send(table: TableState, viewer: Viewer, command: Command, okText: (r: Response) => string): Promise<ToolOutcome> {
  if (!CHANGES.has(command.cmd)) return sendNow(table, viewer, command, okText);
  // An open surrender offer holds every change until the human answers it (AGT-30). The DM's
  // `end_combat` is the one way through, and `DmTools.endCombat` says when it may take it.
  if (table.surrender && !(viewer === "dm" && command.cmd === "end_combat")) {
    return Promise.resolve(notNow(`the surrender offer waits on ${table.human}'s answer; nothing happens before it`));
  }
  return table.oneAtATime(viewer, () => (table.exhausted(viewer) ? Promise.resolve(table.spent()) : sendNow(table, viewer, command, okText)));
}

async function sendNow(table: TableState, viewer: Viewer, command: Command, okText: (r: Response) => string): Promise<ToolOutcome> {
  const changes = CHANGES.has(command.cmd);
  let response = table.observe(await table.engine.request(viewer, command));
  if (!response.ok && response.error?.code === "stale_prompt" && "prompt_id" in command && command.prompt_id) {
    const fresh = table.observe(await table.engine.request(viewer, { cmd: "get_state" }));
    const awaiting = fresh.awaiting;
    if ((awaiting.kind === "action" || awaiting.kind === "reaction") && "actor" in command && awaiting.actor === command.actor) {
      response = table.observe(await table.engine.request(viewer, { ...command, prompt_id: awaiting.prompt_id }));
    }
  }
  if (response.ok) {
    if (changes) table.acted += 1;
    return { ok: true, text: okText(response), data: response.result };
  }
  const code = response.error?.code;
  if (code === "not_your_turn" || code === "stale_prompt") {
    return { ok: false, retryable: false, text: refusal(response) };
  }
  const retryable = response.error?.retryable ?? false;
  // Not retryable: logged as a loop bug, and the decision falls back (spec §6).
  if (!retryable) table.log("error", `${viewer}: ${command.cmd} answered ${refusal(response)}`);
  // The human's own decisions have no budget: the loop counts their rejections (spec §6).
  if (viewer !== table.human) {
    if (retryable) table.retry(viewer, `${viewer}: ${command.cmd} refused: ${refusal(response)}`);
    else table.spend(viewer);
  }
  return { ok: false, retryable, text: refusal(response), data: response.error };
}

const notNow = (what: string): ToolOutcome => ({ ok: false, retryable: false, text: `not now: ${what}` });

function decision(input: DecisionInput): { option_id: string; targets?: string[]; variant?: string; aim?: Aim } {
  return {
    option_id: input.option_id,
    ...(input.targets ? { targets: [...input.targets] } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.aim ? { aim: input.aim } : {}),
  };
}

/** An AI player's tools, bound to its own character. */
export class PlayerTools {
  readonly me: Handle;
  private readonly table: TableState;

  constructor(me: Handle, table: TableState) {
    this.me = me;
    this.table = table;
  }

  /** The prompt id while the engine waits on this character's action, else undefined. */
  private myAction(): string | undefined {
    const a = this.table.awaiting;
    return a.kind === "action" && a.actor === this.me ? a.prompt_id : undefined;
  }

  private async answer(outcome: Promise<ToolOutcome> | ToolOutcome): Promise<ToolOutcome> {
    const result = await outcome;
    this.table.recordInput(this.me, result.text);
    return result;
  }

  /**
   * Records a model input this seat got that no tool call made, such as its system prompt or a new
   * session's seed, for the leak scan (spec §3.5).
   */
  record(text: string): void {
    this.table.recordInput(this.me, text);
  }

  mySheet(): Promise<ToolOutcome> {
    return this.answer(send(this.table, this.me, { cmd: "get_sheet", actor: this.me }, (r) =>
      r.result?.cmd === "get_sheet" ? JSON.stringify(r.result.sheet) : "",
    ));
  }

  look(): Promise<ToolOutcome> {
    return this.answer(send(this.table, this.me, { cmd: "get_state" }, (r) =>
      r.result?.cmd === "get_state" ? formatState(r.result.state) : "",
    ).then((outcome) => ({ ...outcome, data: (outcome.data as { state?: unknown } | undefined)?.state })));
  }

  /** In a fight on its own turn, or out of combat once the DM granted it an action. */
  legalActions(): Promise<ToolOutcome> {
    if (!this.myAction() && !(this.table.grants.has(this.me) && !this.table.inCombat)) {
      return this.answer(notNow("it is not your turn"));
    }
    return this.answer(send(this.table, this.me, { cmd: "legal_actions", actor: this.me }, (r) =>
      r.result?.cmd === "legal_actions" ? formatOptions(r.result as LegalActionsResult) : "",
    ));
  }

  async submitDecision(input: DecisionInput): Promise<ToolOutcome> {
    const prompt = this.myAction();
    if (prompt) {
      return this.answer(send(this.table, this.me, { cmd: "submit", actor: this.me, prompt_id: prompt, ...decision(input) }, () => "accepted"));
    }
    if (this.table.inCombat || !this.table.grants.has(this.me)) return this.answer(notNow("it is not your turn"));
    // One explore action per grant (spec §3.3 step 4). The grant is taken before the engine is
    // asked, so a second call made meanwhile finds none; a refusal gives it back for a retry.
    this.table.grants.delete(this.me);
    const outcome = await send(this.table, this.me, { cmd: "submit", actor: this.me, ...decision(input) }, () => "accepted");
    if (!outcome.ok) this.table.grants.add(this.me);
    return this.answer(outcome);
  }

  move(to: MoveTarget): Promise<ToolOutcome> {
    const prompt = this.myAction();
    if (!prompt) return this.answer(notNow("you move on your own turn in a fight; out of combat, say where you go"));
    return this.answer(send(this.table, this.me, { cmd: "move", actor: this.me, prompt_id: prompt, to: moveTarget(to) }, (r) =>
      r.result?.cmd === "move" ? `moved ${Math.round(r.result.moved_ft)} ft${r.result.provoked.length ? `; provoked ${r.result.provoked.join(", ")}` : ""}` : "moved",
    ));
  }

  endTurn(): Promise<ToolOutcome> {
    const prompt = this.myAction();
    if (!prompt) return this.answer(notNow("it is not your turn"));
    return this.answer(send(this.table, this.me, { cmd: "end_turn", actor: this.me, prompt_id: prompt }, () => "turn ended"));
  }

  /** Takes the numbered reaction, or declines with null. */
  react(choice: number | null): Promise<ToolOutcome> {
    const a = this.table.awaiting;
    if (a.kind !== "reaction" || a.actor !== this.me) return this.answer(notNow("you have no reaction to make"));
    return this.answer(send(this.table, this.me, { cmd: "react", actor: this.me, prompt_id: a.prompt_id, choice }, () =>
      choice === null ? "declined" : "taken",
    ));
  }

  /** A line aloud; `to` is the companion it is spoken to (party talk §4.4). */
  say(text: string, to?: Handle): Promise<ToolOutcome> {
    return this.answer(this.table.speak(this.me, text, to));
  }

  note(kind: NoteKind, text: string): Promise<ToolOutcome> {
    return this.answer(this.table.note(this.me, kind, text));
  }
}

/**
 * An AI player's tools during a hand wake (party talk §4.3): it may look and keep notes, but it
 * answers in text only, and speaks or acts once it has the floor.
 */
export class HandTools extends PlayerTools {
  private wait(): Promise<ToolOutcome> {
    const outcome = notNow("wait for the floor: answer SPEAK, BOTH, ACT: <what you do> or PASS");
    this.record(outcome.text);
    return Promise.resolve(outcome);
  }

  override legalActions(): Promise<ToolOutcome> {
    return this.wait();
  }

  override submitDecision(): Promise<ToolOutcome> {
    return this.wait();
  }

  override move(): Promise<ToolOutcome> {
    return this.wait();
  }

  override endTurn(): Promise<ToolOutcome> {
    return this.wait();
  }

  override react(): Promise<ToolOutcome> {
    return this.wait();
  }

  override say(): Promise<ToolOutcome> {
    return this.wait();
  }
}

/** Whether the human's character is at 0 Hit Points or dead: then the DM decides on a surrender (D3). */
function humanDown(state: Extract<State, { view: "dm" }>, human: Handle): boolean {
  const me = state.creatures.find((c) => c.handle === human);
  return !me || me.life_state !== "conscious";
}

/** Only the three shapes of a move goal, field by field. */
function moveTarget(to: MoveTarget): MoveTarget {
  switch (to.kind) {
    case "anchor":
      return { kind: "anchor", anchor: to.anchor };
    case "creature":
      return { kind: "creature", handle: to.handle };
    case "point":
      return { kind: "point", point: { x_ft: to.point.x_ft, y_ft: to.point.y_ft, z_ft: to.point.z_ft } };
  }
}

/** Scenes the run passes over (the exit run plays Scene 1 and Scene 3, not Scene 2). */
export interface ScenePasses {
  /** The scene to load instead of `sceneId`, if the run passes over it. */
  insteadOf(sceneId: string): string | undefined;
  /** Called once the scene loaded instead of `sceneId` is in. */
  passedOver(sceneId: string, next: string): void;
}

/**
 * The DM's tools (spec §3.2). Viewer `dm` for everything. Subjects it names (`actor` for a check,
 * a sheet, an explore move or Help) must be creatures in the scene. Its decision tools act only for
 * the human's character; it has no tool that acts for an AI player or a monster, or sets a result.
 */
export class DmTools {
  private readonly table: TableState;
  private readonly passes: ScenePasses | undefined;

  constructor(table: TableState, passes?: ScenePasses) {
    this.table = table;
    this.passes = passes;
  }

  private async sceneHandles(): Promise<Handle[]> {
    const r = this.table.observe(await this.table.engine.request("dm", { cmd: "get_state" }));
    return r.ok && r.result?.cmd === "get_state" && r.result.state.view === "dm" ? r.result.state.creatures.map((c) => c.handle) : [];
  }

  private async inScene(actor: string): Promise<ToolOutcome | undefined> {
    if (this.table.exhausted("dm")) return this.table.spent();
    const handles = await this.sceneHandles();
    if (handles.includes(actor)) return undefined;
    this.table.retry("dm", `dm: ${actor} is not in the scene`);
    return { ok: false, retryable: true, text: `unknown_creature: ${actor} is not in the scene. Creatures: ${handles.join(", ")}.` };
  }

  getState(): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "get_state" }, (r) => (r.result?.cmd === "get_state" ? formatDmState(r.result.state) : ""));
  }

  async getSheet(actor: string): Promise<ToolOutcome> {
    return (await this.inScene(actor)) ??
      send(this.table, "dm", { cmd: "get_sheet", actor }, (r) => (r.result?.cmd === "get_sheet" ? JSON.stringify(r.result.sheet) : ""));
  }

  /**
   * Loads a scene, the party carried along. A scene the run passes over never loads: the next one the
   * run plays loads in its place with the same party, and the DM is told so.
   */
  async loadScene(scene_id: string, party?: string[]): Promise<ToolOutcome> {
    const instead = this.passes?.insteadOf(scene_id);
    const loaded = await send(this.table, "dm", { cmd: "load_scene", scene_id: instead ?? scene_id, ...(party ? { party: [...party] } : {}) }, (r) =>
      r.result?.cmd === "load_scene" ? formatDmState(r.result.state) : "loaded",
    );
    if (!instead || !loaded.ok) return loaded;
    this.passes!.passedOver(scene_id, instead);
    return {
      ...loaded,
      text: `This run passes over ${scene_id}, so ${instead} is loaded instead, with the same party. Nothing in ${scene_id} happens at the table.\n${loaded.text}`,
    };
  }

  startCombat(encounter_id: string): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "start_combat", encounter_id }, () => "the fight is on; initiative rolled");
  }

  /**
   * Ends the fight. A surrender is the human's to accept (AGT-30): the DM takes it only while it
   * maps the human's words answering its offer, or when the human's character is down (decision
   * D3). Otherwise it offers one with `offerSurrender`.
   */
  async endCombat(reason: EndCombatReason): Promise<ToolOutcome> {
    const offer = this.table.surrender;
    if (offer && !(offer.words && reason === "surrender")) {
      return notNow(`the surrender offer waits on ${this.table.human}'s answer`);
    }
    if (reason === "surrender" && !offer) {
      if (this.table.exhausted("dm")) return this.table.spent();
      const state = await this.dmState();
      if (!state || !humanDown(state, this.table.human)) {
        this.table.retry("dm", "dm: end_combat with surrender before the human accepted it");
        return { ok: false, retryable: true, text: `${this.table.human} decides on a surrender: offer it with offer_surrender` };
      }
    }
    const ended = await send(this.table, "dm", { cmd: "end_combat", reason }, () => `the fight ended (${reason})`);
    if (ended.ok) this.table.surrender = undefined;
    return ended;
  }

  /**
   * Offers the human the surrender of `handles` (AGT-30). The table asks the human at once and
   * holds every other change until they answer. Only while the engine shows a surrender available,
   * for exactly the creatures it would make neutral (`surrendering`), and not while the human's
   * character is down: then the DM decides (decision D3). The offer is held from the call on, so a
   * change the DM makes in parallel can't reach the engine while this one reads the state.
   */
  async offerSurrender(handles: string[]): Promise<ToolOutcome> {
    if (this.table.exhausted("dm")) return this.table.spent();
    if (this.table.surrender) return notNow("a surrender offer is already open");
    if (!this.table.inCombat) return notNow("there is no fight");
    const held = { handles: [] as Handle[], words: false };
    this.table.surrender = held;
    const outcome = await this.openOffer(handles, held);
    if (!outcome.ok && this.table.surrender === held) this.table.surrender = undefined;
    return outcome;
  }

  private async openOffer(handles: string[], held: { handles: Handle[] }): Promise<ToolOutcome> {
    const state = await this.dmState();
    if (!state) return notNow("the scene can't be read");
    const refuse = (why: string, text: string): ToolOutcome => {
      this.table.retry("dm", `dm: offer_surrender refused: ${why}`);
      return { ok: false, retryable: true, text };
    };
    const surrendering = state.encounters.find((e) => e.running && e.surrender_available)?.surrendering ?? [];
    if (surrendering.length === 0) {
      return refuse("no surrender is available", "surrender_not_available: no surrender is available now");
    }
    if (humanDown(state, this.table.human)) {
      return notNow(`${this.table.human} is down, so you decide: end_combat with surrender to accept it, or fight on`);
    }
    const named = [...new Set(handles)];
    if (named.length !== surrendering.length || named.some((h) => !surrendering.includes(h))) {
      return refuse(
        `handles ${named.join(", ") || "none"} are not the surrendering creatures`,
        `name exactly the creatures that would surrender: ${surrendering.join(", ")}`,
      );
    }
    held.handles = [...surrendering];
    this.table.log("system", `the DM offers ${this.table.human} the surrender of ${held.handles.join(", ")}`, "dm");
    return { ok: true, text: `offered; ${this.table.human} answers before anything else happens` };
  }

  private async dmState(): Promise<Extract<State, { view: "dm" }> | undefined> {
    const r = this.table.observe(await this.table.engine.request("dm", { cmd: "get_state" }));
    return r.ok && r.result?.cmd === "get_state" && r.result.state.view === "dm" ? r.result.state : undefined;
  }

  spawn(spawn_id: string): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "spawn", spawn_id }, (r) =>
      r.result?.cmd === "spawn" ? `placed ${r.result.handles.join(", ")}` : "placed",
    );
  }

  /** A check from the scene or the SRD ladder; the engine rolls and decides (Rule 4). */
  async requestCheck(actor: string, check: CheckSpec): Promise<ToolOutcome> {
    const spec: CheckSpec = check.kind === "scenario"
      ? { kind: "scenario", check_id: check.check_id }
      : { kind: "ladder", ability: check.ability, dc: check.dc, ...(check.skill ? { skill: check.skill } : {}) };
    return (await this.inScene(actor)) ??
      send(this.table, "dm", { cmd: "request_check", actor, check: spec }, (r) =>
        r.result?.cmd === "request_check" ? `[${r.result.roll_id}] ${r.result.success ? "success" : "failure"} (total ${r.result.total})` : "rolled",
      );
  }

  async help(actor: string, help: HelpSpec): Promise<ToolOutcome> {
    return (await this.inScene(actor)) ?? send(this.table, "dm", { cmd: "help", actor, help }, () => "helped");
  }

  shortRest(participants: string[], hit_dice?: HitDiceSpend[]): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "short_rest", participants: [...participants], ...(hit_dice ? { hit_dice } : {}) }, (r) =>
      r.result?.cmd === "short_rest" ? r.result.healed.map((h) => `${h.handle} +${h.amount}`).join(", ") : "rested",
    );
  }

  /** Out of combat: moves any creature in the scene. In a fight: the human's character only. */
  async move(actor: string, to: MoveTarget): Promise<ToolOutcome> {
    if (this.table.inCombat) {
      const a = this.table.awaiting;
      if (actor !== this.table.human || a.kind !== "action" || a.actor !== this.table.human) {
        return notNow(`in a fight you move only ${this.table.human}, on ${this.table.human}'s turn`);
      }
      return send(this.table, "dm", { cmd: "move", actor, prompt_id: a.prompt_id, to: moveTarget(to) }, () => "moved");
    }
    return (await this.inScene(actor)) ?? send(this.table, "dm", { cmd: "move", actor, to: moveTarget(to) }, () => "moved");
  }

  /** The human's character's options (any time out of combat; on its turn in a fight). */
  legalActions(): Promise<ToolOutcome> {
    const a = this.table.awaiting;
    if (this.table.inCombat && !(a.kind === "action" && a.actor === this.table.human)) {
      return Promise.resolve(notNow(`it is not ${this.table.human}'s turn`));
    }
    return send(this.table, "dm", { cmd: "legal_actions", actor: this.table.human }, (r) =>
      r.result?.cmd === "legal_actions" ? formatOptions(r.result as LegalActionsResult) : "",
    );
  }

  /** A decision for the human's character, mapped from the human's words (D5). */
  submit(input: DecisionInput): Promise<ToolOutcome> {
    const a = this.table.awaiting;
    if (this.table.inCombat) {
      if (a.kind !== "action" || a.actor !== this.table.human) return Promise.resolve(notNow(`it is not ${this.table.human}'s turn`));
      return send(this.table, "dm", { cmd: "submit", actor: this.table.human, prompt_id: a.prompt_id, ...decision(input) }, () => "accepted");
    }
    return send(this.table, "dm", { cmd: "submit", actor: this.table.human, ...decision(input) }, () => "accepted");
  }

  endTurn(): Promise<ToolOutcome> {
    const a = this.table.awaiting;
    if (a.kind !== "action" || a.actor !== this.table.human) return Promise.resolve(notNow(`it is not ${this.table.human}'s turn`));
    return send(this.table, "dm", { cmd: "end_turn", actor: this.table.human, prompt_id: a.prompt_id }, () => "turn ended");
  }

  /** Lets an AI player take one of its own options out of combat (spec §3.3 step 4). */
  grantAction(actor: string): ToolOutcome {
    if (this.table.exhausted("dm")) return this.table.spent();
    if (this.table.inCombat) return notNow("in a fight each player acts on its own turn");
    if (!this.table.players.includes(actor)) {
      this.table.retry("dm", `dm: grant refused: ${actor} is not an AI player`);
      return { ok: false, retryable: true, text: `${actor} is not an AI player; AI players: ${this.table.players.join(", ")}` };
    }
    this.table.grants.add(actor);
    return { ok: true, text: `${actor} may take one action now` };
  }

  narrate(text: string, to?: string): Promise<ToolOutcome> {
    return this.table.narrate(text, to);
  }

  askHuman(question: string): Promise<ToolOutcome> {
    return this.table.askHuman(question);
  }

  remember(fact: string): ToolOutcome {
    return this.table.remember(fact);
  }

  /** The adventure's last exit has fired: the closing narration, then the run ends. */
  async endAdventure(text: string): Promise<ToolOutcome> {
    if (this.table.inCombat) return notNow("finish the fight first");
    const said = await this.table.narrate(text);
    if (said.ok) this.table.end("the adventure is over");
    return said.ok ? { ok: true, text: "the adventure is over" } : said;
  }
}
