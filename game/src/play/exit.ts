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
import { SEAT_WORDS } from "../table/words.ts";
import { waitedMs, percentile, type UsageRecord } from "../usage.ts";
import { readPack } from "../pack/read.ts";
import { seatCards } from "../pack/campaign.ts";
import { packOfRun, readRunRecord, type RunRecord } from "./record.ts";
import { seatRuNames } from "./run.ts";
import { readLines, type VerdictRow } from "./verdict.ts";

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

/** Key names the keyboard takes, which a Russian seat keeps Latin (design §4, Stas 2026-11-11). */
const KEY_NAMES = new Set(["Enter", "Esc", "PgUp", "PgDn", "Shift", "Ctrl", "Fn", "Option"]);

/** One own move put on a card, won or lost (design §8). */
export interface OwnMoveMet {
  card: string;
  actor: Handle;
  words: string;
  skill: string;
  dc: number;
  success: string;
  failure: string;
  /** Each seat's word on the card, in order. */
  votes: Array<{ by: Handle; choice: string }>;
  /** The card's decision; absent while it waited at the run's end. */
  decided?: { choice: string; how: string };
  /** The proposer's roll and its outcome; `null` when the proposer was down and the failure ran without one. */
  roll?: { id: string; outcome: string } | null;
  /** The choice the own move brought. */
  ran?: string;
  /** The deed's record in this run, when it was written here. */
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
  let card: { id: string; shownAt: number; votes: OwnMoveMet["votes"]; words?: string } | undefined;
  let open: OwnMoveMet | undefined;
  const rolls = new Map<string, string>();
  for (const e of log) {
    if (e.kind === "roll") rolls.set(e.roll.id, e.roll.outcome);
    else if (e.kind === "life_state") life.set(e.target, e.state);
    else if (e.kind === "card_shown") card = { id: e.card, shownAt: e.seq, votes: [] };
    else if (e.kind === "card_own_move" && card) card.words = e.words;
    else if (e.kind === "card_advice" && card) card.votes.push({ by: e.actor, choice: e.choice });
    else if (e.kind === "own_move_set" && card) {
      open = { card: e.card, actor: e.actor, words: card.words ?? "", skill: e.skill, dc: e.dc, success: e.success, failure: e.failure, votes: card.votes, fallbacks: [], down: false };
      out.push(open);
    } else if (e.kind === "card_resolved" && card) {
      if (open && open.card === card.id && !open.decided) {
        open.decided = { choice: e.choice, how: e.decided };
        open.down = (life.get(open.actor) ?? "conscious") !== "conscious";
        // The fallback votes logged between the card going on the table and its decision: a
        // transcript line's `log_head` is the session log's head when it was written.
        open.fallbacks = transcript
          .filter((r) => r.kind === "fallback" && party.includes(r.speaker) && r.log_head >= card!.shownAt && r.log_head < e.seq)
          .map((r) => r.speaker);
        if (e.choice !== "own_move") open = undefined;
      }
      card = undefined;
    } else if (e.kind === "own_move_ran" && open && e.card === open.card) {
      open.ran = e.choice;
      open.roll = e.roll ? { id: e.roll, outcome: rolls.get(e.roll) ?? "not in the log" } : null;
    } else if (e.kind === "deed_remembered" && open && e.deed === `own_move_${open.card}`) {
      open.deed = { contract: e.contract, by: e.by };
      open = undefined;
    }
  }
  return out;
}

/** Whether an own move counts for exit row 2: decided on it, by no fallback vote, its roll cited, and the branch named for the result run. */
function counted(m: OwnMoveMet): string | undefined {
  if (m.decided?.choice !== "own_move") return m.decided ? `decided on ${m.decided.choice}` : "not decided";
  if (m.fallbacks.length > 0) return `a fallback vote (${m.fallbacks.join(", ")})`;
  if (m.ran === undefined) return "no own_move_ran";
  if (m.roll === null) return m.down && m.ran === m.failure ? undefined : "no roll, and the proposer was up";
  if (m.roll === undefined) return "no roll";
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
    return `${m.card} by ${m.actor}: ${why ? `not counted, ${why}` : `${m.roll ? m.roll.id : "no roll, proposer down"}, brought ${m.ran}; ${deed}`}`;
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
  let seated = 0;
  transcript.forEach((r, i) => {
    const id = r.kind === "system" ? /^card (\S+) goes to the seats$/.exec(r.text)?.[1] : undefined;
    if (!id) return;
    seated += 1;
    const its = shown.filter((s) => s.card === id && s.seq <= r.log_head).at(-1);
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
    detail: `${seated} cards went to the seats${fails.length > 0 ? `; ${fails.join("; ")}` : ", each after its framing"}`,
  };
}

/**
 * Every Latin word a Russian seat drew (design §4), except roll ids, key names and `/commands`,
 * with the line it stood in.
 */
export function latinWords(seat: SeatRecord[]): Array<{ word: string; line: string }> {
  const out: Array<{ word: string; line: string }> = [];
  for (const r of seat) {
    const text = r.text.replace(/\/[a-z]+/g, " ").replace(/\br\d+\b/g, " ");
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

/** The report's Milestone 12 section: every own move, the words that found none, p95 against pair 3, the late calls, and the opening and first card. */
export function exitReport(dir: string, run: RunRecord): string[] {
  const log = readLines<Event>(path.join(dir, SESSION_LOG));
  if (!log.some((e) => e.kind === "card_shown")) return [];
  const transcript = readLines<TranscriptRecord>(path.join(dir, "transcript.jsonl"));
  const usage = readLines<UsageRecord>(path.join(dir, "usage.jsonl"));
  const moves = ownMovesMet(log, transcript, partyOf(run));
  const out = ["", "## Not a passenger", "", `Own moves put on a card: ${moves.length}`];
  moves.forEach((m, i) => {
    const roll = m.roll === null ? "no roll (the proposer was down)" : m.roll ? `${m.roll.id}, ${m.roll.outcome}` : "not rolled";
    out.push(
      `${i + 1}. ${m.card}, ${m.actor}: "${m.words}"; ${m.skill} DC ${m.dc}; success brings ${m.success}, failure ${m.failure}; votes: ${m.votes.map((v) => `${v.by} ${v.choice}`).join(", ") || "none"}; ${m.decided ? `decided on ${m.decided.choice} (${m.decided.how})` : "not decided"}${m.decided?.choice === "own_move" ? `; ${roll}; brought ${m.ran ?? "?"}` : ""}${m.fallbacks.length > 0 ? `; fallback votes: ${m.fallbacks.join(", ")}` : ""}`,
    );
  });
  // Words a seat said on a card that the DM did not turn into an own move.
  const unmoved = transcript.filter((r) => r.kind === "system" && r.text.startsWith("no fitting choice: "));
  out.push("", `Words on a card that got no own move: ${unmoved.length}`, ...unmoved.map((r) => `- ${r.text}`));
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
 * narration and the public events through the seat's own `seatLine`, in the run's language, with
 * each card as drawn after the narration that frames it, from the first scene's opening to the
 * first card decided by an own move (or the first card at all) and the narration of its outcome.
 * Nothing new goes into the run record.
 */
export function seatReplay(dir: string): string[] {
  const log = readLines<Event>(path.join(dir, SESSION_LOG));
  const transcript = readLines<TranscriptRecord>(path.join(dir, "transcript.jsonl"));
  const run = readRunRecord(dir);
  const language = run.settings.lang?.value === "ru" ? "ru" : "en";
  const pack = packOfRun(dir);
  const names = language === "ru" ? new SeatNames("ru", seatRuNames(pack, readPack(pack).adventure)) : new SeatNames("en");
  const ru = language === "ru" ? seatCards(pack) : new Map();
  let shown: string | undefined;
  const own = log.find((e) => e.kind === "card_resolved" && e.choice === "own_move");
  const last = own ?? log.find((e) => e.kind === "card_resolved");
  const end = last?.seq ?? Number.POSITIVE_INFINITY;
  const out: string[] = [];
  let card: CardOnSeat | undefined;
  // The card panel shows after the narration that frames it (AGT-100), before the next line.
  let panel: string[] = [];
  let next = 0;
  // Each narration goes before the events of the engine lines written after it.
  const narrations = transcript.filter((r) => r.speaker === "dm" && r.kind === "narration" && !r.to);
  for (const e of log) {
    if (e.seq > end) break;
    while (next < narrations.length && narrations[next]!.log_head < e.seq) out.push("", narrations[next++]!.text, "");
    if (e.kind === "card_shown") shown = e.card;
    if (e.visibility.scope !== "public") continue;
    if (e.kind === "card_drawn") {
      const words = shown !== undefined ? ru.get(shown) : undefined;
      card = { target: e.target, text: words?.text_ru ?? e.card_text, choices: new Map(e.choices.map((c) => [c.id, words?.choices[c.id] ?? c.text])) };
      panel = ["", `[card] ${card.text}`, ...[...card.choices.values()].map((text, i) => `  ${i + 1}. ${text}`), `  ${SEAT_WORDS[language].ownMoveLine}`, ""];
      continue;
    }
    out.push(...panel);
    panel = [];
    if (e.kind === "card_own_move" && card) card = { ...card, ownMove: e.words };
    const text = seatLine(e, { names, site: "seat", ...(card ? { card } : {}) });
    if (text !== null) out.push(text);
  }
  while (next < narrations.length && narrations[next]!.log_head < end) out.push("", narrations[next++]!.text);
  out.push(...panel);
  // The narration that tells how the card turned out, written after its decision.
  if (next < narrations.length && last) out.push("", narrations[next]!.text);
  return out;
}
