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
 * A retryable refusal counts as one of the decision's retries; once they are spent, no further
 * change reaches the engine and the loop falls back.
 */
export async function send(table: TableState, viewer: Viewer, command: Command, okText: (r: Response) => string): Promise<ToolOutcome> {
  const changes = CHANGES.has(command.cmd);
  if (changes && table.exhausted(viewer)) return table.spent();
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
  if (response.error?.retryable) table.retry(viewer);
  else {
    // Not retryable: logged as a loop bug and counted against the decision (spec §6).
    table.retry(viewer);
    table.log("error", `${viewer}: ${command.cmd} answered ${refusal(response)}`);
  }
  return { ok: false, retryable: response.error?.retryable ?? false, text: refusal(response), data: response.error };
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

  say(text: string): Promise<ToolOutcome> {
    return this.answer(this.table.speak(this.me, text));
  }

  note(kind: NoteKind, text: string): Promise<ToolOutcome> {
    return this.answer(this.table.note(this.me, kind, text));
  }
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

/**
 * The DM's tools (spec §3.2). Viewer `dm` for everything. Subjects it names (`actor` for a check,
 * a sheet, an explore move or Help) must be creatures in the scene. Its decision tools act only for
 * the human's character; it has no tool that acts for an AI player or a monster, or sets a result.
 */
export class DmTools {
  private readonly table: TableState;

  constructor(table: TableState) {
    this.table = table;
  }

  private async sceneHandles(): Promise<Handle[]> {
    const r = this.table.observe(await this.table.engine.request("dm", { cmd: "get_state" }));
    return r.ok && r.result?.cmd === "get_state" && r.result.state.view === "dm" ? r.result.state.creatures.map((c) => c.handle) : [];
  }

  private async inScene(actor: string): Promise<ToolOutcome | undefined> {
    if (this.table.exhausted("dm")) return this.table.spent();
    const handles = await this.sceneHandles();
    if (handles.includes(actor)) return undefined;
    this.table.retry("dm");
    return { ok: false, retryable: true, text: `unknown_creature: ${actor} is not in the scene. Creatures: ${handles.join(", ")}.` };
  }

  getState(): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "get_state" }, (r) => (r.result?.cmd === "get_state" ? formatDmState(r.result.state) : ""));
  }

  async getSheet(actor: string): Promise<ToolOutcome> {
    return (await this.inScene(actor)) ??
      send(this.table, "dm", { cmd: "get_sheet", actor }, (r) => (r.result?.cmd === "get_sheet" ? JSON.stringify(r.result.sheet) : ""));
  }

  loadScene(scene_id: string, party?: string[]): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "load_scene", scene_id, ...(party ? { party: [...party] } : {}) }, (r) =>
      r.result?.cmd === "load_scene" ? formatDmState(r.result.state) : "loaded",
    );
  }

  startCombat(encounter_id: string): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "start_combat", encounter_id }, () => "the fight is on; initiative rolled");
  }

  endCombat(reason: EndCombatReason): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "end_combat", reason }, () => `the fight ended (${reason})`);
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
    if (this.table.inCombat) return notNow("in a fight each player acts on its own turn");
    if (!this.table.players.includes(actor)) {
      this.table.retry("dm");
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
