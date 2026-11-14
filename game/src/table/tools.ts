// The tools each seat acts through (M6 spec §3.1, §3.2; TASKS.md AGT-18). The orchestrator binds
// every call: `viewer` is the seat's own handle (a player) or `dm`; a player's `actor` is always
// its own character; the DM's decision tools act only for the human's character; the prompt id
// comes from the engine's current `awaiting`. No tool input has a viewer, actor or prompt id field,
// and the commands are built from named fields only, so extra input fields go nowhere.
import type {
  Ability,
  Aim,
  CheckSpec,
  Command,
  EndCombatReason,
  Handle,
  HelpSpec,
  HitDiceSpend,
  Goods,
  LevelUpChoice,
  Lodging,
  Pace,
  MoveTarget,
  Placement,
  Response,
  Skill,
  State,
  TimeSpan,
  Viewer,
} from "@nat20-table/engine-client";
import { formatDmState, formatOptions, formatState, type LegalActionsResult } from "../view.ts";
import type { NoteKind, TableState } from "./state.ts";
import type { RoadStep, ToolOutcome } from "./types.ts";
import { OWN_MOVE } from "./choices.ts";
import type { StatBlockEntry } from "../pack/adventure.ts";

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
  "place_creature", "start_fight", "give", "steal", "loot", "travel", "rest_night", "pass_time", "choose_card", "own_move", "level_up", "answer_level_up", "scout",
]);

/**
 * Sends one bound command and turns the response into a tool outcome. A `stale_prompt` is the
 * orchestrator's problem (spec §6): it refreshes the prompt and resends once, which is not a retry.
 * A retryable refusal counts as one of the decision's retries; a refusal that isn't retryable ends
 * the decision. Once a decision is spent, no further change reaches the engine and the loop falls
 * back. A seat's changes go one at a time, so each sees what the ones before it spent.
 */
/** A move ends on the last free spot it can reach (API-35, ENG-21); the answer says when it stopped short. */
export function movedText(r: Response): string {
  if (r.result?.cmd !== "move") return "moved";
  const short = r.result.reached ? "" : r.result.taken ? "; stopped short: someone already stands there" : "; stopped short, as far as movement goes: not there yet";
  return `moved ${Math.round(r.result.moved_ft)} ft${short}${r.result.provoked.length ? `; provoked ${r.result.provoked.join(", ")}` : ""}`;
}

export function send(
  table: TableState,
  viewer: Viewer,
  command: Command,
  okText: (r: Response) => string,
  /** Runs in the seat's turn, just before the command: an outcome it gives is answered instead. */
  guard?: () => Promise<ToolOutcome | undefined>,
): Promise<ToolOutcome> {
  if (!CHANGES.has(command.cmd)) return sendNow(table, viewer, command, okText);
  // An open surrender offer holds every change until the human answers it (AGT-30). The DM's
  // `end_combat` is the one way through, and `DmTools.endCombat` says when it may take it.
  if (table.surrender && !(viewer === "dm" && command.cmd === "end_combat")) {
    return Promise.resolve(notNow(`the surrender offer waits on ${table.human}'s answer; nothing happens before it`));
  }
  return table.oneAtATime(viewer, async () => {
    if (table.exhausted(viewer)) return table.spent();
    return (await guard?.()) ?? sendNow(table, viewer, command, okText);
  });
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

/** What the DM's tools for the human's character answer at a table with no human (AGT-40). */
const noHuman = notNow("no human sits at this table; every character takes its own options");

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
  protected readonly table: TableState;

  constructor(me: Handle, table: TableState) {
    this.me = me;
    this.table = table;
  }

  /** The prompt id while the engine waits on this character's action, else undefined. */
  private myAction(): string | undefined {
    const a = this.table.awaiting;
    return a.kind === "action" && a.actor === this.me ? a.prompt_id : undefined;
  }

  protected async answer(outcome: Promise<ToolOutcome> | ToolOutcome): Promise<ToolOutcome> {
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

  /** The `my_sheet` tool. */
  mySheet(): Promise<ToolOutcome> {
    return this.sheet();
  }

  /** Its own sheet, whatever the wake allows the model: a new session is seeded from it. */
  sheet(): Promise<ToolOutcome> {
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
  legalActions(described?: Set<string>): Promise<ToolOutcome> {
    if (!this.myAction() && !(this.table.grants.has(this.me) && !this.table.inCombat)) {
      return this.answer(notNow("it is not your turn"));
    }
    return this.answer(send(this.table, this.me, { cmd: "legal_actions", actor: this.me }, (r) =>
      r.result?.cmd === "legal_actions" ? formatOptions(r.result as LegalActionsResult, described) : "",
    ));
  }

  /**
   * Where its fight turn stands (M10 S3): still its own to end, held by a reaction window, or
   * already over (the engine moved on, or no fight).
   */
  turnState(): "open" | "reaction" | "over" {
    if (this.myAction()) return "open";
    return this.table.awaiting.kind === "reaction" ? "reaction" : "over";
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
    return this.answer(send(this.table, this.me, { cmd: "move", actor: this.me, prompt_id: prompt, to: moveTarget(to), partial: true }, movedText));
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

  /**
   * Moves the caravan on one leg (M9, AGT-80): toward a known place or along a road, or, when an
   * NPC owns the caravan, on along its route. The engine decides who may.
   */
  travel(pace: Pace, to?: string): Promise<ToolOutcome> {
    if (this.table.inCombat) return this.answer(notNow("the caravan moves on once the fight is over"));
    const levelling = this.levelling();
    if (levelling) return this.answer(notNow(`the caravan moves on once ${levelling} is done`));
    return this.answer(send(this.table, this.me, { cmd: "travel", actor: this.me, pace, ...(to ? { to } : {}) }, (r) =>
      r.result?.cmd === "travel" ? `${r.result.leg.arrived ? "arrived" : "stopped on the road for the day"}: ${r.result.leg.miles} miles in ${duration(r.result.leg.minutes)}` : "",
    ));
  }

  /** Ends the day at the inn or in camp (M9, AGT-80). */
  restNight(where: Lodging): Promise<ToolOutcome> {
    if (this.table.inCombat) return this.answer(notNow("the night waits until the fight is over"));
    const levelling = this.levelling();
    if (levelling) return this.answer(notNow(`the night waits until ${levelling} is done`));
    return this.answer(send(this.table, this.me, { cmd: "rest_night", actor: this.me, where }, (r) =>
      r.result?.cmd === "rest_night"
        ? `the night passes; rested: ${r.result.night.rested.join(", ") || "nobody"}${r.result.night.hungry.length > 0 ? `; hungry: ${r.result.night.hungry.join(", ")}` : ""}`
        : "",
    ));
  }

  /** The level-up open, if any, in words ("your level-up", "maren's level-up"): the road waits for it, since a new scene would leave it unanswered. */
  private levelling(): string | undefined {
    const a = this.table.awaiting;
    if (a.kind !== "level_up") return undefined;
    return a.actor === this.me ? "your level-up" : `${a.actor}'s level-up`;
  }

  /**
   * Walks ahead of the caravan as the scout (AGT-90, API-54): for every leg until another Blade
   * does. Waits until the human was offered it first.
   */
  scout(): Promise<ToolOutcome> {
    if (this.table.inCombat) return this.answer(notNow("the scout walks ahead once the fight is over"));
    if (this.table.human && !this.table.scoutOffered) return this.answer(notNow(`${this.table.human} is asked first who walks ahead; ask again on the road`));
    return this.answer(send(this.table, this.me, { cmd: "scout", actor: this.me }, () => "you walk ahead of the caravan as the scout; when a card comes on the road, you look first"));
  }

  /** Gives this character's word on the road card waiting: advice, a vote or the owner's call. */
  async chooseCard(choice: string): Promise<ToolOutcome> {
    const given = await send(this.table, this.me, { cmd: "choose_card", actor: this.me, choice }, () => `you said: ${choice}`);
    // Only a word the engine took is a word given: a refused one leaves the seat's own words standing.
    if (given.ok) this.chose = true;
    return this.answer(given);
  }

  /** Whether this seat called `choose_card` since the loop last took its words. */
  private chose = false;
  /** Its own words on the road card, for the loop to take to the DM once the wake returns (AGT-99). */
  private ownWords: string | undefined;

  /**
   * Says what this character does on the road card instead of a listed choice (AGT-99): the words
   * are only kept here; once the wake returns the loop takes them to the DM, who may make them an
   * own move on the card. Refused while the card already has one.
   */
  async ownMove(words: string): Promise<ToolOutcome> {
    const r = this.table.observe(await this.table.engine.request(this.me, { cmd: "get_state" }));
    const card = r.result?.cmd === "get_state" && r.result.state.view === "player" ? r.result.state.world?.card : undefined;
    if (!card) return this.answer(notNow("no road card waits for your word"));
    // A move that fell is no longer among the choices (decision 0079): only a written choice is left.
    if (card.own_move) return this.answer(notNow(moveFell(card) ? "the card's own move was tried and fell: give your word on a written choice with choose_card" : "the card already has an own move: give your word on it with choose_card"));
    if (card.said.some((s) => s.actor === this.me)) return this.answer(notNow("you have already given your word on this card"));
    if (!words.trim()) return this.answer(notNow("say in one sentence what your character does"));
    this.ownWords = words.trim();
    return this.answer({ ok: true, text: "your words are said; the table answers them next" });
  }

  /**
   * The words this seat gave with `own_move` since the loop last asked, and whether it also called
   * `choose_card`, and forgets both. A seat that did both has spoken: its words are only speech
   * (design §1.8).
   */
  takeOwnMove(): { words: string; chose: boolean } | undefined {
    const taken = this.ownWords === undefined ? undefined : { words: this.ownWords, chose: this.chose };
    this.ownWords = undefined;
    this.chose = false;
    return taken;
  }

  /** Opens a level-up when the sheet says it can (M9, AGT-80); the answer is the first choice, if any. */
  levelUp(): Promise<ToolOutcome> {
    if (this.table.inCombat) return this.answer(notNow("you level up once the fight is over"));
    return this.answer(send(this.table, this.me, { cmd: "level_up", actor: this.me }, (r) =>
      r.result?.cmd === "level_up" ? (r.result.choice ? formatLevelUpChoice(r.result.choice) : "level up done") : "",
    ));
  }

  /** Answers the open level-up choice with the ids picked. */
  answerLevelUp(picks: string[]): Promise<ToolOutcome> {
    const a = this.table.awaiting;
    if (a.kind !== "level_up" || a.actor !== this.me) return this.answer(notNow("you have no level-up choice open; call level_up"));
    return this.answer(send(this.table, this.me, { cmd: "answer_level_up", actor: this.me, prompt_id: a.prompt_id, picks: [...picks] }, (r) =>
      r.result?.cmd === "answer_level_up" ? (r.result.choice ? formatLevelUpChoice(r.result.choice) : "level up done") : "",
    ));
  }
}

/** A stretch of time in words: "40 minutes", "1 hour", "3 hours 20 minutes". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const hours = h > 0 ? `${h} hour${h === 1 ? "" : "s"}` : "";
  const mins = m > 0 || h === 0 ? `${m} minute${m === 1 ? "" : "s"}` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

/** A level-up choice in plain lines: what to pick, how many, each option with its summary, the recommended ones marked. */
export function formatLevelUpChoice(choice: LevelUpChoice): string {
  return [
    `Level ${choice.level}: ${choice.label} (pick ${choice.picks}).`,
    ...choice.options.map((o) => `- ${o.id}: ${o.name}${o.summary ? `. ${o.summary}` : ""}${choice.recommended.includes(o.id) ? " (recommended)" : ""}`),
  ].join("\n");
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

  // The road (AGT-80) waits for the floor too: no leg, night, card word or level-up from a hand wake.
  override travel(): Promise<ToolOutcome> {
    return this.wait();
  }

  override restNight(): Promise<ToolOutcome> {
    return this.wait();
  }

  override chooseCard(): Promise<ToolOutcome> {
    return this.wait();
  }

  override ownMove(): Promise<ToolOutcome> {
    return this.wait();
  }

  override scout(): Promise<ToolOutcome> {
    return this.wait();
  }

  override levelUp(): Promise<ToolOutcome> {
    return this.wait();
  }

  override answerLevelUp(): Promise<ToolOutcome> {
    return this.wait();
  }
}

/**
 * One trigger's reactions in a fight (party talk R1, AGT-34): every AI player who may react is woken
 * at once, the first line is heard, and nobody's after it.
 */
export class ReactionFloor {
  /** Who was heard, once someone was. */
  speaker: Handle | undefined;
  /** Who spoke after the floor was taken or closed: their line reached nobody. */
  readonly late = new Set<Handle>();
  /** No line is heard any more: one was, or the wakes are over. */
  closed = false;
  /** Called once, when the first line is heard. */
  private readonly onHeard: (speaker: Handle) => void;
  /** The lines being tried, one at a time, so a refused line never beats one said just after it. */
  private trying: Promise<unknown> = Promise.resolve();

  constructor(onHeard: (speaker: Handle) => void) {
    this.onHeard = onHeard;
  }

  /** Takes the floor for `speaker`, unless it is taken or closed. */
  take(speaker: Handle): boolean {
    if (this.speaker || this.closed) {
      this.late.add(speaker);
      return false;
    }
    this.speaker = speaker;
    return true;
  }

  /** The line of the one who took the floor was refused: the floor is free again. */
  release(): void {
    this.speaker = undefined;
  }

  heard(): void {
    this.closed = true;
    if (this.speaker) this.onHeard(this.speaker);
  }

  /** Runs `attempt` once every line tried before it has been heard or refused. */
  next<T>(attempt: () => Promise<T>): Promise<T> {
    const run = this.trying.then(attempt);
    this.trying = run.catch(() => undefined);
    return run;
  }
}

/**
 * An AI player's tools in a `bark` wake (party talk R1, AGT-34): it may keep notes and say one line,
 * which is heard only if it is the first since the trigger. Every other tool answers "not now": its
 * brief already says what happened, and its turn, if it comes next, is a wake of its own.
 */
export class BarkTools extends PlayerTools {
  private readonly floor: ReactionFloor;
  /** The wake is over (answered, cancelled or timed out): a line now reaches nobody. */
  private over = false;

  constructor(me: Handle, table: TableState, floor: ReactionFloor) {
    super(me, table);
    this.floor = floor;
  }

  end(): void {
    this.over = true;
  }

  private notYours(): Promise<ToolOutcome> {
    return this.answer(notNow("it isn't your turn: react in one line with say, or answer PASS"));
  }

  override mySheet(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override look(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override legalActions(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override submitDecision(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override move(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override endTurn(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override react(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override travel(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override restNight(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override chooseCard(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override levelUp(): Promise<ToolOutcome> {
    return this.notYours();
  }

  override answerLevelUp(): Promise<ToolOutcome> {
    return this.notYours();
  }

  /**
   * The line is heard only if nobody spoke first and its speaker can still speak; a refused line is
   * dropped, not retried. Lines are tried one at a time, so a refused one frees the floor for the next.
   */
  override say(text: string, to?: Handle): Promise<ToolOutcome> {
    return this.floor.next(async () => {
      if (this.over) return this.answer(notNow("the moment has passed"));
      // The fight went on while it thought. Unconscious includes Incapacitated, and an Incapacitated
      // creature can't speak (SRD 5.2.1, Rules Glossary).
      if (!(await this.conscious())) {
        this.end();
        return this.answer(notNow("you can't speak: you are not conscious"));
      }
      // Cancelled while its sheet came: a line not yet said reaches nobody.
      if (this.over) return this.answer(notNow("the moment has passed"));
      if (!this.floor.take(this.me)) {
        return this.answer(notNow(this.floor.speaker ? `${this.floor.speaker} spoke first; the fight has moved on` : "the moment has passed"));
      }
      const outcome = await this.table.speak(this.me, text, to, true);
      if (outcome.ok) this.floor.heard();
      else this.floor.release();
      return this.answer(outcome);
    });
  }

  /** Whether its own character is conscious now, from its own sheet. */
  private async conscious(): Promise<boolean> {
    const r = this.table.observe(await this.table.engine.request(this.me, { cmd: "get_sheet", actor: this.me }));
    return r.result?.cmd === "get_sheet" && r.result.sheet.life_state === "conscious";
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
  /** The run's last scene: the adventure ends only after it has loaded (or with the whole party down). */
  finale?: string;
  /** The scene loaded last. */
  current?(): string | undefined;
  /** Scenes that offer a Short Rest (the skeleton's `rest`): leaving one unrested reminds the DM once. */
  rests?: ReadonlySet<string>;
  /** The pack's `stat_blocks` list (API-33, AGT-24): the only creatures the DM may place. */
  statBlocks?: readonly StatBlockEntry[];
}

/**
 * The DM's tools (spec §3.2). Viewer `dm` for everything. Subjects it names (`actor` for a check,
 * a sheet, an explore move or Help) must be creatures in the scene. Its decision tools act only for
 * the human's character; it has no tool that acts for an AI player or a monster, or sets a result.
 */
export class DmTools {
  private readonly table: TableState;
  private readonly passes: ScenePasses | undefined;
  /** The scene loaded last: by this DM's own load_scene (the loop hears of it only after the wake), or as the loop heard it. */
  private loaded: string | undefined;
  /** Scenes in which the party took a Short Rest. */
  private readonly restedIn = new Set<string>();
  /** Scenes whose missed rest the DM has been reminded of: once each. */
  private readonly reminded = new Set<string>();
  /** A scene loaded in the wake running: its opening is the next wake's, so no narration follows it (M10 P1). */
  private loadedThisWake = false;
  /** Whether this wake's `pick_card` was taken (AGT-100): a pick wake narrates only after it. */
  picked = false;
  /** The DM's last line to the whole table, for the next scene's opening to continue from (M10 P1). */
  lastLine: string | undefined;
  /** A player's words on the road card a `card_words` wake answers (AGT-99): the loop sets them for the wake. */
  cardWords: { actor: Handle; words: string; answerOnly?: string } | undefined;
  /** The own move the wake put on the card, if one did. */
  ownMoveMade = false;
  /** The narration that answered the words, once one showed. */
  cardAnswer: string | undefined;

  constructor(table: TableState, passes?: ScenePasses) {
    this.table = table;
    this.passes = passes;
  }

  /** The human's character, or undefined at a table with no human (AGT-40): who decides a surrender. */
  get human(): Handle | undefined {
    return this.table.human;
  }

  /**
   * The loop heard a scene load, whoever loaded it: the DM, a `travel` leg, or `start_campaign`
   * moving a saved party to where its caravan stands (API-45). The scene being played is that one.
   */
  sceneHeard(sceneId: string): void {
    this.loaded = sceneId;
  }

  /** A DM wake begins: what the wake before it loaded no longer holds its narration back. */
  startWake(): void {
    this.loadedThisWake = false;
    this.picked = false;
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
    // The reminder is read in the DM's turn, so a start_combat sent in parallel still follows the load.
    const loaded = await send(
      this.table,
      "dm",
      { cmd: "load_scene", scene_id: instead ?? scene_id, ...(party ? { party: [...party] } : {}) },
      (r) => (r.result?.cmd === "load_scene" ? formatDmState(r.result.state) : "loaded"),
      () => this.restReminder(),
    );
    if (loaded.ok) {
      this.loaded = instead ?? scene_id;
      this.loadedThisWake = true;
    }
    if (!instead || !loaded.ok) return loaded;
    this.passes!.passedOver(scene_id, instead);
    return {
      ...loaded,
      text: `This run passes over ${scene_id}, so ${instead} is loaded instead, with the same party. Nothing in ${scene_id} happens at the table.\n${loaded.text}`,
    };
  }

  /** The scene being played, as `load_scene` or the loop last loaded it. */
  private current(): string | undefined {
    return this.loaded ?? this.passes?.current?.();
  }

  /**
   * The party is leaving a scene that offers a Short Rest, nobody rested in it, and someone is hurt:
   * the DM hears so once and decides (the first M7 run on main went into the cellar unrested). A
   * reminder is not a refusal: it costs no retry, and the next `load_scene` goes through.
   */
  private async restReminder(): Promise<ToolOutcome | undefined> {
    const scene = this.current();
    if (!scene || !this.passes?.rests?.has(scene) || this.restedIn.has(scene) || this.reminded.has(scene) || this.table.inCombat) return undefined;
    const state = await this.dmState();
    // Only a creature with Hit Points left benefits from a Short Rest (SRD 5.2.1).
    const hurt = (state?.creatures ?? []).filter((c) => c.side === "party" && c.hp > 0 && c.hp < c.hp_max).map((c) => `${c.handle} ${c.hp}/${c.hp_max}`);
    if (hurt.length === 0) return undefined;
    this.reminded.add(scene);
    return notNow(
      `${scene} offers a Short Rest, and nobody has rested here; hurt: ${hurt.join(", ")}. Offer it (short_rest, if the party takes it), or call load_scene again to go on without it`,
    );
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
      const human = this.table.human;
      // With no human at the table, a surrender is the DM's call (M7 spec §4.2, AGT-40).
      const state = human ? await this.dmState() : undefined;
      if (human && (!state || !humanDown(state, human))) {
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
    if (!this.table.human) return notNow("no human sits at this table, so you decide: end_combat with surrender to accept it, or fight on");
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
    if (humanDown(state, this.table.human!)) {
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

  /**
   * Brings in one creature from the pack's `stat_blocks` list (AGT-24): the stat block, its side and
   * what it carries come from the entry, never from the DM, who names only the entry, a new handle
   * and where it stands (a place, or beside a creature). The engine finds the nearest free spot.
   */
  async placeCreature(entry: string, handle: string, where: { place?: string; near?: string }, name?: string): Promise<ToolOutcome> {
    const list = this.passes?.statBlocks ?? [];
    const found = list.find((s) => s.id === entry);
    if (!found) {
      return list.length === 0
        ? notNow("this adventure lists no creatures to bring in; only the scene's own spawns")
        : { ok: false, text: `no creature ${entry} in the adventure's list: ${list.map((s) => s.id).join(", ")}` };
    }
    let at: Placement;
    if (where.place) at = { kind: "anchor", anchor: where.place };
    else if (where.near) {
      const state = await this.dmState();
      const beside = state?.creatures.find((c) => c.handle === where.near);
      if (!beside) return { ok: false, text: `no creature ${where.near} in this scene` };
      at = { kind: "point", point: beside.position_ft };
    } else return { ok: false, text: "give a place or a creature to stand beside" };
    const given = name?.trim();
    const called = given || found.name;
    const placed = await send(
      this.table,
      "dm",
      {
        cmd: "place_creature",
        handle,
        monster: found.monster,
        side: found.side,
        at,
        ...(called ? { name: called } : {}),
        ...(found.carries ? { carries: found.carries } : {}),
      },
      () => (this.table.inCombat ? `${handle} is here and joins the fight; initiative rolled` : `${handle} is here`),
      // A name reaches every view, so it passes the narration guard: no game statistic in it.
      async () => {
        const refused = given ? this.table.narrationRefused(given) : undefined;
        if (!refused) return undefined;
        this.table.retry("dm", `dm: place_creature name refused: ${refused}`);
        return { ok: false, retryable: true, text: `Not placed: the name ${refused}. A name is what the table calls it, nothing more.` };
      },
    );
    // The seat calls the creature by the DM's name, never by its handle (run 2026-11-13: «pickler»).
    if (placed.ok && given) this.table.names.learn(handle, given);
    return placed;
  }

  /**
   * Out of combat in the living world: time passes where the party is (API-50), in the DM's span.
   * The answer says the new watch; the engine refuses a span that would reach midnight.
   */
  async passTime(span: TimeSpan): Promise<ToolOutcome> {
    return send(this.table, "dm", { cmd: "pass_time", span }, (r) => {
      const clock = r.result?.cmd === "pass_time" && r.result.state.view === "dm" ? r.result.state.world?.clock : undefined;
      return clock ? `time passed; it is now day ${clock.day}, ${clock.watch.replace(/_/g, " ")}` : "time passed";
    });
  }

  /**
   * Puts one of the offered road cards on the table (AGT-88, API-53), with one line of why.
   * Only while a draw's cards wait for the pick.
   */
  async pickCard(card: string, reason: string): Promise<ToolOutcome> {
    if (this.table.exhausted("dm")) return this.table.spent();
    const world = (await this.dmState())?.world;
    const offered = world?.offered ?? [];
    if (offered.length === 0) return notNow("no road cards wait for your pick");
    if (!offered.some((c) => c.id === card)) return notNow(`${card} is not one of the offered cards: ${offered.map((c) => c.id).join(", ")}`);
    if (!reason.trim()) return notNow("say why in one line");
    // The card as drawn and the scout's look (AGT-100): the narration that opens it comes after this result.
    const picked = await send(this.table, "dm", { cmd: "pick_card", card, reason: reason.trim() }, (r) => {
      const look = r.events.find((e) => e.kind === "scout_looked");
      const scout = look?.kind === "scout_looked" ? (look.saw ? ` ${look.actor} scouted ahead and saw it first.` : ` ${look.actor} scouted ahead and missed it.`) : "";
      const state = r.result?.cmd === "pick_card" && r.result.state.view === "dm" ? r.result.state : undefined;
      const drawn = state?.world?.card;
      return drawn ? `${card} is on the table. ${cardDrawnLine(drawn)}${scout} Now open it with narrate.` : `${card} is on the table`;
    });
    if (picked.ok) this.picked = true;
    return picked;
  }

  /** Out of combat: one creature hands another, within 5 feet, coin or one carried item (ITM-6). */
  async give(actor: string, to: string, what: Goods): Promise<ToolOutcome> {
    return (await this.inScene(actor)) ?? send(this.table, "dm", { cmd: "give", actor, to, what }, () => `handed over; the ledger entry is in the events`);
  }

  /**
   * Out of combat: the engine rolls the thief's Sleight of Hand against the target's passive
   * Perception (ITM-6). The answer says whether it went unseen; only the thief and the DM see a
   * theft that succeeds, so the DM tells it to the thief alone.
   */
  async steal(actor: string, target: string, what: Goods): Promise<ToolOutcome> {
    return (await this.inScene(actor)) ??
      send(this.table, "dm", { cmd: "steal", actor, target, what }, (r) =>
        r.result?.cmd === "steal"
          ? r.result.success
            ? `[${r.result.roll_id}] unseen: tell ${actor} alone (narrate to ${actor}); ${target} and the others never hear of it`
            : `[${r.result.roll_id}] noticed: ${target} catches ${actor} at it, and the whole table sees`
          : "rolled",
      );
  }

  /** Out of combat: takes everything a fallen or surrendered creature within 5 feet carries (ITM-6). */
  async loot(actor: string, from: string): Promise<ToolOutcome> {
    return (await this.inScene(actor)) ?? send(this.table, "dm", { cmd: "loot", actor, from }, () => "taken; what moved is in the events");
  }

  /** A fight among creatures present that no scene encounter fits (API-34): no surprise, no early end. */
  async startFight(participants: string[]): Promise<ToolOutcome> {
    if ((this.passes?.statBlocks ?? []).length === 0) return notNow("this adventure holds no fights beyond its scenes' encounters");
    // A neutral named in the fight turns hostile (API-60). The engine's other refusals of a
    // fight's sides are not retryable and would end the DM's turn with its narration (run
    // 2026-11-13), so they are answered here, as a retry, before the engine sees them.
    return send(this.table, "dm", { cmd: "start_fight", participants: [...participants] }, () => "the fight is on; initiative rolled", async () => {
      const state = await this.dmState();
      if (!state) return undefined;
      const sides = new Map(state.creatures.map((c) => [c.handle, c.side]));
      const twice = participants.find((h, i) => participants.indexOf(h) !== i);
      // A handle not in the scene goes on to the engine, which names it (unknown_creature).
      if (!twice && participants.some((h) => !sides.has(h))) return undefined;
      const fighting = participants.map((h) => sides.get(h));
      const why = twice
        ? `${twice} is listed twice`
        : !fighting.includes("party") || !fighting.some((side) => side === "hostile" || side === "neutral")
          ? "a fight needs someone of the party and someone against them"
          : undefined;
      if (!why) return undefined;
      this.table.retry("dm", `dm: start_fight refused: ${why}`);
      return { ok: false, retryable: true, text: `No fight: ${why}. Name everyone in it again, or answer in the story without a fight, then narrate.` };
    });
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

  async shortRest(participants: string[], hit_dice?: HitDiceSpend[]): Promise<ToolOutcome> {
    const scene = this.current();
    const rested = await send(this.table, "dm", { cmd: "short_rest", participants: [...participants], ...(hit_dice ? { hit_dice } : {}) }, (r) =>
      r.result?.cmd === "short_rest" ? r.result.healed.map((h) => `${h.handle} +${h.amount}`).join(", ") : "rested",
    );
    if (rested.ok && scene) this.restedIn.add(scene);
    return rested;
  }

  /** Out of combat: moves any creature in the scene. In a fight: the human's character only. */
  async move(actor: string, to: MoveTarget): Promise<ToolOutcome> {
    if (this.table.inCombat) {
      const a = this.table.awaiting;
      if (!this.table.human) return notNow("in a fight each character moves on its own turn");
      if (actor !== this.table.human || a.kind !== "action" || a.actor !== this.table.human) {
        return notNow(`in a fight you move only ${this.table.human}, on ${this.table.human}'s turn`);
      }
      return send(this.table, "dm", { cmd: "move", actor, prompt_id: a.prompt_id, to: moveTarget(to), partial: true }, movedText);
    }
    return (await this.inScene(actor)) ?? send(this.table, "dm", { cmd: "move", actor, to: moveTarget(to) }, () => "moved");
  }

  /** The human's character's options (any time out of combat; on its turn in a fight). */
  legalActions(described?: Set<string>): Promise<ToolOutcome> {
    const human = this.table.human;
    if (!human) return Promise.resolve(noHuman);
    const a = this.table.awaiting;
    if (this.table.inCombat && !(a.kind === "action" && a.actor === human)) {
      return Promise.resolve(notNow(`it is not ${human}'s turn`));
    }
    return send(this.table, "dm", { cmd: "legal_actions", actor: human }, (r) =>
      r.result?.cmd === "legal_actions" ? formatOptions(r.result as LegalActionsResult, described) : "",
    );
  }

  /** A decision for the human's character, mapped from the human's words (D5). */
  submit(input: DecisionInput): Promise<ToolOutcome> {
    const human = this.table.human;
    if (!human) return Promise.resolve(noHuman);
    const a = this.table.awaiting;
    if (this.table.inCombat) {
      if (a.kind !== "action" || a.actor !== human) return Promise.resolve(notNow(`it is not ${human}'s turn`));
      return send(this.table, "dm", { cmd: "submit", actor: human, prompt_id: a.prompt_id, ...decision(input) }, () => "accepted");
    }
    return send(this.table, "dm", { cmd: "submit", actor: human, ...decision(input) }, () => "accepted");
  }

  endTurn(): Promise<ToolOutcome> {
    const human = this.table.human;
    if (!human) return Promise.resolve(noHuman);
    const a = this.table.awaiting;
    if (a.kind !== "action" || a.actor !== human) return Promise.resolve(notNow(`it is not ${human}'s turn`));
    return send(this.table, "dm", { cmd: "end_turn", actor: human, prompt_id: a.prompt_id }, () => "turn ended");
  }

  /**
   * The party said in the story that they move on, or settled down for the night (AGT-80): the table
   * asks whoever drives the caravan once this wake is over. The DM never moves the caravan or ends
   * the day (design S2). Only out of a fight, with no road card or level-up waiting, one at a time.
   */
  async proposeRoad(step: RoadStep): Promise<ToolOutcome> {
    if (this.table.exhausted("dm")) return this.table.spent();
    if (this.table.inCombat) return notNow("the road waits until the fight is over");
    if (this.table.road) return notNow("the table is already asking whoever drives the caravan");
    if (this.table.awaiting.kind === "level_up") return notNow(`the road waits until ${this.table.awaiting.actor}'s level-up is done`);
    const world = (await this.dmState())?.world;
    if (!world) return notNow("there is no road in this adventure");
    if (world.card) return notNow("a road card waits for its word first");
    // What is left of the day at a fast pace is offered on the human's own list when it gets the
    // caravan somewhere; the DM's proposal is the ordinary pace.
    if (step === "move_on" && world.today.normal === 0) {
      return notNow("the day's travel is spent: propose camp, and the caravan moves on in the morning");
    }
    if (step === "inn") {
      const here = world.at.kind === "at" ? world.places.find((p) => p.id === (world.at as { place: string }).place) : undefined;
      if (typeof here?.inn_cp !== "number") return notNow("there is no inn here: propose camp instead");
    }
    this.table.road = { step };
    return {
      ok: true,
      text: `the table asks whoever drives the caravan whether to ${step === "move_on" ? "move on" : "end the day"}; narrate the party getting ready, never the journey or the night itself`,
    };
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

  /**
   * The `card_words` wake's one answer (AGT-99, design §1.8): with `move`, the words of the seat
   * that woke it become an own move on the card, and the narration shows once the engine took it;
   * a refusal shows nothing and answers with the engine's reason, so the DM can correct it. Without
   * `move`, only the narration. On a card that has or had an own move, a `move` is not sent: the
   * words are only answered, and no retry is spent on `own_move_taken` (decision 0079).
   */
  async ownMoveOrAnswer(narration: string, move?: { ability: Ability; skill: Skill; dc: number; success: string; failure?: string }): Promise<ToolOutcome> {
    const words = this.cardWords;
    if (!words) return notNow("no player's words on a road card wait for your answer");
    const dropped = Boolean(move && words.answerOnly);
    if (dropped) {
      this.table.log("system", `${words.answerOnly}: ${words.actor}'s words are only answered`, "table");
      move = undefined;
    }
    // One move per wake: once it is on the card, a retry only rewrites the narration.
    const already = move !== undefined && this.ownMoveMade;
    if (move && !this.ownMoveMade) {
      const made = await send(
        this.table,
        "dm",
        { cmd: "own_move", actor: words.actor, text: words.words, ability: move.ability, skill: move.skill, dc: move.dc, success: move.success, ...(move.failure ? { failure: move.failure } : {}) },
        () => `${words.actor}'s own move is on the card`,
      );
      if (!made.ok) return made;
      this.ownMoveMade = true;
    }
    const said = await this.narrate(narration);
    if (!said.ok) return said;
    this.cardAnswer = narration;
    if (dropped) return { ...said, text: `${said.text}; ${words.answerOnly}, so this move is not sent: the words are only answered` };
    return already ? { ...said, text: `${said.text}; the own move you made first stays on the card, this move is not sent` } : said;
  }

  async narrate(text: string, to?: string): Promise<ToolOutcome> {
    // Runs 18-45 and 17-35 opened 4 of 5 scenes twice: once after load_scene, once on scene_open.
    // In the DM's turn, after every change it started: a load_scene sent in parallel lands first.
    return this.table.oneAtATime("dm", async () => {
      if (this.loadedThisWake) return notNow("the next scene is loaded; its opening comes with your next wake");
      // A pick wake opens the card it picked (AGT-100): the narration never runs ahead of the pick.
      if (this.table.dmWake === "pick" && !this.picked) return notNow("pick the card first with pick_card, then narrate its opening");
      const said = await this.table.narrate(text, to);
      if (said.ok && !to) this.lastLine = text;
      return said;
    });
  }

  askHuman(question: string): Promise<ToolOutcome> {
    return this.table.askHuman(question);
  }

  remember(fact: string): ToolOutcome {
    return this.table.remember(fact);
  }

  /** Whether every party member is at 0 Hit Points: the adventure may end early then. */
  private async partyDown(): Promise<boolean> {
    const r = await this.table.engine.request("dm", { cmd: "get_state" });
    const state = r.result?.cmd === "get_state" ? r.result.state : undefined;
    if (state?.view !== "dm") return false;
    const party = state.creatures.filter((c) => c.side === "party");
    return party.length > 0 && party.every((c) => c.hp === 0);
  }

  /** The adventure's last exit has fired: the closing narration, then the run ends. */
  async endAdventure(text: string): Promise<ToolOutcome> {
    if (this.table.inCombat) return notNow("finish the fight first");
    const finale = this.passes?.finale;
    if (finale && (this.loaded ?? this.passes?.current?.()) !== finale && !(await this.partyDown())) {
      return notNow(`the adventure ends only after its last scene, ${finale}: follow the scene's exit with load_scene first`);
    }
    const said = await this.table.narrate(text);
    if (said.ok) this.table.end("the adventure is over");
    return said.ok ? { ok: true, text: "the adventure is over" } : said;
  }
}

/** A card whose own move fell (decision 0079): the move is still on it, and no longer among its choices. */
export function moveFell(card: { own_move?: unknown; choices: Array<{ id: string }> }): boolean {
  return Boolean(card.own_move) && !card.choices.some((c) => c.id === OWN_MOVE);
}

/** The own-move rule (decision 0079, design §1.8): in the road section and in the `card_words` wake. */
export const OWN_MOVE_RULE =
  "Answer with own_move_or_answer. First, when the words simply are one of the card's choices, say so in the scene and let the card wait for that choice, with no move: you never decide a card for a player. Otherwise, if one of the card's choices is what the words bring when they work, make them a move: the check they call for, that choice as success, and your narration. Name a failure only when another choice is plainly what happens when the attempt fails, never one that breaks a custom and never a deliberate act the words did not ask for; with no failure named, a failed roll runs no choice and the move is spent. If no choice is what the words would bring, give only the narration, one or two sentences, and the card waits. A success brings a fight only when the words asked for one. Your narration answers the attempt only, never how it turns out: nobody in the scene agrees to it, refuses it or gives way, and nothing is won or lost by it; the engine's roll and the card's choices decide that. The scene still answers: a person on the card, if there is one, says what the plan would cost them or asks something back, and a companion may speak. When you answer a player's words with own_move_or_answer, never call remember for how the attempt turned out.";

/** A road card as the DM drew it, for a tool's result: its words and its choices (AGT-100). */
export function cardDrawnLine(card: { text: string; choices: { id: string; text: string; keeps?: string[] | null; breaks?: string[] | null }[] }): string {
  const choice = (c: (typeof card.choices)[number]) => `${c.id}: ${c.text}${c.keeps?.length ? ` (keeps ${c.keeps.join(", ")})` : ""}${c.breaks?.length ? ` (breaks ${c.breaks.join(", ")})` : ""}`;
  return `The card: "${card.text}"\nIts choices: ${card.choices.map(choice).join(" | ")}`;
}
