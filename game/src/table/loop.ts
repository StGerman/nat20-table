// The turn loop (M6 spec §3.3, TASKS.md AGT-3) and its retry and fallback model (§6, AGT-11). Plain,
// deterministic TypeScript, not an agent: after every engine response it reads `awaiting` and
// decides who is woken next. Agents act only through their bound tools and the human only through
// the seat; every number the human picks becomes a complete command with no model call (D5).
import type { StatBlockEntry } from "../pack/adventure.ts";
import { EngineStopped, type CardDm, type CardPlayer, type ErrorCode, type Event, type Handle, type LevelUpChoice, type RejectReason, type Sheet, type State, type WorldDm } from "@nat20-table/engine-client";
import { ConnectionLost, LoginExpired, ModelOffline, TurnTimeout, UsageLimitReached } from "../errors.ts";
import { coinPhrase, eventLine, formatOptions, formatSheet, formatState, mapLines, offeredLine, reactingTo, tellable, type LegalActionsResult } from "../view.ts";
import { buildChoices, cardChoices, choiceLines, levelUpChoices, OWN_MOVE, roadChoices, type Choice, type ChoiceAct, type SeatTalk } from "./choices.ts";
import { coinsRu } from "./seat-lines.ts";
import { mapLinesRu, sheetRu, stateRu } from "./seat-views.ts";
import { isFallen, lifts, liftsOn, turnOutcome, type Lift, type LiftChance } from "./fallen.ts";
import { handAnswer, handOff, namedIn, speakingOrder, type Address, type Hand, type HandedOff } from "./floor.ts";
import { doerAfter, mayReact, triggerIn, type TriggerKind } from "./reactions.ts";
import { situationOf } from "./situation.ts";
import type { TableState } from "./state.ts";
import { BarkTools, cardDrawnLine, DmTools, HandTools, movedText, PlayerTools, ReactionFloor, send } from "./tools.ts";
import { usageBlock, type UsageLog } from "../usage.ts";
import type { Language } from "../agents/language.ts";
import { refusedRu, SEAT_WORDS, UI_WORDS, type SeatWords } from "./words.ts";
import type { Suggester } from "../agents/suggest.ts";
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
  /** The pack's `stat_blocks` list: the creatures the DM may place beyond the scene files (AGT-24). None by default. */
  statBlocks?: readonly StatBlockEntry[];
  /** The run's language (decision 0067): the words the table itself shows the human's seat. Default `en`. */
  language?: Language;
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
  /** The run's usage records, for `/usage` (M10 U1). */
  usage?: UsageLog;
  /** The living world (M9, AGT-80): the run starts a campaign and plays days on the map. Off by default. */
  campaign?: CampaignLoop;
  /**
   * Response suggestions for the human out of combat (AGT-49): three moves the seat offers as a
   * picker. Only for a seat that shows them; `/suggest` turns them off and on. None by default.
   */
  suggester?: Suggester;
}

/** The prompts the suggester answers (S1: out of combat only, words: explore, the DM's question, a surrender). */
const SUGGESTED: ReadonlySet<HumanPrompt["kind"]> = new Set(["explore", "answer", "surrender"]);

/** What the run report counts of the suggestions (AGT-49, S4). */
export interface SuggestionCounts {
  /** Prompts the picker was shown for. */
  shown: number;
  /** Lines sent as a suggestion offered them. */
  unchanged: number;
  /** Lines sent from a suggestion the human edited first. */
  edited: number;
  /** Lines the human wrote alone while suggestions were shown. */
  own: number;
}

/** How the loop plays the living world (M9, AGT-80). */
export interface CampaignLoop {
  /** The party on the caravan, the human's character included, in seat order. */
  party: Handle[];
  /** The last game day the run plays: the night that starts the day after it ends the run. None by default. */
  dayLimit?: number;
  /** Called after every night, once the DM has told it: the run saves the party (design: "after every night"). */
  onNight?: () => Promise<void>;
  /** Whether the run keeps the party for the next journey (a roster): the end card says so. */
  keepsParty?: boolean;
  /**
   * The pack's start day (`world.day`, 1 by default). `dayLimit` is the pack's last day on that
   * clock, so a next contract, whose clock carries on from the saved day (M11, Q2), gets as many
   * days as the pack gives: from its start day to its day limit.
   */
  startDay?: number;
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
  /** The AI players still waiting for the floor when the party left it for the next scene (decision 0050). */
  left_waiting?: Handle[];
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
  /** Each AI combat turn that began with a fallen ally the player could lift, and what it did (hands-and-check spec A3-M). */
  liftChances: LiftChance[];
  /** Combat rounds played, and the AI players' lines in them: on their turns and between them (party talk goal 4). */
  fight: { rounds: number; lines: number };
  /** Which stop ended the run early; absent when it ended in play (M7 design §3.1). */
  stop?: StopKind;
  /** Each scene played, with when it started and ended (M7 spec §4.1). */
  sceneTimes: SceneTime[];
  /** The suggestions picker's counts (AGT-49); absent when the run had no suggester. */
  suggestions?: SuggestionCounts;
  /**
   * The DM's suggested road cards after a living-world run (AGT-91, decision 4), in the deck file's
   * format, never loaded; `unread` keeps an answer that was not JSON. Absent when none was asked.
   */
  suggestedCards?: SuggestedCards;
  /**
   * The contract's days on the world clock: its first day, and the last day the run plays (none
   * without a day limit). Later than the pack's own on a next contract, whose clock carries on.
   */
  campaignDays?: { start: number; last: number | null };
}

/** The DM's suggested cards (AGT-91): up to two, each with its one-line reason. */
export type SuggestedCards = { cards: unknown[]; why: string[] } | { unread: string };

/** The ask at a living world's end (AGT-91). Our own words; the cards are for Stas to read, never loaded. */
export const SUGGEST_ASK = [
  "The journey is over. Suggest up to two new road cards that would carry on what this party did on it: a deed they wrote, a person they met, a choice that cost them. Stas reads them after the run; they are never loaded into play.",
  "Each card follows the deck file's format and the card tests: someone wants something, the stake is visible, two or three choices that each name an action and never its outcome, each choice different in what it changes.",
  'Your final answer is only this JSON, nothing else, and call no tool: {"cards": [{"id": "snake_case_id", "zone": "a road zone or a place id", "when": "road", "target": "blades", "text": "what the players read", "choices": [{"id": "snake_case", "text": "an action"}]}], "why": ["one line per card: what it carries on"]}',
].join("\n");

/** The DM's answer to the suggest wake, as the run report keeps it. */
export function readSuggested(answer: string): SuggestedCards {
  // The whole answer is the JSON, or it is kept as written; a code fence around it is allowed.
  const body = answer.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1");
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const { cards, why } = parsed as { cards?: unknown; why?: unknown };
      // Only cards that are objects: the run report reads their fields.
      const kept = Array.isArray(cards) ? cards.filter((c) => c !== null && typeof c === "object" && !Array.isArray(c)) : [];
      if (kept.length > 0) return { cards: kept.slice(0, 2), why: Array.isArray(why) ? why.slice(0, 2).map(String) : [] };
    }
  } catch {
    // Not JSON: kept as it came.
  }
  return { unread: answer };
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
const NUDGE = "It is still your turn. Act with submit_decision or move, and end the turn (end_turn, or end_turn: true on submit_decision) when you are done.";

/** Event kinds that are only bookkeeping: a part made of nothing else isn't narrated. */
const QUIET = new Set<Event["kind"]>(["turn_start", "turn_end", "round"]);

/** A wake that ended in a model error or timeout: the decision falls back (spec §6). */
const FAILED = Symbol("failed");

/**
 * What a `table_turn` wake adds while someone still waits for the floor: who, and who spoke to
 * each. The DM decides whether the scene may end before they are heard (decision 0050).
 */
function waitingLine(carried: ReadonlyMap<Handle, readonly Handle[]>): string[] {
  if (carried.size === 0) return [];
  const who = [...carried].map(([handle, from]) => `${handle} (spoken to by ${from.join(", ")})`);
  return [`Still waiting for the floor: ${who.join("; ")}. They speak first in the next round.`];
}

/** A plan limit, an expired login, a lost network or a dead engine stops the run; nothing falls back (spec §6). */
function stopsTheRun(error: unknown): error is Error {
  return error instanceof UsageLimitReached || error instanceof LoginExpired || error instanceof EngineStopped || error instanceof ModelOffline;
}

/** Which stop an error that stops the run is (M7 design §3.1). */
function stopOf(error: Error): StopKind {
  if (error instanceof UsageLimitReached) return "usage_limit";
  if (error instanceof LoginExpired) return "login";
  return error instanceof ModelOffline ? "offline" : "crash";
}

/**
 * Who changed place in the lines a narrate wake tells, said as a fact next to them: the rule in the
 * DM's prompt alone didn't stop a hit foe "backing away" with no move (runs 17-35 n80-1 and 18-45-48).
 */
export function movedLine(events: readonly Event[]): string {
  const movers = [...new Set(events.flatMap((e) => (e.kind === "moved" ? [e.actor] : e.kind === "fled" ? e.handles : [])))];
  return movers.length > 0
    ? `Moved in these lines: ${movers.join(", ")}. Nobody else changed place: no one else backs away, flees, ducks behind something or closes in.`
    : "Nobody moved in these lines: no one backs away, flees, ducks behind something or closes in.";
}

/** Two creatures whose centres are this close stand within reach of a blow (5 ft between them, M10 P3). */
export const REACH_CENTRES_FT = 7.5;

/**
 * Who stands within reach of whom, said as a fact in a narrate briefing (M10 P3): run 21-48 had
 * a goblin "at Torva's side" and a blow "from across the yard" that the positions contradict. From
 * the DM's state; the dead are left out.
 */
export function adjacencyLine(state: State | undefined): string | undefined {
  if (state?.view !== "dm") return undefined;
  const standing = state.creatures.filter((c) => c.life_state !== "dead");
  const pairs: string[] = [];
  for (const [i, a] of standing.entries()) {
    for (const b of standing.slice(i + 1)) {
      const d = Math.hypot(a.position_ft.x_ft - b.position_ft.x_ft, a.position_ft.y_ft - b.position_ft.y_ft);
      if (d <= REACH_CENTRES_FT) pairs.push(`${a.handle} and ${b.handle}`);
    }
  }
  return pairs.length > 0
    ? `Within reach of each other: ${pairs.join("; ")}. Everyone else is apart.`
    : "Nobody stands within reach of anyone else.";
}

export class TableLoop {
  private readonly table: TableState;
  private readonly dm: DmAgent;
  private readonly agents = new Map<Handle, PlayerAgent>();
  private readonly tools = new Map<Handle, PlayerTools>();
  /** Each AI player's tools for a hand wake: they answer in text only (party talk §4.3). */
  private readonly handTools = new Map<Handle, HandTools>();
  private readonly names: ReadonlyMap<Handle, readonly string[]>;
  /** The words the table itself shows the human's seat, in the run's language. */
  private readonly words: SeatWords;
  /** The seat's words and names together, for the numbered lists (AGT-98). */
  private get talk(): SeatTalk {
    return { words: this.words, names: this.table.names };
  }
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
  /** AI combat turns that began with a fallen ally to lift, for the report. */
  private readonly liftChances: LiftChance[] = [];
  /** Talk rounds so far, for the report; their count shifts the speakers' seat order (party talk §4.2.6). */
  private readonly talkRounds: TalkRound[] = [];
  /**
   * AI players spoken to who didn't get the floor in the last talk round, each with who spoke to it:
   * they go first in the next one, and the DM's `table_turn` wake names them (decision 0050).
   */
  private carried = new Map<Handle, Handle[]>();
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
  private readonly usage: UsageLog | undefined;
  private readonly campaign: CampaignLoop | undefined;
  /**
   * The journey's end (B7): after the arrival the human has one last turn at the destination
   * ("last_turn"), then the DM's closing narration and the end card ("closing").
   */
  private journeyEnd: "last_turn" | "closing" | undefined;
  /** The escort's settling, held while the destination's arrival card waits (ENG-35). */
  private settledLater: Event | undefined;
  /** The destination's scene opened without the pay, which the `escort_settled` wake tells next (AGT-86). */
  private arrivalOpened = false;
  /** The road card a wake has opened (AGT-100): it is opened once, however often the seats are asked. */
  private framed: string | undefined;
  /** The last game day the contract plays, on the world clock (`dayLimit` from its first day). */
  private lastDay: number | undefined;
  private firstDay: number | undefined;
  /** The human's experience when the campaign started, for what the journey earned. */
  private startXp: number | undefined;
  /** The road cards the run has asked about, by the engine's log head when each was drawn, so a card that won't settle stops the run. */
  private cardAsked = new Map<string, number>();
  /** The human's open level-up choice, from the engine's last answer (AGT-80). */
  private levelChoice: LevelUpChoice | undefined;
  private readonly suggester: Suggester | undefined;
  /** `/suggest` toggles it (S3: on by default). */
  private suggestOn = true;
  private readonly suggestions: SuggestionCounts = { shown: 0, unchanged: 0, edited: 0, own: 0 };
  /** The last suggestion call, so the next waits for it to end (one session, one turn at a time). */
  private suggesting: Promise<void> = Promise.resolve();

  constructor(options: LoopOptions) {
    this.table = options.table;
    this.dm = options.dm;
    for (const agent of options.players) {
      this.agents.set(agent.handle, agent);
      this.tools.set(agent.handle, new PlayerTools(agent.handle, this.table));
      this.handTools.set(agent.handle, new HandTools(agent.handle, this.table));
    }
    this.names = options.names ?? new Map();
    this.words = SEAT_WORDS[options.language ?? "en"];
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
      ...(options.statBlocks ? { statBlocks: options.statBlocks } : {}),
    });
    this.onScene = options.onScene ?? (() => "continue");
    this.maxSteps = options.maxSteps ?? 5000;
    this.situation = options.situation ?? false;
    this.stallRounds = options.stallRounds ?? 0;
    this.onProgress = options.onProgress ?? (() => undefined);
    this.usage = options.usage;
    this.campaign = options.campaign;
    this.suggester = options.suggester;
  }

  /** Plays from `firstScene` until the adventure ends, the human quits, or the run is stopped. */
  async run(firstScene: string, party?: Handle[]): Promise<RunReport> {
    let steps = 0;
    let failure: unknown;
    try {
      const loaded = await this.dmTools.loadScene(firstScene, party);
      if (!loaded.ok) throw new Error(`the first scene didn't load: ${loaded.text}`);
      if (this.campaign) {
        const human = this.table.human;
        const started = await send(this.table, "dm", { cmd: "start_campaign", party: [...this.campaign.party], ...(human ? { human } : {}) }, () => "the campaign started");
        if (!started.ok) throw new Error(`the campaign didn't start: ${started.text}`);
        // The contract's first day on the world clock: later than the pack's on a next contract.
        // `day_limit` is the pack's last day on its own clock, so it moves by as many days.
        this.firstDay = (await this.dmWorld())?.clock.day ?? this.campaign.startDay ?? 1;
        if (this.campaign.dayLimit !== undefined) this.lastDay = this.campaign.dayLimit + this.firstDay - (this.campaign.startDay ?? 1);
        this.table.log("system", `campaign started: ${this.campaign.party.join(", ")} with the caravan${this.lastDay ? `, until the end of day ${this.lastDay}` : ""}`);
        if (human) this.startXp = (await this.humanSheet())?.xp?.points;
      }
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
    // A living world that ended in play: the DM suggests up to two cards for later (AGT-91).
    const suggestedCards = this.campaign && !this.table.stop && !failure ? await this.suggestCards() : undefined;
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
    this.table.show({ kind: "end", text: this.words.ended(ended, this.table.stop) });
    // When the engine is gone, the run has its transcript and the engine's request log, not the
    // session log, so the audit can't run on it (spec §6: no resume).
    await writing(() => this.table.engine.writeLog());
    await Promise.allSettled([this.dm.close?.(), ...[...this.agents.values()].map((a) => a.close?.()), this.suggester?.close()]);
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
      liftChances: [...this.liftChances],
      fight: { rounds: this.fightRounds.size, lines: this.table.fightLines },
      ...(this.table.stop ? { stop: this.table.stop } : {}),
      ...(this.suggester ? { suggestions: { ...this.suggestions } } : {}),
      ...(suggestedCards ? { suggestedCards } : {}),
      // A scene a stop cut short keeps no end time, and counts the rounds it got to.
      ...(this.firstDay !== undefined ? { campaignDays: { start: this.firstDay, last: this.lastDay ?? null } } : {}),
      sceneTimes: this.sceneTimes.map((t) => ({ ...t, ...(t.ended_at ? {} : { rounds: this.roundsIn(t.id) }) })),
    };
  }

  /**
   * The DM's suggested cards (AGT-91), asked once the journey is over. Not a decision of the run:
   * a failure is logged and counts no fallback, and the run report says none were written.
   */
  private async suggestCards(): Promise<SuggestedCards | undefined> {
    try {
      const answer = await this.dm.wake("suggest", SUGGEST_ASK, this.dmTools);
      if (typeof answer !== "string" || !answer.trim()) return undefined;
      const suggested = readSuggested(answer);
      this.table.log("system", "unread" in suggested ? "the DM's suggested cards were not JSON; kept as written" : `the DM suggested ${suggested.cards.length} cards`);
      return suggested;
    } catch (error) {
      if (stopsTheRun(error)) return undefined;
      this.table.log("error", `dm (suggest) failed: ${error instanceof Error ? error.message : String(error)}`, "dm");
      return undefined;
    }
  }

  /** One decision: whatever the engine waits on next. */
  private async step(): Promise<void> {
    // A fight that ended or a scene that loaded changes the phase, whoever caused it. Handling one
    // can cause the next (the DM loads the next scene when a fight ends), so read until it's quiet.
    for (let events = await this.watch(); events.length > 0; events = await this.watch()) {
      // A scene another one replaced before the table saw it is never opened: a saved party's
      // world moves it from the first scene to where the caravan stands (API-45).
      const lastScene = events.map((e) => e.kind).lastIndexOf("scene_loaded");
      // The escort settles in the batch that loads the destination's scene (AGT-86, decision 0060
      // F5: Odda paid twice in the narration): the opening leaves the pay to the pay's own wake.
      const settles = lastScene >= 0 && events.slice(lastScene + 1).some((e) => e.kind === "escort_settled");
      for (const [i, event] of events.entries()) {
        if (this.table.ended) return;
        if (event.kind === "combat_over") await this.combatOver(event);
        if (event.kind === "scene_loaded" && i < lastScene) this.table.log("system", `scene ${event.scene_id} left before it opened`);
        else if (event.kind === "scene_loaded") await this.sceneLoaded(event.scene_id, settles || (Boolean(this.campaign) && (await this.payWaits())));
        if (this.campaign) await this.roadEvent(event);
      }
    }
    if (this.table.ended) return;
    // A road card waits for the party's word out of a fight (AGT-80): it is asked before anything else.
    if (this.campaign && !this.table.inCombat && (await this.cardRound())) return;
    // The destination's arrival card is settled and its fight, if any, is over: the pay comes now (ENG-35).
    if (this.settledLater && !this.table.inCombat && !(await this.dmWorld())?.card) {
      const settled = this.settledLater;
      this.settledLater = undefined;
      await this.roadEvent(settled);
      return;
    }
    // The human's last turn at the journey's end is over, and no fight or level-up holds the
    // table (B7): a level-up picked on the last turn is answered first, then the journey closes.
    if (this.journeyEnd === "closing" && !this.table.inCombat && this.table.awaiting.kind !== "level_up") {
      const destination = (await this.dmWorld())?.escort?.contract.destination ?? "";
      await this.closeJourney(destination);
      return;
    }
    await this.showSituation();
    const awaiting = this.table.awaiting;
    // A fight drops the requests the talk before it carried or left pending (party talk §4.4).
    if (this.table.inCombat) {
      this.carried.clear();
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
      // A level-up is open (AGT-80): the human picks; an AI player that left it open takes the recommended.
      case "level_up":
        if (awaiting.actor === this.table.human) return this.humanLevelUp(awaiting.prompt_id);
        return this.recommendedLevelUp(awaiting.actor, awaiting.prompt_id);
    }
  }

  private watch(): Promise<Event[]> {
    return this.table.engine.newEvents("dm", "watch");
  }

  // --- Scenes -------------------------------------------------------------------------------------

  /**
   * The caravan stands at the escort's destination and the pay waits for its arrival card
   * (ENG-35, MAP-10): the opening still leaves the pay out, so the arrival is told once.
   */
  private async payWaits(): Promise<boolean> {
    const world = await this.dmWorld();
    const escort = world?.escort;
    return Boolean(escort && !escort.contract.done && world.at.kind === "at" && world.at.place === escort.contract.destination);
  }

  /** `payNext`: the escort is paid after this opening, in its own wake (AGT-86). */
  private async sceneLoaded(sceneId: string, payNext = false): Promise<void> {
    // A scene the run passes over never loads (`DmTools.loadScene` loads the next one instead).
    if (this.onScene(sceneId, this.scenes) !== "continue") {
      this.table.end(`the run stops before ${sceneId}`);
      return;
    }
    // The DM's tools follow the scene the table is in, whoever loaded it (a resumed caravan's included).
    this.dmTools.sceneHeard(sceneId);
    const first = this.scenes.length === 0;
    // The scene is left with someone still waiting for the floor: the report counts it (decision 0050).
    const left = this.sceneTimes.at(-1);
    if (left && !left.ended_at && this.carried.size > 0) {
      left.left_waiting = [...this.carried.keys()];
      for (const handle of left.left_waiting) this.table.log("hand", `left ${left.id} still waiting for the floor`, handle);
    }
    this.endScene();
    // The suggester starts each scene from its briefings alone, so its context stays small (AGT-49).
    await this.suggester?.close();
    this.scenes.push(sceneId);
    this.sceneTimes.push({ id: sceneId, started_at: new Date().toISOString(), rounds: 0 });
    this.onProgress({ kind: "scene_start", scene: sceneId });
    this.table.log("system", `scene ${sceneId}`);
    if (!first) await this.closeScene();
    if (this.table.ended) return;
    const passed = this.passedSince;
    this.passedSince = [];
    // The opening continues from the DM's last words on the way here (M10 P1), not from scratch.
    const last = first ? undefined : this.dmTools.lastLine;
    // Read once: a scene loaded with no line on the way must not carry an older scene's words.
    this.dmTools.lastLine = undefined;
    // A road card drawn on the way here is played after this opening (AGT-100), so the opening
    // must not bring the caravan in ahead of it.
    const world = this.campaign ? await this.dmWorld() : undefined;
    const cardAhead = Boolean(world && ((world.offered ?? []).length > 0 || world.card));
    await this.wakeDm(
      "scene_open",
      undefined,
      ...(last ? [`Your last words to the table, on the way here: "${last}" Continue from them; don't tell the way here again.`] : []),
      ...(passed.length > 0
        ? [
            `This run passes over ${passed.join(", ")}: the party went through on the way here, and nothing in it happened at the table. Bridge it in a sentence at most, without its checks or what they would find.`,
          ]
        : []),
      `Scene ${sceneId} is loaded. Open it for the table: what the characters see, and what they can obviously do.`,
      ...(cardAhead ? [CARD_AHEAD] : []),
      ...(payNext ? ["The merchant pays the Blades next, and you narrate that on its own: open the arrival here without the pay, the purse or any coin."] : []),
    );
    this.arrivalOpened = payNext;
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
    this.table.show({ kind: "info", title: this.words.passedOverTitle, text: this.words.passedOver(sceneId, next) });
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

  // --- The road (M9, AGT-80) ------------------------------------------------------------------------

  /** The world as the DM sees it, or undefined before the campaign starts. */
  private async dmWorld(): Promise<WorldDm | undefined> {
    const r = await this.table.engine.request("dm", { cmd: "get_state" });
    return r.result?.cmd === "get_state" && r.result.state.view === "dm" ? (r.result.state.world ?? undefined) : undefined;
  }

  /** A place's name as the table knows it, for the human's lines. */
  private async placeWords(id: string): Promise<string> {
    return this.table.names.place(id, (await this.dmWorld())?.places.find((p) => p.id === id)?.name);
  }

  /** The human's own sheet (owner view), or undefined. */
  private async humanSheet(): Promise<Sheet | undefined> {
    const human = this.table.human;
    if (!human) return undefined;
    const r = await this.table.engine.request(human, { cmd: "get_sheet", actor: human });
    return r.result?.cmd === "get_sheet" ? r.result.sheet : undefined;
  }

  /**
   * The journey's end (B7, Stas's Wend run 2026-11-05: the run stopped on an English line and read
   * like a crash): the DM's closing narration of the road behind and what is still open, then one
   * end card for the human with what the journey earned, then the end.
   */
  private async closeJourney(destination: string): Promise<void> {
    this.journeyEnd = undefined;
    await this.wakeDm(
      "road",
      undefined,
      "The journey is over: the escort contract is done, and the story rests here.",
      "Write the closing narration in three to five sentences: the road the party travelled, how they stand now, and what is still open in the world (a foe who got away, a promise, a road not taken). No new event: nothing happens after this.",
    );
    await this.settle();
    const human = this.table.human;
    if (human) {
      const sheet = await this.humanSheet();
      const blade = (await this.dmWorld())?.escort?.contract.blades.find((b) => b.handle === human);
      const w = this.words;
      const lines = [w.contractDone(await this.placeWords(destination))];
      const xp = sheet?.xp;
      const gained = xp && this.startXp !== undefined ? xp.points - this.startXp : undefined;
      const wages = blade ? (this.table.names.language === "ru" ? coinsRu(blade.paid_cp) : coinPhrase(blade.paid_cp)) : undefined;
      if (wages || gained) lines.push(w.earned(wages, gained || undefined));
      if (xp?.can_level_up) lines.push(w.enoughXp);
      else if (xp && typeof xp.next_level === "number") lines.push(w.moreXp(xp.next_level - xp.points));
      if (this.campaign?.keepsParty) lines.push(w.partyKept);
      this.table.show({ kind: "info", title: w.journeyEnd, text: lines.join("\n") });
    }
    this.table.end("the escort contract is done");
  }

  /**
   * What the road did since the last look: a card settled, a night passed, the escort was paid.
   * The DM tells each one; a night saves the party and may end the run at its day limit; the paid
   * escort ends it, the contract done.
   */
  private async roadEvent(event: Event): Promise<void> {
    const campaign = this.campaign!;
    switch (event.kind) {
      case "card_resolved":
        this.framed = undefined;
        await this.wakeDm(
          "road",
          undefined,
          `A road card was settled: ${event.text}`,
          "The engine has already applied the card: any fight it brings has started and any creature it brings is placed. Narrate what comes of it in one to three sentences; never start the fight again. Name coin or a price only as the engine's lines give it, never a sum of your own.",
        );
        await this.settle();
        return;
      case "night": {
        const next = await this.dmWorld();
        await this.wakeDm(
          "road",
          undefined,
          `The night passed: ${event.text}`,
          "Narrate the night and the morning in one to three sentences: who slept well, who went hungry, as the engine says.",
          ...(next?.card || next?.offered?.length ? ["A road card follows: do not close the night."] : []),
        );
        await this.settle();
        await campaign.onNight?.();
        const day = (await this.dmWorld())?.clock.day;
        if (this.lastDay !== undefined && day !== undefined && day > this.lastDay) {
          this.table.end(`the day limit: day ${this.lastDay} is over`);
        }
        return;
      }
      case "escort_settled":
        // The destination's arrival card is on the table (ENG-35): the party decides it first,
        // and the pay, the last turn and the closing follow once it is settled.
        if ((await this.dmWorld())?.card) {
          this.settledLater = event;
          return;
        }
        await this.wakeDm(
          "road",
          undefined,
          `The caravan reached ${event.destination}, and the merchant paid the Blades what they are owed: ${event.text}`,
          this.arrivalOpened
            ? "Your last narration opened the arrival: don't tell it again. Narrate the pay alone as a scene, once, in two to four sentences: the merchant's words, the coin changing hands. Name an amount only as the engine's lines give it, never a sum of your own."
            : "Narrate the arrival and the pay as a scene, in two to four sentences: the merchant's words, the coin changing hands. Name an amount only as the engine's lines give it, never a sum of your own.",
        );
        this.arrivalOpened = false;
        await this.settle();
        // The human has one last turn at the destination before the closing (B7); a table with
        // no human closes at once.
        if (this.table.human && !this.table.inCombat) {
          this.journeyEnd = "last_turn";
          this.table.show({ kind: "info", title: this.words.journeyEnd, text: this.words.lastTurn(await this.placeWords(event.destination)) });
        } else await this.closeJourney(event.destination);
        return;
    }
  }

  /**
   * A road card that waits for the party's word (design: card kinds): the human is asked first, so
   * their word and their reasons can sway the AI Blades (Stas, 2026-11-06, AGT-87); then each AI
   * player it waits for, one at a time, each hearing what was said before it.
   * An AI player that gives no word goes with the others. Returns whether a card was asked about.
   */
  private async cardRound(): Promise<boolean> {
    let world = await this.dmWorld();
    // A draw that offered two or three cards waits for the DM's pick (API-53, AGT-88): the DM is
    // woken with the offered cards and the deeds the world remembers, and picks by the rule in its
    // prompt. A failed or timed-out wake, or one that picks nothing, leaves the first card rolled
    // to the engine's pick, which the run report counts.
    const offered = world?.offered ?? [];
    // A card is opened by its pick wake, else by a card wake; after a failed wake it shows alone (0041).
    let frame = offered.length === 0;
    if (offered.length > 0 && !this.table.ended) {
      const deeds = world?.deeds ?? [];
      await this.wakeDm(
        "pick",
        undefined,
        "Pick a road card: a draw offered these, in the order they were rolled.",
        ...offered.map((c, i) => offeredLine(c, i + 1)),
        deeds.length > 0 ? `Deeds the world remembers: ${deeds.map((d) => d.deed).join(", ")}.` : "The world remembers no deeds yet.",
        `Call pick_card once, with the card's id and one line of why. Then ${CARD_OPENING.charAt(0).toLowerCase()}${CARD_OPENING.slice(1)}`,
      );
      frame = !this.table.wakeNarrated && !this.dmWakeFailed;
      world = await this.dmWorld();
      const first = world?.offered?.[0];
      if (first && !this.table.ended) {
        // A failed wake already counted its fallback; a wake that picked nothing counts here.
        if (!this.dmWakeFailed) {
          this.table.fallbacks += 1;
          this.table.log("fallback", `the DM picked no road card: the table takes the first card rolled (${first.id})`, "dm", { cause: "unanswered", wake: "pick", narrated: false });
        }
        const picked = await send(this.table, "dm", { cmd: "pick_card", card: first.id, reason: "The table took the first card rolled.", fallback: true }, () => `the road card ${first.id} is on the table`);
        // A refused pick leaves the cards offered and every road move refused: the run can't go on.
        if (!picked.ok) throw new Error(`the table could not pick the road card ${first.id}: ${picked.text}`);
        world = await this.dmWorld();
      }
    }
    const card = world?.card;
    if (!card) return false;
    // A player owner makes the caravan's call after every Blade's advice (S2): the card waits for them
    // though `waiting_for` names only the Blades.
    const owner = world && card.target === "caravan" && !world.caravan.owner.includes(":") ? world.caravan.owner : undefined;
    if (card.waiting_for.length === 0 && owner === undefined) return false;
    // The same card still waiting after a full round of asking and a fallback: the engine refuses
    // every word, so the run can't go on.
    const asked = this.cardAsked.get(card.id);
    if (asked !== undefined && asked === this.table.engine.logHead) throw new Error(`the road card ${card.id} won't settle: still waiting for ${card.waiting_for.join(", ")}`);
    // A card that came with no pick is opened by a `card` wake before the seats see it (AGT-100);
    // a picked card was opened by its pick wake, or shows alone after that wake's fallback.
    if (frame && this.framed !== card.id && !this.table.ended) {
      await this.wakeDmOnce(
        "card",
        undefined,
        "A road card is on the table.",
        cardDrawnLine(card),
        ...(this.arrivalOpened ? ["The scene's opening told the arrival: open only the card."] : []),
        CARD_OPENING,
      );
    }
    this.framed = card.id;
    if (this.table.ended) return false;
    this.table.log("system", `card ${card.id} goes to the seats`);
    await this.table.flush();
    const human = this.table.human;
    if (human && card.waiting_for.includes(human) && !this.table.ended) await this.humanCard(card);
    for (const handle of card.waiting_for) {
      const agent = this.agents.get(handle);
      if (!agent || this.table.ended) continue;
      const now = (await this.dmWorld())?.card;
      if (!now || now.id !== card.id || !now.waiting_for.includes(handle)) continue;
      await this.aiCard(agent, "Give your word with choose_card, with a choice id. Say why in one line with say, if your character would.");
    }
    const now = (await this.dmWorld())?.card;
    // Whoever is still silent goes with the others (a failed wake or a refusal).
    if (now && now.id === card.id && !this.table.ended) {
      const { choices, preset } = cardChoices(now);
      const choice = choices[preset - 1].about!.id;
      for (const handle of now.waiting_for) {
        if (handle === human) continue;
        this.table.fallbacks += 1;
        this.table.log("fallback", `${handle} gives no word on the road card: goes with the others (${choice})`, handle, { cause: this.causeOf(handle) });
        await send(this.table, handle, { cmd: "choose_card", actor: handle, choice }, () => `went with the others: ${choice}`);
      }
    }
    if (owner !== undefined) await this.ownerCard(card.id, owner);
    this.cardAsked.set(card.id, this.table.engine.logHead);
    return true;
  }

  /**
   * A player owner's call on a caravan card, once every Blade has advised (S2): the human owner is
   * asked as on any card, an AI owner is woken; an owner who gives no word goes with the advice.
   */
  private async ownerCard(id: string, owner: Handle): Promise<void> {
    const ready = async () => {
      const now = (await this.dmWorld())?.card;
      return now && now.id === id && now.waiting_for.length === 0 && !this.table.ended ? now : undefined;
    };
    let now = await ready();
    if (!now) return;
    const human = this.table.human;
    const agent = this.agents.get(owner);
    if (owner === human) {
      await this.humanCard(now, true);
    } else if (agent) {
      await this.aiCard(agent, "Make the caravan's call with choose_card, with a choice id. Say why in one line with say, if your character would.", true);
    }
    now = await ready();
    if (!now) return;
    const { choices, preset } = cardChoices(now);
    const choice = choices[preset - 1].about!.id;
    this.table.fallbacks += 1;
    this.table.log("fallback", `${owner} makes no call on the road card: goes with the Blades' advice (${choice})`, owner, { cause: this.causeOf(owner) });
    await send(this.table, owner, { cmd: "choose_card", actor: owner, choice }, () => `went with the advice: ${choice}`);
  }

  /**
   * An AI player's word on a road card, from its own view of the card (design §1.7). Its
   * `own_move` words go to the DM once the wake returns; when they make no move, it is asked once
   * more, with the DM's answer, for a `choose_card`, before the loop's fallback.
   */
  private async aiCard(agent: PlayerAgent, ask: string, owner = false): Promise<void> {
    const handle = agent.handle;
    const tools = this.tools.get(handle)!;
    this.table.resetRetries(handle);
    const card = await this.playerCard(handle);
    if (!card) return;
    tools.takeOwnMove();
    await this.wakePlayer(agent, "card", await this.playerBriefing(handle, ...cardLines(card, owner), ask));
    const said = tools.takeOwnMove();
    if (!said) return;
    // A seat that also gave its word has spoken: its words were only said aloud.
    if (said.chose) return void (await this.table.declare(handle, said.words));
    const answered = await this.cardWords(handle, said.words);
    if (answered.made) return;
    const now = await this.playerCard(handle);
    // A Blade is asked again while the card waits for it; an owner, while the card waits for its call.
    const waits = owner ? now?.text === card.text && now.waiting_for.length === 0 : now?.waiting_for.includes(handle);
    if (!now || !waits || this.table.ended) return;
    this.table.resetRetries(handle);
    const answer = answered.answer;
    await this.wakePlayer(
      agent,
      "card",
      await this.playerBriefing(handle, ...(answer ? [`The DM answered your words: ${answer}`] : []), ...cardLines(now, owner), "Your words made no choice of the card. Give your word with choose_card, with a choice id."),
    );
    // Words a second time are only said aloud: the card wants a choice now.
    const again = tools.takeOwnMove();
    if (again) await this.table.declare(handle, again.words);
  }

  /** The road card as `handle` sees it (Rule 3: an AI player's briefing comes from its own view). */
  private async playerCard(handle: Handle): Promise<CardPlayer | undefined> {
    const r = this.table.observe(await this.table.engine.request(handle, { cmd: "get_state" }));
    return r.result?.cmd === "get_state" && r.result.state.view === "player" ? (r.result.state.world?.card ?? undefined) : undefined;
  }

  /**
   * A player's own words on the road card (API-56, design §1.1, §1.8): said aloud, then one
   * `card_words` wake, in which the DM makes them an own move on the card or only answers them.
   * Engine lines wait under the DM's narration, so a roll from a move that decided the card at once
   * never shows above it. Returns whether an own move went on the card.
   */
  private async cardWords(handle: Handle, words: string): Promise<{ made: boolean; answer?: string }> {
    const said = await this.table.declare(handle, words);
    if (!said.ok) return { made: false };
    const card = (await this.dmWorld())?.card;
    if (!card || this.table.ended) return { made: false };
    // The engine takes an own move's words as said only when they reach every player cleanly.
    const movable = !/(^|[^A-Za-z0-9])(AC|DC) \d/.test(words);
    await this.table.flush();
    const head = this.table.engine.logHead;
    this.dmTools.cardWords = { actor: handle, words: cutAtWord(words, OWN_MOVE_MAX_CHARS) };
    this.dmTools.ownMoveMade = false;
    this.dmTools.cardAnswer = undefined;
    this.table.hold = (e) => e.seq > head;
    try {
      await this.wakeDm(
        "card_words",
        undefined,
        `A player's words on the road card: ${handle} says or does: "${words}"`,
        cardDrawnLine(card),
        movable
          ? "If the words are a move, call own_move_or_answer with the check they call for, two different choices for success and failure, and your narration. If no two choices fit, give only the narration, one or two sentences, and the card waits. Answer the attempt only, never how it turns out."
          : "These words can't go on the card as they are said: call own_move_or_answer with your narration only, one or two sentences, and the card waits.",
      );
    } finally {
      this.table.hold = undefined;
      this.dmTools.cardWords = undefined;
    }
    await this.table.flush();
    const made = this.dmTools.ownMoveMade;
    const answer = this.dmTools.cardAnswer;
    // The run report counts words a card took no move from (design §1.8).
    if (!made) this.table.log("system", `no fitting choice: ${handle}'s words on the road card ${card.id} made no own move`, "table");
    return { made, ...(answer ? { answer } : {}) };
  }

  /**
   * The human's word on a road card (design: the human seat): a number (no Enter: AGT-101, Stas
   * 2026-11-11), or their own words (AGT-99), which the DM may make an
   * own move on the card. As a Blade the human speaks first (AGT-87); as the caravan's owner they
   * call last.
   */
  private async humanCard(card: CardDm, owner = false): Promise<void> {
    const human = this.human;
    const words = this.words;
    // The card's words once; after words said at the table only the choices again (AGT-96).
    let showCard = true;
    for (;;) {
      if (this.table.ended) return;
      // The card's words in the run's language, as the seat read them from its deck (AGT-98).
      const seat = this.table.cardOnSeat;
      const seen = seat?.id === card.id ? seat : undefined;
      const shown = { ...card, text: seen?.text ?? card.text, choices: card.choices.map((c) => ({ ...c, text: seen?.choices.get(c.id) ?? c.text })) };
      const { choices } = cardChoices(shown, words, human, this.table.names);
      if (showCard) this.table.show({ kind: "info", title: words.onTheRoad, text: [shown.text, owner ? words.yourCaravan : card.target === "caravan" ? words.merchantDecides : words.bladesDecide].join("\n") });
      showCard = false;
      this.table.show({ kind: "options", title: words.choicesTitle, lines: [...choiceLines(choices), ...(card.own_move ? [] : [words.ownMoveLine])], choices });
      const intent = await this.ask({ kind: "card", line: words.cardPrompt });
      if (!intent) return;
      if (intent.kind === "option") {
        const picked = choices.find((c) => c.number === intent.number);
        if (!picked) {
          this.table.show({ kind: "info", title: words.noSuchNumber, text: words.stillWaits(choices.length) });
          continue;
        }
        const outcome = await send(this.table, human, { cmd: "choose_card", actor: human, choice: picked.about!.id }, () => "your word is given");
        if (!outcome.ok) {
          await this.humanRejected(outcome);
          showCard = true;
          continue;
        }
        this.table.log("intent", `${human} on the road card: ${picked.label}`, human);
        this.table.tellDm(`${human} ${owner ? "made the caravan's call" : "gave their word"} on the road card: ${picked.label}`);
        return;
      }
      if (intent.kind === "text") {
        // Words on the card: the DM makes them an own move, the human's word, or answers them in
        // the scene and the card still waits for a choice (AGT-96, AGT-99).
        if ((await this.cardWords(human, intent.text)).made) {
          this.table.log("intent", `${human} on the road card: own move "${intent.text}"`, human);
          return;
        }
        card = (await this.dmWorld())?.card ?? card;
        this.table.show({ kind: "info", title: words.saidAtTable, text: words.stillWaits(choices.length) });
        continue;
      }
      this.table.show({ kind: "info", title: words.onTheRoad, text: words.stillWaits(choices.length) });
    }
  }

  /**
   * The human's level-up, one choice at a time (design: level-up in plain words): the recommended
   * pick in one line first, which Enter takes, then each option with its summary. A choice that
   * wants several picks takes them one number at a time.
   */
  private async humanLevelUp(promptId: string): Promise<void> {
    const human = this.human;
    let choice = this.levelChoice?.prompt_id === promptId ? this.levelChoice : undefined;
    if (!choice) {
      // The engine gives the open choice again on a second level_up (an AI tool or a refusal lost it).
      const again = await send(this.table, human, { cmd: "level_up", actor: human }, () => "the open choice");
      choice = again.ok ? ((again.data as { choice?: LevelUpChoice | null } | undefined)?.choice ?? undefined) : undefined;
      if (!choice || choice.prompt_id !== promptId) return this.answerLevelUp(human, promptId, []);
    }
    const picked: string[] = [];
    for (;;) {
      if (this.table.ended) return;
      const choices = levelUpChoices(choice, picked, this.talk);
      const more = choice.picks - picked.length;
      this.table.show({
        kind: "options",
        title: this.words.levelTitle(choice.level, this.table.names.thing(choice.label, this.table.names.language === "ru" ? "выбор" : choice.label), choice.picks > 1 ? more : undefined),
        lines: choiceLines(choices),
        choices,
        preset: 1,
      });
      const intent = await this.ask({ kind: "level_up" });
      if (!intent) return;
      if (intent.kind !== "option") {
        this.table.show({ kind: "info", title: this.words.levelUp, text: this.words.levelUpHint });
        continue;
      }
      const at = choices.find((c) => c.number === intent.number);
      if (!at) {
        this.table.show({ kind: "info", title: this.words.noSuchNumber, text: this.words.pickRange(choices.length) });
        continue;
      }
      if (at.about!.id === "recommended") return this.answerLevelUp(human, promptId, [], choice);
      picked.push(at.about!.id);
      if (picked.length >= choice.picks) return this.answerLevelUp(human, promptId, picked, choice);
    }
  }

  /**
   * An AI player left its level-up open (a failed wake): the engine takes the recommended picks for
   * it. Straight to the engine, as the combat fallbacks go: a seat that spent its retries on bad
   * picks has no budget left for the tools, and the choice must still close.
   */
  private async recommendedLevelUp(handle: Handle, promptId: string): Promise<void> {
    this.table.fallbacks += 1;
    this.table.log("fallback", `${handle} left a level-up choice open: the recommended pick`, handle, { cause: this.causeOf(handle) });
    const response = await this.table.engine.request(handle, { cmd: "answer_level_up", actor: handle, prompt_id: promptId, picks: [] });
    this.table.observe(response);
    if (!response.ok) throw new Error(`${handle}'s level-up won't take its recommended pick: ${response.error?.message}`);
    await this.settle();
  }

  /** Sends one level-up answer as `handle`'s own viewer; empty `picks` takes the recommended. */
  private async answerLevelUp(handle: Handle, promptId: string, picks: string[], choice?: LevelUpChoice): Promise<void> {
    const outcome = await send(this.table, handle, { cmd: "answer_level_up", actor: handle, prompt_id: promptId, picks }, () => "answered");
    if (handle === this.table.human) {
      if (!outcome.ok) {
        this.levelChoice = undefined;
        // The choice stays open and is asked again (step), its words fetched anew.
        await this.humanRejected(outcome);
        return;
      }
      this.levelChoice = (outcome.data as { choice?: LevelUpChoice | null } | undefined)?.choice ?? undefined;
      const names = new Map(choice?.options.map((o) => [o.id, o.name]) ?? []);
      const took = picks.length > 0 ? picks.map((id) => names.get(id) ?? id).join(", ") : "the recommended";
      this.table.log("intent", `${handle} levels up: ${took}`, handle);
      if (!this.levelChoice) this.table.tellDm(`${handle} reached a new level.`);
    } else if (!outcome.ok) {
      throw new Error(`${handle}'s level-up won't take its recommended pick: ${outcome.text}`);
    }
    await this.settle();
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
    this.table.show({ kind: "status", text: this.words.yourTurn });
    const since = this.table.engine.logHead;
    await this.offerChoices(true);
    while (!this.table.ended && (await this.sameTurn(human, since))) {
      const intent = await this.ask(this.shown === this.top ? { kind: "combat_turn" } : { kind: "pick" });
      if (!intent) break;
      if (intent.kind === "back") {
        this.back(true);
        continue;
      }
      if (intent.kind === "option") {
        const picked = await this.pick(intent.number);
        if (picked === undefined) continue;
        const outcome = await this.humanAct(picked.act);
        if (!outcome.ok) await this.humanRejected(outcome);
        if (await this.sameTurn(human, since)) await this.offerChoices(true);
      } else if (intent.kind === "text") {
        await this.mapHumanWords(intent.text, since);
      } else {
        this.table.show({ kind: "info", title: this.words.nothingToReact, text: this.words.pickOrSay });
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
      this.table.show({ kind: "info", title: this.words.noSuchNumber, text: this.words.noSuchOnList(number) });
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

  /**
   * Leaves a follow-up pick for the options it came from (AGT-48 Q5): shown again as they were,
   * with the turn's budget in a fight. No engine call: the list on screen is still the turn's.
   */
  private back(combat: boolean): void {
    if (this.shown === this.top) return;
    this.shown = this.top;
    const budget = combat ? (this.lastOptions?.budget ?? undefined) : undefined;
    this.table.show({ kind: "options", lines: choiceLines(this.top), choices: this.top, ...(budget ? { budget } : {}) });
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
      case "travel":
        outcome = await send(this.table, human, { cmd: "travel", actor: human, pace: act.pace, ...(act.to ? { to: act.to } : {}) }, () => "the caravan moves on");
        break;
      case "rest_night":
        outcome = await send(this.table, human, { cmd: "rest_night", actor: human, where: act.where }, () => "the night passes");
        break;
      case "scout":
        outcome = await send(this.table, human, { cmd: "scout", actor: human }, () => "you walk ahead of the caravan as the scout");
        break;
      case "level_up":
        outcome = await send(this.table, human, { cmd: "level_up", actor: human }, () => "the new level starts");
        if (outcome.ok) this.levelChoice = (outcome.data as { choice?: LevelUpChoice | null } | undefined)?.choice ?? undefined;
        break;
    }
    // The human sees their own action's lines at once. What follows their turn (the monsters'
    // turns, a fight's end) waits for the DM to narrate the turn first.
    await this.table.flush((e) => e.kind === "combat_over" || (e.kind === "turn_end" && e.actor === human));
    // The engine's line says only that the character moved: a walk that stopped short says so.
    const moved = outcome.ok ? (outcome.data as { cmd?: string; reached?: boolean } | undefined) : undefined;
    if (moved?.cmd === "move" && moved.reached === false) {
      const walk = moved as { moved_ft?: number; provoked?: string[]; taken?: boolean };
      const text = this.table.names.language === "en" ? `You ${outcome.text}.` : this.words.movedShort(Math.round(walk.moved_ft ?? 0), this.table.names.list(walk.provoked ?? []), walk.taken === true);
      this.table.show({ kind: "info", title: this.words.stoppedShort, text });
    }
    return outcome;
  }

  private async humanRejected(outcome: ToolOutcome): Promise<void> {
    this.table.humanRejections += 1;
    const error = outcome.data as { message?: string; code?: ErrorCode; reason?: RejectReason | null } | undefined;
    const message = error?.message ?? outcome.text;
    this.table.log("retry", `${this.human}'s choice was not accepted: ${message}`, this.human, { decision: this.humanDecision() });
    this.table.show({ kind: "info", title: this.words.notAccepted, text: this.table.names.language === "en" ? message : error ? refusedRu(error.code, error.reason ?? undefined) : this.words.notNow });
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
      this.table.show({ kind: "info", title: this.words.notUnderstood, text: this.words.notUnderstoodText });
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
    const options = await tools.legalActions(agent.described);
    const briefing = await this.playerBriefing(handle, "It is your turn in the fight. Your options:", options.text, "Act with your tools: usually one submit_decision with end_turn: true.");
    const since = this.table.engine.logHead;
    const chance = await this.liftsAtStart(handle, options);
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
    if (chance) {
      const r = await this.table.engine.request("dm", { cmd: "events", since });
      const events = r.result?.cmd === "events" ? r.result.events : [];
      this.liftChances.push({ handle, ...chance, ...turnOutcome(events, handle, chance.fallen) });
    }
    await this.narrateNew(handle);
  }

  /**
   * The fallen allies an AI player's combat turn begins with, and the lifts its options can reach
   * on them; undefined when there is none (hands-and-check spec A3-M). Read in the DM's view, for
   * the report only: nothing here reaches the player.
   */
  private async liftsAtStart(
    handle: Handle,
    options: ToolOutcome,
  ): Promise<Omit<LiftChance, "handle" | "lifted" | "did"> | undefined> {
    const listed = options.ok ? (options.data as LegalActionsResult | undefined) : undefined;
    if (!listed?.options.some(lifts)) return undefined;
    const r = await this.table.engine.request("dm", { cmd: "get_state" });
    const state = r.result?.cmd === "get_state" ? r.result.state : undefined;
    if (state?.view !== "dm") return undefined;
    const fallen = state.creatures.filter((c) => c.side === "party" && c.handle !== handle && isFallen(c.life_state)).map((c) => c.handle);
    const reach: Lift[] = liftsOn(listed.options, fallen, listed.budget);
    if (reach.length === 0) return undefined;
    return { at: new Date().toISOString(), scene: this.scenes.at(-1) ?? "", fallen, lifts: reach };
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
    const ru = this.table.names.language === "ru";
    const to = reactingTo(a.trigger.summary);
    this.table.show({
      kind: "reaction",
      summary: ru ? `можно ответить${to ? `: ${this.table.names.who(to)}` : ""}.` : a.trigger.summary,
      options: a.options.map((o) => (ru ? this.table.names.option(o.option_id, o.name) : o.name)),
    });
    let intent = await this.ask({ kind: "reaction" });
    // A number that isn't one of the reactions shown asks again: it never takes another one.
    while (intent?.kind === "option" && !a.options[intent.number - 1]) {
      this.table.show({ kind: "info", title: this.words.noSuchReaction, text: this.words.noSuchReactionText(intent.number, a.options.length) });
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
        { number: 1, label: this.words.acceptSurrender(this.table.names.list(handles)) },
        { number: 2, label: this.words.fightOn },
      ];
      this.table.show({ kind: "options", title: this.words.surrender, lines: choiceLines(choices), choices });
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
        this.table.show({ kind: "info", title: this.words.surrender, text: this.words.surrenderHint });
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

  /**
   * The DM said the party moves on or settles for the night (AGT-80, `propose_road`); the DM never
   * moves the caravan or ends the day (design S2), so whoever drives it is asked: the human when they
   * drive, with the road's lines for that step and Enter on the one proposed; else the AI player who
   * owns the caravan, or the first AI player when an NPC owns it. "Not yet" goes back to the DM. The
   * leg or night that follows is told on the next step, as when a driver picks it from the options.
   */
  private async answerRoad(): Promise<void> {
    const { step } = this.table.road!;
    this.table.road = undefined;
    if (this.table.inCombat || !this.campaign) return;
    const owner = (await this.dmWorld())?.caravan.owner;
    if (owner === undefined) return;
    const human = this.table.human;
    const npcOwned = owner.includes(":");
    const rest = step !== "move_on";
    if (human && (owner === human || npcOwned)) {
      const state = await this.humanState();
      if (state?.view !== "player" || !state.world?.drives) return;
      // Moving on, a Hired Blade may also walk ahead as the scout first (AGT-90).
      const lines = roadChoices(state.world, 1, human, this.talk).filter((c) => (rest ? c.act?.kind === "rest_night" : c.act?.kind === "travel" || c.act?.kind === "scout"));
      if (!lines.some((c) => c.act?.kind !== "scout")) {
        this.table.tellDm(`${human} can't ${rest ? "end the day" : "move the caravan on"} now: nothing on the road offers it. Go on in fiction.`);
        return;
      }
      const numbered = (from: Choice[]): Choice[] => [...from.map((c, i) => ({ ...c, number: i + 1 })), { number: from.length + 1, label: this.words.notYet }];
      let choices = numbered(lines);
      const preset = (choices.findIndex((c) => c.act?.kind === "rest_night" && c.act.where === step) + 1) || 1;
      // The human has seen *Walk ahead as the scout*: the AI Blades may scout now.
      if (lines.some((c) => c.act?.kind === "scout")) this.table.scoutOffered = true;
      await this.table.flush();
      for (;;) {
        if (this.table.ended) return;
        // The line Enter takes ends in the mark (AGT-101).
        const lines = choiceLines(choices.map((c) => (c.number === preset ? { ...c, label: `${c.label} ${this.words.marked}` } : c)));
        this.table.show({ kind: "options", title: rest ? this.words.theNight : this.words.theRoad, lines, choices, preset });
        const intent = await this.ask({ kind: "road" });
        if (!intent) return;
        // A line's own text typed out is that line, as in the round's options.
        const typed = intent.kind === "text" ? choices.find((c) => c.label.toLowerCase() === intent.text.trim().replace(/[.!]+$/, "").toLowerCase()) : undefined;
        const picked = intent.kind === "option" ? choices.find((c) => c.number === intent.number) : typed;
        if (!picked) {
          this.table.show({ kind: "info", title: rest ? this.words.theNight : this.words.theRoad, text: this.words.pickOrEnter(choices.length) });
          continue;
        }
        if (!picked.act) {
          this.table.log("intent", `${human} picked: not yet`, human);
          this.table.tellDm(`${human} says not yet: ${rest ? "the party stays up" : "the caravan stays where it is"}. Go on from there.`);
          return;
        }
        const outcome = await this.humanAct(picked.act);
        if (!outcome.ok) {
          await this.humanRejected(outcome);
          continue;
        }
        this.table.log("intent", `${human} picked: ${picked.label}`, human);
        this.table.tellDm(`${human} took an option: ${picked.label}`);
        // Walking ahead isn't moving on: the road asks again, without the scout line.
        if (picked.act.kind === "scout") {
          choices = numbered(choices.filter((c) => c.act !== undefined && c.act.kind !== "scout"));
          continue;
        }
        return;
      }
    }
    const driver = npcOwned ? this.table.players[0] : owner;
    const agent = driver === undefined ? undefined : this.agents.get(driver);
    if (!agent) return;
    this.table.resetRetries(agent.handle);
    const ask = rest
      ? `The party is settling down for the night, as the DM tells it. You drive the caravan: end the day with rest_night with where ${step}, or say in one line with say why your character keeps going.`
      : "The party is ready to move on, as the DM tells it. You drive the caravan: move it on with travel, or say in one line with say why your character waits.";
    await this.wakePlayer(agent, "road", await this.playerBriefing(agent.handle, ask));
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
    if (this.journeyEnd === "last_turn") this.journeyEnd = "closing";
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
      ...waitingLine(this.carried),
    );
    await this.grantedActions();
    await this.settle();
  }

  /**
   * Words that name a line on screen are that line: the line's own text, typed out, or its number
   * while the DM's question is open (an answer is words otherwise, so a number there would reach the
   * DM as text and the line would never be taken). Only the lines the human was shown count.
   */
  private typedOption(intent: PlayerIntent): PlayerIntent {
    if (intent.kind !== "text") return intent;
    const text = intent.text.trim().replace(/[.!]+$/, "").toLowerCase();
    const byNumber = this.table.question && /^\d+$/.test(text) ? this.shown.find((c) => c.number === Number(text)) : undefined;
    const byLabel = this.shown.find((c) => c.label.toLowerCase() === text);
    const line = byNumber ?? byLabel;
    return line ? { kind: "option", number: line.number } : intent;
  }

  private async exploreRoundBody(human: Handle): Promise<void> {
    await this.table.flush();
    this.top = this.shown = [];
    let line = "";
    for (;;) {
      const asked = await this.ask(this.table.question ? { kind: "answer" } : this.shown !== this.top ? { kind: "pick" } : { kind: "explore" });
      if (!asked) return;
      const intent = this.typedOption(asked);
      if (intent.kind === "text") {
        this.table.question = undefined;
        await this.table.declare(human, intent.text);
        line = intent.text;
        break;
      }
      if (intent.kind === "back") {
        this.back(false);
        continue;
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
        // The road's own lines move the day on: the scene, the night or the card that follows is told next.
        // A level-up asks its own choices next.
        if (picked.act.kind === "travel" || picked.act.kind === "rest_night" || picked.act.kind === "level_up") return;
        line = picked.label;
        break;
      }
      this.table.show({ kind: "info", title: this.words.nothingToReact, text: this.words.sayOrOptions });
    }
    if (!this.paused) await this.talkRound(line);
    await this.wakeDm(
      "table_turn",
      undefined,
      "The table has spoken (above). Resolve it: call checks and moves, grant AI players their own options, answer in fiction, or ask the human a question. Then narrate.",
      ...waitingLine(this.carried),
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
    const named = [...new Set([...byName, ...this.carried.keys(), ...handOff(this.table.takeAddresses(), [], handles, true).carried])];
    this.carried = new Map();
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
    const carried = new Map<Handle, Handle[]>();
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
      for (const handle of after.carried) {
        const from = addresses.filter((a) => a.to === handle && a.from !== handle).map((a) => a.from);
        carried.set(handle, [...new Set([...(carried.get(handle) ?? []), ...from])]);
      }
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
      carried: [...carried.keys()],
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
      const options = await this.tools.get(handle)!.legalActions(agent.described);
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
    // One suggestion call per prompt: a slash command answered meanwhile keeps the picker.
    let offered = this.offerSuggestions(prompt);
    let intent: PlayerIntent | undefined;
    try {
      for (;;) {
        if (this.table.ended) return undefined;
        intent = await this.seat.ask(prompt);
        if (intent.kind === "text" || intent.kind === "option") {
          this.table.recordInput(this.human, JSON.stringify(intent), true);
        }
        if (intent.kind !== "command") return intent;
        // A level-up shows its own list: `/options` goes back to it, never to the round's options.
        if (intent.name === "options" && prompt.kind === "level_up") return intent;
        this.seat.answering?.(true);
        try {
          await this.command(intent.name);
        } finally {
          this.seat.answering?.(false);
        }
        // `/suggest` just turned them off, or on again.
        if (intent.name === "suggest" && offered && !this.suggestOn) {
          this.closeSuggestions(offered, undefined);
          offered = undefined;
        } else if (intent.name === "suggest" && !offered) offered = this.offerSuggestions(prompt);
        if (prompt.kind === "paused" && !this.paused) return undefined;
      }
    } finally {
      if (offered) this.closeSuggestions(offered, intent);
    }
  }

  /**
   * Starts a suggestion call for an open prompt out of combat (AGT-49), when the run has a
   * suggester, the seat shows suggestions and `/suggest` hasn't turned them off. The rows reach the
   * seat when they come, unless the prompt was answered first. Returns the call, or undefined.
   */
  private offerSuggestions(prompt: HumanPrompt): { done: Promise<void>; shown: boolean; open: boolean } | undefined {
    const suggester = this.suggester;
    const seat = this.table.seat;
    // A surrender offer comes during a fight, out of the turn order: it is the one prompt in combat with suggestions.
    const fighting = this.table.inCombat && prompt.kind !== "surrender";
    if (!suggester || !seat?.suggest || !this.suggestOn || fighting || !SUGGESTED.has(prompt.kind)) return undefined;
    const offered = { done: Promise.resolve(), shown: false, open: true };
    seat.suggest({ kind: "waiting", cancel: () => suggester.cancel() });
    // One call at a time: the one before, already cancelled, ends first.
    const before = this.suggesting;
    offered.done = (async () => {
      await before;
      if (!offered.open) return;
      const briefing = await this.suggestBriefing(prompt);
      // Answered while the briefing was read: no call at all.
      if (!offered.open) return;
      this.table.recordInput(this.human, briefing);
      // The rows face the human as their own words: a number or a game term from the sheet in any
      // row (an AC, a DC) drops them all, as the speech guard drops a player's line.
      const drafted = await suggester.suggest(briefing);
      const rows = drafted?.some((row) => this.table.guarded(row) !== undefined) ? undefined : drafted;
      if (!offered.open) return;
      if (rows) {
        offered.shown = true;
        this.suggestions.shown += 1;
        seat.suggest!({ kind: "rows", rows });
      } else seat.suggest!({ kind: "none" });
    })().catch((error: unknown) => {
      // No suggestions, and nothing on screen. A plan limit stops the run as any model call's
      // does; the table ends once the human's line is in.
      if (offered.open) seat.suggest!({ kind: "none" });
      if (stopsTheRun(error)) this.table.end(error.message, stopOf(error));
    });
    this.suggesting = offered.done;
    return offered;
  }

  /**
   * The prompt is answered: the call in flight is cancelled, never waited for, and a sent line is
   * counted (S4).
   */
  private closeSuggestions(offered: { done: Promise<void>; shown: boolean; open: boolean }, intent: PlayerIntent | undefined): void {
    offered.open = false;
    this.suggester?.cancel();
    this.table.seat?.suggest?.({ kind: "none" });
    if (!offered.shown || intent?.kind !== "text") return;
    if (!intent.suggestion) this.suggestions.own += 1;
    else if (intent.suggestion.edited) this.suggestions.edited += 1;
    else this.suggestions.unchanged += 1;
  }

  /**
   * What the suggester reads (AGT-49, Rule 3): the human's own sheet, state and options, projected
   * for the human's viewer as an AI player for the character would get them, and the story lines
   * the human was shown. The call writes it to the inputs, where the audit's leak scan reads it.
   */
  private async suggestBriefing(prompt: HumanPrompt): Promise<string> {
    const human = this.human;
    const sheet = this.table.observe(await this.table.engine.request(human, { cmd: "get_sheet", actor: human }));
    const state = await this.humanState();
    const listed = this.table.observe(await this.table.engine.request(human, { cmd: "legal_actions", actor: human }));
    const briefing = [
      "Your character sheet:",
      sheet.result?.cmd === "get_sheet" ? formatSheet(sheet.result.sheet) : "(not available)",
      "",
      "Where you are:",
      state ? formatState(state) : "(not available)",
      ...(listed.result?.cmd === "legal_actions" ? ["", "What the rules let you do now:", formatOptions(listed.result as LegalActionsResult)] : []),
      "",
      "What happened at the table lately:",
      ...(this.table.heard.length > 0 ? this.table.heard : ["(nothing yet)"]),
      "",
      prompt.kind === "answer"
        ? "The DM asked you the question above: suggest three different answers."
        : prompt.kind === "surrender"
          ? "Your foes offer to surrender: suggest three different things to do or say."
          : "What could your character do or say now? Three different ideas.",
    ].join("\n");
    return briefing;
  }

  private async command(name: "sheet" | "where" | "map" | "options" | "log" | "usage" | "pause" | "suggest" | "quit"): Promise<void> {
    const human = this.human;
    switch (name) {
      case "sheet": {
        const r = this.table.observe(await this.table.engine.request(human, { cmd: "get_sheet", actor: human }));
        this.table.show({ kind: "info", title: this.words.sheet, text: r.result?.cmd === "get_sheet" ? (this.table.names.language === "en" ? formatSheet(r.result.sheet) : sheetRu(r.result.sheet, this.table.names)) : this.table.names.language === "en" || !r.error ? (r.error?.message ?? "") : refusedRu(r.error.code, undefined) });
        return;
      }
      case "where": {
        const state = await this.humanState();
        this.table.show({ kind: "info", title: this.words.where, text: state ? (this.table.names.language === "en" ? formatState(state) : stateRu(state, this.table.names)) : "" });
        return;
      }
      case "map": {
        // The human's own world view only (AGT-79): the places they know and the roads between them.
        const state = await this.humanState();
        const world = state?.view === "player" ? state.world : undefined;
        this.table.show({ kind: "info", title: this.words.map, text: world ? (this.table.names.language === "en" ? mapLines(world) : mapLinesRu(world, this.table.names)).join("\n") : this.words.noMap });
        return;
      }
      case "options":
        if (this.isTurnOf(human)) {
          this.shown = this.top;
          this.table.show({ kind: "options", lines: choiceLines(this.top), choices: this.top });
        } else if (this.table.inCombat) {
          this.table.show({ kind: "info", title: this.words.options, text: this.words.notYourTurn });
        } else {
          await this.offerChoices(false);
          this.table.show({ kind: "info", title: this.words.options, text: this.words.optionsHint });
        }
        return;
      case "log":
        this.table.show({ kind: "info", title: this.words.log, text: this.table.recent.join("\n") });
        return;
      case "usage":
        // Usage isn't game state, and no player view: it reaches the human's screen alone (M10 U1).
        this.table.show({ kind: "info", title: this.words.usage, text: usageBlock(this.usage?.records ?? []).join("\n") });
        return;
      case "pause":
        this.paused = !this.paused;
        this.table.log("system", this.paused ? "paused" : "resumed", human);
        this.table.show({ kind: "status", text: this.paused ? this.words.pausedStatus : this.words.resumed });
        return;
      case "suggest":
        this.suggestOn = !this.suggestOn;
        this.table.log("system", this.suggestOn ? "suggestions on" : "suggestions off", human);
        this.table.show({ kind: "status", text: this.suggestOn ? this.words.suggestOn : this.words.suggestOff });
        return;
      case "quit":
        this.table.end("the human quit", "operator");
        return;
    }
  }

  /** While paused and an AI player is next, the table waits on the human (spec §3.4). */
  private async waitWhilePaused(): Promise<void> {
    this.table.show({ kind: "status", text: this.words.pausedWait });
    while (this.paused && !this.table.ended) {
      const intent = await this.ask({ kind: "paused" });
      if (intent) this.table.show({ kind: "info", title: this.words.paused, text: this.words.pausedOnly });
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
    const situation = seen ? situationOf(seen, turn, turn === this.table.human ? options : undefined, this.table.names) : undefined;
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
    const state = combat || this.situation || this.campaign ? await this.humanState() : undefined;
    if (!listed.ok || listed.result?.cmd !== "legal_actions") {
      this.top = this.shown = [];
      this.table.show({ kind: "info", title: this.words.options, text: this.table.names.language === "en" ? (listed.error?.message ?? this.words.noOptions) : this.words.noOptions });
      return;
    }
    this.lastOptions = listed.result as LegalActionsResult;
    this.top = this.shown = buildChoices(this.lastOptions, combat ? state : undefined, combat, this.talk);
    // Out of a fight, whoever may drive the caravan can move it on or end the day (AGT-80).
    if (!combat && state?.view === "player" && state.world) {
      const road = roadChoices(state.world, this.top.length + 1, human, this.talk);
      // The human has seen *Walk ahead as the scout*, or isn't a Blade: the AI Blades may scout now (AGT-90).
      if (road.length > 0) this.table.scoutOffered = true;
      this.top = this.shown = [...this.top, ...road];
    }
    // Out of a fight, the next level when the sheet says it is due (AGT-80): a saved party can reach it in any pack.
    if (!combat) {
      const sheet = this.table.observe(await this.table.engine.request(human, { cmd: "get_sheet", actor: human }));
      if (sheet.result?.cmd === "get_sheet" && sheet.result.sheet.xp?.can_level_up) {
        this.top = this.shown = [...this.top, { number: this.top.length + 1, label: this.words.levelUpLine((sheet.result.sheet.level ?? 0) + 1), act: { kind: "level_up" }, about: { id: "level_up" } }];
      }
    }
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
    const done = this.waitFor(this.table.names.language === "en" ? `${agent.handle} is thinking` : UI_WORDS.ru.thinking(this.table.names.person(agent.handle)));
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
    // So is a road step it proposed (AGT-80): whoever drives the caravan takes it, or not yet.
    if (this.table.road && !this.table.ended) await this.answerRoad();
    return said;
  }

  private async wakeDmOnce(wake: DmWake, events: Event[] | undefined, ...lines: string[]): Promise<string | void> {
    this.table.resetRetries("dm");
    this.dmTools.startWake();
    this.dmWakeFailed = false;
    this.table.dmWake = wake;
    this.table.wakeNarrated = false;
    const heard = this.table.drainDmInbox();
    let told = events;
    if (!told) {
      told = [...this.dmBacklog, ...tellable(await this.table.engine.newEvents("dm", "brief"), this.table.deaths)];
      this.dmBacklog = [];
    }
    // A narration's facts (M10 P2, P3): who stands within reach of whom, and who moved in its lines.
    const facts = wake === "narrate" || wake === "combat_over" ? [...(await this.reachLine()), movedLine(told)] : [];
    const briefing = [
      ...(heard.length > 0 ? ["What the table said:", ...heard] : []),
      ...(told.length > 0 ? ["What happened:", ...told.map(eventLine)] : []),
      ...lines,
      ...facts,
    ].join("\n");
    const done = this.waitFor(UI_WORDS[this.table.names.language].dmThinking);
    try {
      const said = await this.dm.wake(wake, briefing, this.dmTools);
      this.online();
      if (this.table.exhausted("dm")) {
        this.table.fallbacks += 1;
        this.table.log("fallback", `the DM's retries ran out (${wake}); the engine lines stand alone`, "dm", { cause: "retries", wake, narrated: this.table.wakeNarrated });
      }
      return said;
    } catch (error) {
      if (stopsTheRun(error)) throw error;
      this.offline(error);
      const narrated = this.table.wakeNarrated;
      const why = error instanceof TurnTimeout ? "timed out" : `failed: ${error instanceof Error ? error.message : String(error)}`;
      this.table.log("error", `dm (${wake}) ${why}`, "dm", { wake, narrated });
      this.dmWakeFailed = true;
      // A wake cut after its narration was shown was not skipped (AGT-97): the run report says so.
      const cut = error instanceof TurnTimeout && narrated;
      if (!cut) this.table.fallbacks += 1;
      const cause = cut ? "cut_after_narration" : this.table.exhausted("dm") ? "retries" : error instanceof TurnTimeout ? "timeout" : "error";
      // A pick that landed is not skipped: its card shows without an opening (AGT-100).
      const what = cut ? `the DM's ${wake} ran out of time after its narration` : wake === "pick" && this.dmTools.picked ? "the DM picked a road card but ran out of time before opening it; the card shows alone" : `the DM's ${wake} is skipped; the engine lines stand alone`;
      this.table.log("fallback", what, "dm", { cause, wake, narrated });
      return undefined;
    } finally {
      done();
      this.table.dmWake = undefined;
    }
  }

  /**
   * The adjacency line from the DM's state now; none when the state can't be read, so a failed
   * request for this extra fact never skips the wake's own fallback and cleanup.
   */
  private async reachLine(): Promise<string[]> {
    let r;
    try {
      r = await this.table.engine.request("dm", { cmd: "get_state" });
    } catch {
      return [];
    }
    const line = adjacencyLine(r.result?.cmd === "get_state" ? r.result.state : undefined);
    return line ? [line] : [];
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

/** A scene's opening while a road card from the way here is still to be played (AGT-100). */
export const CARD_AHEAD = "A road card met on the way here is played next, before the caravan arrives: keep this opening on the last stretch of road, with the place in sight, and do not bring the caravan in.";

/** How a wake opens a road card (AGT-100), in the pick wake and the card wake alike. */
const CARD_OPENING = "Open it in two to four sentences, on what the people in it do and want: do not retell the card's words, which the table shows next, and do not decide it or tell how a choice turns out. Narrate last.";

/** The engine's limit on an own move's words (API-56). */
const OWN_MOVE_MAX_CHARS = 300;

/** Words cut at a word to `max` characters (design §1.1): the transcript keeps them whole. */
export function cutAtWord(words: string, max: number): string {
  const chars = [...words.trim()];
  if (chars.length <= max) return chars.join("");
  const cut = chars.slice(0, max + 1).join("");
  const at = cut.lastIndexOf(" ");
  return (at > 0 ? cut.slice(0, at) : chars.slice(0, max).join("")).trimEnd();
}

/** A road card for an AI player's briefing: its words, whose call it is, the choices and what was said. */
function cardLines(card: CardPlayer, owner = false): string[] {
  const whose = owner
    ? "the caravan's, and the caravan is yours: you make the call after the Blades' advice"
    : card.target === "caravan"
      ? "the caravan's: the merchant decides, and your word is advice"
      : "the Blades': you vote, and most votes win";
  const move = card.own_move;
  return [
    `A road card waits for your word (${whose}): ${card.text}`,
    `Choices: ${card.choices.map((c) => `${c.id}: ${c.id === OWN_MOVE && move ? `${move.actor}'s own move, "${c.text}" (${move.skill})` : c.text}`).join(" | ")}`,
    ...(card.said.length > 0 ? [`Said so far: ${card.said.map((x) => `${x.actor} ${x.choice}`).join(", ")}.`] : []),
    ...(move ? [] : ["If none of these is what your character would do, say what they do with own_move, in one sentence."]),
  ];
}
