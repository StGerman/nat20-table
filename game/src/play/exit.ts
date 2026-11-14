// The Milestone 12 exit (AGT-103, design `docs/design/m12-system-design.md` §8): the verdict rows
// `m12-own-move`, `m12-order`, `m12-language` and `m12-readable`, the report's own-move section,
// and the seat replay that gives an all-AI run's Vera read the lines a seat would have drawn. Pure
// functions of the run folder, like the rest of the verdict.
import { existsSync } from "node:fs";
import path from "node:path";
import type { Event, Handle } from "@nat20-table/engine-client";
import { SESSION_LOG } from "../engine.ts";
import type { DmWake, TranscriptRecord } from "../table/types.ts";
import { SeatNames, seatLine, type CardOnSeat } from "../table/seat-lines.ts";
import { SEAT_WORDS, UI_WORDS } from "../table/words.ts";
import { waitedMs, percentile, type UsageRecord } from "../usage.ts";
import { readPack } from "../pack/read.ts";
import { seatCards, type CardRu } from "../pack/campaign.ts";
import { packOfRun, readLines, readRunRecord, type RunRecord } from "./record.ts";
import { seatRuNames } from "./run.ts";
import type { VerdictRow } from "./verdict.ts";

/** What the seat drew, one line a thing, in order (AGT-103, AGT-13): `{at, kind, text}`. */
export const SEAT_JSONL = "seat.jsonl";

export interface SeatRecord {
  at: string;
  /** The seat's `TableEvent` kind, or `command` for a command's answer (`/options`, `/sheet`). */
  kind: string;
  text: string;
}

/** The pair 3 numbers the report's p95 line stands against (M11 exit pair 3: the AI run's analysis and Stas's report). */
export const PAIR_3_P95_MS = { dm: { ai: 19_800, human: 21_473 }, player: { ai: 7_700, human: 7_017 } };

/** The wakes that settle on their narration (design §2): a cut after it there means AGT-97 is not fixed. */
const SETTLING_WAKES: readonly DmWake[] = ["road", "card", "pick", "card_words"];
/** The wakes whose narration frames a card. */
const FRAMING_WAKES: readonly DmWake[] = ["pick", "card"];

/** Key names the keyboard takes, which a Russian seat keeps Latin (design §4, Stas 2026-11-11), with `Ctrl+<letter>` chords. */
const KEY_NAMES = new Set(["Enter", "Esc", "Tab", "End", "Home", "PgUp", "PgDn", "Shift", "Ctrl", "Fn", "Option"]);

/** One own move put on a card, won or lost (design §8). A card may carry several: one per fall, then the one that ran (decision 0081). */
export interface OwnMoveMet {
  card: string;
  actor: Handle;
  words: string;
  skill: string;
  dc: number;
  success: string;
  /** The choice a failure brings; absent when the move named none (decision 0079). */
  failure?: string;
  /** This move's place on its card: 1 for the first, 2 for the one after a fall, and so on. */
  place: number;
  /** The moves before it on the card, each with its skill and the choice its success would bring. */
  earlier: Array<{ skill: string; success: string }>;
  /** Each seat's word on the card since the fall before this move, in order. */
  votes: Array<{ by: Handle; choice: string }>;
  /** The card's decision; absent while it waited at the run's end, and for a fall that a later move followed. */
  decided?: { choice: string; how: string };
  /** A move came after this one on the card: this one fell and the card waited (decision 0081). */
  later: boolean;
  /** The card was decided in this run, on this move, a later one or a written choice. */
  settled: boolean;
  /** The seq of this move's fall in the session log, when it fell. */
  fellAt?: number;
  /** The proposer's roll and its outcome; `null` when there was none: the proposer was down, or, for a move with no failure, the engine could not make it (decision 0079). */
  roll?: { id: string; outcome: string } | null;
  /** The choice the own move brought; `null` when it named no failure and fell (decision 0079). */
  ran?: string | null;
  /** The deed's record in this run, when it was written here; a card has one, shared by all its moves. */
  deed?: { contract: number; by: Handle[] };
  /** Seats whose word on the card was a fallback ("goes with the others"). */
  fallbacks: Handle[];
  /** The proposer was down or dead when the card was decided. */
  down: boolean;
}

/** The own moves in a run, from the session log, with the fallbacks the transcript logged on their cards. */
export function ownMovesMet(log: Event[], transcript: TranscriptRecord[] = [], party: readonly Handle[] = []): OwnMoveMet[] {
  const out: OwnMoveMet[] = [];
  const life = new Map<Handle, string>();
  type Seated = { id: string; votes: OwnMoveMet["votes"]; words?: string; moves: OwnMoveMet[]; roundAt: number };
  let card: Seated | undefined;
  // Every card's state stays after it is decided: a move that wins on a card logs its own_move_ran after the card's decision.
  const seen = new Map<string, Seated>();
  const deeds = new Map<string, NonNullable<OwnMoveMet["deed"]>>();
  const rolls = new Map<string, string>();
  // The fallback votes logged in a round: a transcript line's `log_head` is the session log's head when it was written.
  const fallbacksIn = (from: number, to: number) => transcript.filter((r) => r.kind === "fallback" && party.includes(r.speaker) && r.log_head >= from && r.log_head < to).map((r) => r.speaker);
  for (const e of log) {
    if (e.kind === "roll") rolls.set(e.roll.id, e.roll.outcome);
    else if (e.kind === "life_state") life.set(e.target, e.state);
    else if (e.kind === "card_shown") {
      card = { id: e.card, votes: [], moves: [], roundAt: e.seq };
      seen.set(e.card, card);
    }
    else if (e.kind === "card_own_move" && card) card.words = e.words;
    else if (e.kind === "card_advice" && card) card.votes.push({ by: e.actor, choice: e.choice });
    else if (e.kind === "own_move_set" && card) {
      // A move after a fall is on the same card: the one before it is told a later move followed.
      for (const m of card.moves) m.later = true;
      const move: OwnMoveMet = { card: e.card, actor: e.actor, words: card.words ?? "", skill: e.skill, dc: e.dc, success: e.success, failure: e.failure ?? undefined, place: card.moves.length + 1, earlier: card.moves.map((m) => ({ skill: m.skill, success: m.success })), votes: card.votes, later: false, settled: false, fallbacks: [], down: false };
      card.moves.push(move);
      out.push(move);
    } else if (e.kind === "own_move_ran" && seen.get(e.card)?.moves.length) {
      const its = seen.get(e.card)!;
      const open = its.moves.at(-1)!;
      open.ran = e.choice ?? null;
      // The words on the move end here: after a fall the card waits, and its new words are not the move's.
      open.votes = [...open.votes];
      open.roll = e.roll ? { id: e.roll, outcome: rolls.get(e.roll) ?? "missing" } : null;
      if (open.ran === null) {
        open.fellAt = e.seq;
        open.fallbacks = fallbacksIn(its.roundAt, e.seq);
        its.votes = [];
        its.roundAt = e.seq;
      }
    } else if (e.kind === "deed_remembered" && e.deed.startsWith("own_move_")) {
      // Written once, at the first own_move_ran on the card: every move on it uses this record.
      deeds.set(e.deed.slice("own_move_".length), { contract: e.contract, by: e.by });
    } else if (e.kind === "card_resolved" && card) {
      for (const m of card.moves) m.settled = true;
      const open = card.moves.at(-1);
      if (open && !open.decided) {
        open.decided = { choice: e.choice, how: e.decided };
        open.down = (life.get(open.actor) ?? "conscious") !== "conscious";
        if (open.fellAt === undefined) open.fallbacks = fallbacksIn(card.roundAt, e.seq);
      }
      card = undefined;
    }
  }
  for (const m of out) m.deed = deeds.get(m.card);
  return out;
}

/** Whether an own move counts for exit row 2, each move read on its own: decided on it, by no fallback vote, its roll cited, and the branch named for the result run; or a fall, once its card is settled. */
function counted(m: OwnMoveMet): string | undefined {
  if (m.ran === null) {
    // A fall is a valid outcome, with a roll or without one (decision 0081): it counts once the card is settled, on a later move or a written choice.
    if (m.fallbacks.length > 0) return `a fallback vote (${m.fallbacks.join(", ")})`;
    if (m.roll && m.roll.outcome !== "failure") return `${m.roll.id} fell, but it is not in the log as a failed check`;
    if (!m.settled) return "fell, and the card was not settled";
    if (m.later) return undefined;
    return m.decided?.choice === "own_move" ? "fell, but the card was decided on own_move" : undefined;
  }
  if (m.decided?.choice !== "own_move") return m.decided ? `decided on ${m.decided.choice}` : "not decided";
  if (m.fallbacks.length > 0) return `a fallback vote (${m.fallbacks.join(", ")})`;
  if (m.ran === undefined) return "no own_move_ran";
  if (m.roll === null) return m.down && m.ran === m.failure ? undefined : "no roll, and the proposer was up";
  if (m.roll === undefined) return "no roll";
  if (m.roll.outcome !== "success" && m.roll.outcome !== "failure") return `${m.roll.id} is not in the log as a check`;
  const named = m.roll.outcome === "success" ? m.success : m.failure;
  return m.ran === named ? undefined : `${m.roll.id} was a ${m.roll.outcome}, but ${m.ran} ran`;
}

/** Row 2, own move: one counted own move, by an AI player in an all-AI run, by the human with a human at the seat. */
export function ownMoveRow(run: RunRecord, moves: OwnMoveMet[]): VerdictRow {
  const human = run.seats.human;
  const title = human ? `Own move: a card decided by ${human}'s own words, the roll cited, the branch named, the deed kept` : "Own move: a card decided by an AI player's own words, the roll cited, the branch named, the deed kept";
  const theirs = moves.filter((m) => (human ? m.actor === human : run.seats.ai.includes(m.actor)));
  const ok = theirs.filter((m) => counted(m) === undefined);
  const describe = (m: OwnMoveMet) => {
    const why = counted(m);
    const deed = m.deed ? `deed own_move_${m.card} (contract ${m.deed.contract})` : `own_move_${m.card} not written this run (held from an earlier contract, or never)`;
    const place = m.place > 1 || m.later ? ` (move ${m.place})` : "";
    const brought = m.ran === null ? `fell, ${m.later ? "then another move" : `then ${m.decided?.choice ?? "?"}`}` : `brought ${m.ran}`;
    return `${m.card}${place} by ${m.actor}: ${why ? `not counted, ${why}` : `${m.roll ? m.roll.id : "no roll, proposer down"}, ${brought}; ${deed}`}`;
  };
  const detail = `${moves.length} own moves put on a card, ${theirs.length} by ${human ?? "AI players"}${theirs.length > 0 ? `: ${theirs.map(describe).join("; ")}` : ""}`;
  return { row: "m12-own-move", title, status: ok.length > 0 ? "pass" : "fail", detail };
}

/**
 * Row 4, in order (design §2): no card reaches the seats before a narration from its pick or card
 * wake, or that wake's logged DM fallback; and no settling wake cut after its narration.
 */
export function orderRow(log: Event[], transcript: TranscriptRecord[]): VerdictRow {
  const title = "In order: every card after the narration that frames it; no settling wake cut after its narration";
  const shown = log.flatMap((e) => (e.kind === "card_shown" ? [{ card: e.card, seq: e.seq }] : []));
  const early: string[] = [];
  // A card that goes to the seats again after a fall is the same card: counted once, by the time it was shown (amendment §14).
  const seatedCards = new Set<string>();
  transcript.forEach((r, i) => {
    const id = r.kind === "system" ? /^card (\S+) goes to the seats$/.exec(r.text)?.[1] : undefined;
    if (!id) return;
    const its = shown.filter((s) => s.card === id && s.seq <= r.log_head).at(-1);
    const once = `${id}@${its?.seq ?? 0}`;
    if (seatedCards.has(once)) return;
    seatedCards.add(once);
    const framed = transcript
      .slice(0, i)
      .some((x) => x.speaker === "dm" && (x.kind === "narration" || x.kind === "fallback") && x.wake !== undefined && FRAMING_WAKES.includes(x.wake) && x.log_head >= (its?.seq ?? 0));
    if (!framed) early.push(id);
  });
  const cut = transcript.filter((r) => r.kind === "fallback" && r.cause === "cut_after_narration" && r.wake !== undefined && SETTLING_WAKES.includes(r.wake));
  const fails = [...(early.length > 0 ? [`before its framing: ${early.join(", ")}`] : []), ...(cut.length > 0 ? [`cut after its narration: ${cut.map((r) => r.wake).join(", ")}`] : [])];
  return {
    row: "m12-order",
    title,
    status: fails.length > 0 ? "fail" : "pass",
    detail: `${seatedCards.size} cards went to the seats${fails.length > 0 ? `; ${fails.join("; ")}` : ", each after its framing"}`,
  };
}

/**
 * Every Latin word a Russian seat drew (design §4), except roll ids, key names and `/commands`,
 * with the line it stood in.
 */
export function latinWords(seat: SeatRecord[]): Array<{ word: string; line: string }> {
  const out: Array<{ word: string; line: string }> = [];
  for (const r of seat) {
    const text = r.text.replace(/\bCtrl\+[A-Z](\/[A-Z])*\b/g, " ").replace(/\/[a-z]+/g, " ").replace(/\br\d+\b/g, " ");
    for (const word of text.match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? []) if (!KEY_NAMES.has(word)) out.push({ word, line: r.text });
  }
  return out;
}

/** Row 5, one language: in a Russian run with a human at the seat, no Latin word the scan does not pass. */
export function languageRow(run: RunRecord, seat: SeatRecord[] | undefined): VerdictRow {
  const title = "One language: no English at a Russian seat but roll ids, key names and /commands";
  const language = run.settings.lang?.value;
  if (!run.seats.human || language !== "ru") return { row: "m12-language", title, status: "reported", detail: `no Russian seat in this run (language ${language ?? "en"}${run.seats.human ? "" : ", no human"}): run 2's row` };
  if (!seat) return { row: "m12-language", title, status: "pending", detail: `no ${SEAT_JSONL} in the run folder` };
  const found = latinWords(seat);
  const words = [...new Set(found.map((f) => f.word))];
  return {
    row: "m12-language",
    title,
    status: found.length === 0 ? "pass" : "fail",
    detail: found.length === 0 ? `${seat.length} seat lines, no English word` : `${found.length} English words in ${new Set(found.map((f) => f.line)).size} lines: ${words.slice(0, 12).join(", ")}${words.length > 12 ? ", …" : ""}; first line: ${found[0]!.line.slice(0, 120)}`,
  };
}

/** The Vera read Stas records in `confirmations.json` under `m12-readable`: her answer verbatim, and his verdict on it. */
export interface ReadableAnswer {
  quote: string;
  verdict?: "pass" | "fail";
}

/** Row 3, readable: manual; the quote goes into `verdict.json`, the verdict is Stas's. */
export function readableRow(answer: ReadableAnswer | undefined): VerdictRow {
  const title = "Readable: the Vera fallback reads the opening and a card (and in run 2 /options and /sheet), Stas rules";
  if (!answer?.quote) return { row: "m12-readable", title, status: "pending", detail: "no Vera read in confirmations.json (m12-readable.quote)" };
  // Only "pass" or "fail" is a ruling; anything else waits for one.
  const ruled = answer.verdict === "pass" || answer.verdict === "fail" ? answer.verdict : undefined;
  return { row: "m12-readable", title, status: ruled ?? "pending", detail: `Vera: ${answer.quote}${ruled ? "" : " (Stas has not ruled: verdict pass or fail)"}` };
}

/** "not now" refusals after a settled wake, by wake purpose: the tools of the API calls that started after it settled. */
export function lateCalls(usage: UsageRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const u of usage) {
    if (!u.settled_early || u.waited_ms === undefined) continue;
    const late = (u.calls ?? []).filter((c) => c.started_ms >= u.waited_ms!).reduce((n, c) => n + c.tools.length, 0);
    if (late > 0) out.set(u.purpose, (out.get(u.purpose) ?? 0) + late);
  }
  return out;
}

const partyOf = (run: RunRecord): Handle[] => [...(run.seats.human ? [run.seats.human] : []), ...run.seats.ai];

/** The report's Milestone 12 section: the DM's voice (AGT-102), every own move, the words that found none, p95 against pair 3, the late calls, and the opening and first card. */
export function exitReport(run: RunRecord, log: Event[], transcript: TranscriptRecord[], usage: UsageRecord[]): string[] {
  if (!log.some((e) => e.kind === "card_shown")) return [];
  const moves = ownMovesMet(log, transcript, partyOf(run));
  const out = ["", "## Not a passenger", "", `Voice: ${run.settings.voice?.value ?? "plain (no voice setting in this run)"}`, `Own moves put on a card: ${moves.length}`];
  moves.forEach((m, i) => {
    const roll = m.roll === null ? "no roll (the proposer was down, or the roll could not be made)" : m.roll ? `${m.roll.id}, ${m.roll.outcome}` : "not rolled";
    const place = m.place > 1 || m.later ? ` (move ${m.place} on the card${m.earlier.length > 0 ? `; earlier ways: ${m.earlier.map((x) => `${x.skill} for ${x.success}`).join(", ")}` : ""})` : "";
    const end = m.ran === null
      ? `; fell ${m.roll ? `(roll ${m.roll.id})` : "with no roll (the proposer was down, or the roll could not be made)"}; ${m.later ? "the card waited and took another move" : m.decided ? `the card was then decided on ${m.decided.choice} (${m.decided.how})` : "the card was not settled"}`
      : `${m.decided ? `; decided on ${m.decided.choice} (${m.decided.how})` : "; not decided"}${m.decided?.choice === "own_move" ? `; ${roll}; brought ${m.ran ?? "?"}` : ""}`;
    out.push(
      `${i + 1}. ${m.card}${place}, ${m.actor}: "${m.words}"; ${m.skill} DC ${m.dc}; success brings ${m.success}, failure ${m.failure ?? "none named"}; votes: ${m.votes.map((v) => `${v.by} ${v.choice}`).join(", ") || "none"}${end}${m.fallbacks.length > 0 ? `; fallback votes: ${m.fallbacks.join(", ")}` : ""}`,
    );
  });
  // Falls per card, and the most on one card, at the human's seat and among the AI seats (decision 0081 Revisit).
  const fell = moves.filter((m) => m.ran === null);
  const falls = new Map<string, number>();
  for (const m of fell) falls.set(m.card, (falls.get(m.card) ?? 0) + 1);
  // Counted per seat side: a card where the human fell once and an AI seat once is one each.
  const most = (pick: (actor: Handle) => boolean) => Math.max(0, ...[...falls.keys()].map((c) => fell.filter((m) => m.card === c && pick(m.actor)).length));
  const human = run.seats.human;
  out.push(
    `Falls per card: ${[...falls].map(([c, f]) => `${c} ${f}`).join(", ") || "none"}; the most on one card: ${human ? `at ${human}'s seat ${most((a) => a === human)}, among AI seats ${most((a) => a !== human)}` : `${most(() => true)} (no human seat in this run)`}`,
  );
  // Words a seat said on a card that the DM did not turn into an own move; those said after a fall on that card are marked.
  // A same-way refusal (`bad_own_move`) is not in the session log or the transcript, so it cannot be marked here.
  const unmoved = transcript.filter((r) => r.kind === "system" && r.text.startsWith("no fitting choice: "));
  const afterFall = (r: TranscriptRecord) => {
    const id = /on the road card (\S+) made/.exec(r.text)?.[1];
    return moves.some((m) => m.card === id && m.fellAt !== undefined && m.fellAt <= r.log_head);
  };
  out.push("", `Words on a card that got no own move: ${unmoved.length}`, ...unmoved.map((r) => `- ${r.text}${afterFall(r) ? " (said after a fall on this card)" : ""}`));
  const p95 = (pick: (u: UsageRecord) => boolean) => percentile(usage.filter(pick).map(waitedMs), 95);
  const side = run.seats.human ? "human" : "ai";
  out.push(
    "",
    `p95 against pair 3 (${side === "human" ? "Stas's run" : "the AI run"}): DM wake ${p95((u) => u.agent === "dm") || "n/a"} ms (pair 3: ${PAIR_3_P95_MS.dm[side]} ms), AI player wake ${p95((u) => run.seats.ai.includes(u.agent)) || "n/a"} ms (pair 3: ${PAIR_3_P95_MS.player[side]} ms)`,
  );
  const late = lateCalls(usage);
  out.push(`"not now" after a settled wake, by wake: ${[...late].map(([w, n]) => `${w} ${n}`).join(", ") || "none"}`);
  const long = transcript.filter((r) => r.kind === "fallback" && r.cause === "cut_after_narration" && r.wake !== undefined && !SETTLING_WAKES.includes(r.wake));
  out.push(`Long wakes cut after their narration (counted, not gated): ${long.length}${long.length > 0 ? ` (${long.map((r) => r.wake).join(", ")})` : ""}`);
  // The same two beats in every run, for the Fireside run side by side with run 1.
  const opening = transcript.find((r) => r.speaker === "dm" && r.kind === "narration" && r.wake === "scene_open");
  const firstCard = log.find((e) => e.kind === "card_shown");
  const framing = transcript.find((r) => r.speaker === "dm" && r.kind === "narration" && r.wake !== undefined && FRAMING_WAKES.includes(r.wake));
  out.push("", "The opening and the first card:", `> ${opening?.text ?? "(no scene opening)"}`, "", `First card: ${firstCard?.kind === "card_shown" ? firstCard.card : "none"}`, `> ${framing?.text ?? "(no framing narration)"}`);
  return out;
}

/** The Milestone 12 rows of a living-world run. */
export function exitRows(dir: string, run: RunRecord, log: Event[], transcript: TranscriptRecord[], answer: ReadableAnswer | undefined): VerdictRow[] {
  const seatFile = path.join(dir, SEAT_JSONL);
  return [
    ownMoveRow(run, ownMovesMet(log, transcript, partyOf(run))),
    readableRow(answer),
    orderRow(log, transcript),
    languageRow(run, existsSync(seatFile) ? readLines<SeatRecord>(seatFile) : undefined),
  ];
}

/**
 * What a seat would have drawn in an all-AI run, for run 1's Vera read (design §8): the DM's
 * narration, the AI players' table talk and the public events through the seat's own `seatLine`,
 * in the run's language, from the first scene's opening to the first card decided by an own move
 * (or the first card at all) and the narration of its outcome. As on a seat that is not verbose,
 * engine lines a narration covers go nowhere, and each card shows as the loop shows it ("On the
 * road", then "Choices") after the narration that frames it. Nothing new goes into the run record.
 */
export function seatReplay(dir: string): string[] {
  const log = readLines<Event>(path.join(dir, SESSION_LOG));
  const transcript = readLines<TranscriptRecord>(path.join(dir, "transcript.jsonl"));
  const run = readRunRecord(dir);
  const language = run.settings.lang?.value === "ru" ? "ru" : "en";
  const pack = packOfRun(dir);
  const names = language === "ru" ? new SeatNames("ru", seatRuNames(pack, readPack(pack).adventure)) : new SeatNames("en");
  const ru = language === "ru" ? seatCards(pack) : new Map<string, CardRu>();
  const words = SEAT_WORDS[language];
  const ui = UI_WORDS[language];
  const party = partyOf(run);
  const own = log.find((e) => e.kind === "card_resolved" && e.choice === "own_move");
  const last = own ?? log.find((e) => e.kind === "card_resolved");
  const end = last?.seq ?? Number.POSITIVE_INFINITY;
  const out: string[] = [];
  const said = (r: TranscriptRecord) => (r.speaker === "dm" ? `${ui.dm}: ${r.text}` : `${names.person(r.speaker)}: ${r.text}`);
  // What the DM narrates and the AI players say aloud, in order.
  const talk = transcript.filter((r) => !r.to && ((r.speaker === "dm" && r.kind === "narration") || (party.includes(r.speaker) && r.kind === "speech")));
  let held: string[] = [];
  let panel: string[] = [];
  let card: CardOnSeat | undefined;
  let shown: string | undefined;
  let next = 0;
  const say = (until: (r: TranscriptRecord) => boolean) => {
    while (next < talk.length && until(talk[next]!)) {
      const r = talk[next++]!;
      // A narration tells the lines held under it; they go nowhere.
      if (r.speaker === "dm") held = [];
      out.push("", said(r), "");
    }
  };
  const show = () => {
    out.push(...held, ...panel);
    held = [];
    panel = [];
  };
  for (const e of log) {
    if (e.seq > end) break;
    say((r) => r.log_head < e.seq);
    if (e.kind === "card_shown") shown = e.card;
    if (e.visibility.scope !== "public") continue;
    if (e.kind === "card_drawn") {
      const its = shown !== undefined ? ru.get(shown) : undefined;
      card = { target: e.target, text: its?.text_ru ?? e.card_text, choices: new Map(e.choices.map((c) => [c.id, its?.choices[c.id] ?? c.text])) };
      const decides = e.target === "caravan" ? words.merchantDecides : words.bladesDecide;
      panel = ["", `${words.onTheRoad}:`, `  ${card.text}`, `  ${decides}`, `${words.choicesTitle}:`, ...[...card.choices.values()].map((text, i) => `  ${i + 1}. ${text}`), `  ${words.ownMoveLine}`, ""];
      continue;
    }
    // The first word on a card comes once its panel is up.
    if (panel.length > 0 && (e.kind === "card_advice" || e.kind === "card_own_move" || e.kind === "card_resolved")) show();
    if (e.kind === "card_own_move" && card) card = { ...card, ownMove: e.words };
    const text = seatLine(e, { names, site: "seat", party, ...(card ? { card } : {}) });
    if (text !== null) held.push(`  ${text}`);
    // The seats' words and the decision show when the card is decided, as the seat releases them when it asks.
    if (e.kind === "card_resolved") show();
  }
  say((r) => r.log_head < end);
  show();
  // The narration that tells how the card turned out, written after its decision.
  say((r) => r.speaker !== "dm");
  if (next < talk.length && last) out.push("", said(talk[next]!));
  return out;
}
