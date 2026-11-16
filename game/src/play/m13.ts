// The Milestone 13 exit (AGT-104, design `docs/design/m13-system-design.md` §8): the verdict rows
// `m13-written` (run 1, a pack played at a site), `m13-carried` and `m13-readable` (run 2, a
// campaign on run 1's roster), the judge's question on the carried card, and the report's lines.
// Pure functions of the run folder, like the rest of the verdict.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Event, Handle } from "@nat20-table/engine-client";
import { NARRATION_DIGEST, readDigest, type DigestRecord } from "../check/digest.ts";
import { CARRIED_QUESTION, type JudgeAnswer } from "../check/judge.ts";
import type { TranscriptRecord } from "../table/types.ts";
import { deedKinds, worldSources } from "./deeds.ts";
import { readLines, type RunRecord } from "./record.ts";
import type { Flag, VerdictRow } from "./verdict.ts";

/** The engine's request log in a run folder. */
const ENGINE_LOG = "engine-log.jsonl";

/** The judge's answer to the carried question, beside `narration-check.jsonl` (AGT-104). */
export const JUDGE_QUESTION = "judge-question.json";

/** What `judge-question.json` holds: the question, the card it was asked about, and the answer. */
export interface CarriedAnswer extends JudgeAnswer {
  question: string;
  card: string;
  /** The narration lines it was asked about, by number. */
  lines: number[];
}

/** The Vera and Zoya reads Stas records in `confirmations.json` under `m13-readable`, and his verdict. */
export interface CarriedReads {
  vera?: string;
  zoya?: string;
  verdict?: "pass" | "fail";
}

/** A deed a card read, with its record. */
interface DeedRead {
  deed: string;
  by: Handle[];
  day: number;
  contract: number;
}

/** The arrival card that read an outcome an earlier contract wrote, and what became of it. */
export interface CarriedCard {
  card: string;
  /** The `card_shown` seq. */
  seq: number;
  /** The outcomes of an earlier contract it read (§4.2 rule 9). */
  reads: DeedRead[];
  /** The card's own text, as `card_drawn` gave it. */
  text: string;
  /** Its decision; absent while it waited at the run's end. */
  decided?: { seq: number; choice: string; how: string };
  /** The deeds its choice wrote. */
  wrote: string[];
}

/** The first contract version whose scenes write deeds (API-57). */
const SCENE_DEEDS_SINCE = 74;

const blades = (run: RunRecord): Handle[] => [...(run.seats.human ? [run.seats.human] : []), ...run.seats.ai];

/** The outcome deeds of the world the run's pack plays on (§4.2 rule 9). */
export function outcomesOf(pack: string): Set<string> {
  return deedKinds(worldSources(pack)).outcomes;
}

/** The outcomes a scene writes (a check or a fight), not a card: what a pack played at a site leaves for a campaign. */
export function sceneOutcomesOf(pack: string): Set<string> {
  const sources = worldSources(pack);
  const outcomes = deedKinds(sources).outcomes;
  return new Set(sources.filter((s) => /^(check|fight) /.test(s.source)).flatMap((s) => s.outcomes.flatMap((o) => [...o])).filter((d) => outcomes.has(d)));
}

/**
 * The first arrival card that read one of `outcomes` (a scene's outcomes, as `sceneOutcomesOf`
 * gives them) that this run did not write, so an earlier contract wrote it, with its decision and
 * the deeds its choice wrote.
 */
export function carriedCard(log: Event[], outcomes: Set<string>): CarriedCard | undefined {
  const written = new Set(log.flatMap((e) => (e.kind === "deed_remembered" ? [e.deed] : [])));
  let found: CarriedCard | undefined;
  for (const e of log) {
    if (!found) {
      if (e.kind !== "card_shown" || e.when !== "arrival") continue;
      const reads = (e.reads ?? []).filter((d) => outcomes.has(d.deed) && !written.has(d.deed));
      if (reads.length > 0) found = { card: e.card, seq: e.seq, reads, text: "", wrote: [] };
      continue;
    }
    if (e.kind === "card_drawn" && !found.text) found.text = e.card_text;
    else if (e.kind === "card_resolved" && !found.decided) found.decided = { seq: e.seq, choice: e.choice, how: e.decided };
    else if (e.kind === "deed_remembered" && found.decided) found.wrote.push(e.deed);
    // The choice's deeds come with its decision: the next card, leg or night is past them.
    else if (found.decided && (e.kind === "card_shown" || e.kind === "traveled" || e.kind === "night")) break;
  }
  return found;
}

/** The wakes whose narration frames a card. */
const FRAMING_WAKES = new Set(["pick", "card"]);

/**
 * The narration lines about a card: from the DM's framing of it (its pick or card wake) to the first
 * line said after its decision. A card drawn in the request that settled the card before it is
 * shown before the DM narrates that settling, so the first line after it may be about the other
 * card: the framing narration, found in the transcript, marks where this card's lines start.
 */
export function cardLines(digests: DigestRecord[], card: CarriedCard, transcript: TranscriptRecord[] = []): DigestRecord[] {
  const framing = transcript.find((r) => r.speaker === "dm" && r.kind === "narration" && r.wake !== undefined && FRAMING_WAKES.has(r.wake) && r.log_head >= card.seq);
  const framed = framing ? digests.findIndex((d) => d.log_head >= card.seq && d.text === framing.text) : -1;
  const from = framed >= 0 ? framed : digests.findIndex((d) => d.log_head >= card.seq);
  if (from < 0) return [];
  const end = card.decided ? digests.findIndex((d, i) => i >= from && d.log_head >= card.decided!.seq) : -1;
  return digests.slice(from, end < 0 ? digests.length : end + 1);
}

/** The question the judge is asked about the carried card's lines. */
export function questionText(card: CarriedCard, lines: DigestRecord[]): string {
  return [
    `Question: ${CARRIED_QUESTION}`,
    "",
    "What the party did earlier, by the engine's record:",
    ...card.reads.map((d) => `- ${d.deed}: by ${d.by.length > 0 ? d.by.join(", ") : "nobody named"}, day ${d.day}, contract ${d.contract}`),
    "",
    `The card (${card.card}), its own text: ${card.text || "(not logged)"}`,
    "",
    "The DM's lines:",
    ...lines.map((d) => `${d.line}. ${d.text}`),
  ].join("\n");
}

/**
 * `m13-written` (run 1): at least two `deed_remembered` events in the pack's scenes, each with
 * `by`, day and contract, one of them an outcome; and the roster was saved.
 */
export function writtenRow(run: RunRecord, log: Event[], outcomes: Set<string>): VerdictRow {
  const title = "Written: the scenes write two deeds or more, one an outcome, and the roster is saved";
  // A build before scene deeds (contract 1.0.0-dev.74, API-57) writes none: its runs only report.
  const dev = /^1\.0\.0-dev\.(\d+)$/.exec(run.build.contract)?.[1];
  if (dev !== undefined && Number(dev) < SCENE_DEEDS_SINCE) return { row: "m13-written", title, status: "reported", detail: `built on contract ${run.build.contract}, before scene deeds (dev.${SCENE_DEEDS_SINCE})` };
  // Only a run that saves a party is run 1 of a pair: any other run of the pack reports its deeds.
  if (!run.roster) {
    const deeds = log.flatMap((e) => (e.kind === "deed_remembered" ? [e.deed] : []));
    return { row: "m13-written", title, status: "reported", detail: `no --roster, so not run 1 of a pair; deeds: ${deeds.join(", ") || "none"}` };
  }
  const loaded = log.findIndex((e) => e.kind === "scene_loaded");
  const deeds = log.slice(Math.max(0, loaded)).flatMap((e) => (e.kind === "deed_remembered" ? [e] : []));
  const whole = deeds.filter((d) => d.by.length > 0 && Number.isInteger(d.day) && Number.isInteger(d.contract));
  const outcome = whole.filter((d) => outcomes.has(d.deed));
  const saved = run.roster?.saved_sha256 ?? null;
  const fails = [
    ...(whole.length < 2 ? [`${whole.length} deeds with by, day and contract`] : []),
    ...(outcome.length === 0 ? ["no outcome deed"] : []),
    ...(saved === null ? [`the roster was not saved${run.roster.not_saved ? ` (${run.roster.not_saved})` : ""}`] : []),
  ];
  const listed = deeds.map((d) => `${d.deed} (by ${d.by.join(", ") || "nobody"}, day ${d.day}, contract ${d.contract})`).join("; ") || "none";
  return {
    row: "m13-written",
    title,
    status: fails.length > 0 ? "fail" : "pass",
    detail: `deeds: ${listed}${saved ? `; roster ${run.roster.name} saved ${saved.slice(0, 12)}` : ""}${fails.length > 0 ? `; ${fails.join("; ")}` : ""}`,
  };
}

/**
 * `m13-carried` (run 2): an arrival card that read an outcome of an earlier contract was decided by
 * the Blades' word, no seat falling back, and its choice wrote a deed; the judge answers yes to
 * the question and no flag on its lines stands.
 */
export function carriedRow(run: RunRecord, log: Event[], transcript: TranscriptRecord[], scene: Set<string>, answer: CarriedAnswer | undefined, flags: Flag[], judged: boolean, brought?: DeedRead[]): VerdictRow {
  const title = "Carried: a card reads what the party did at the mill, the Blades decide it, and the DM names it";
  const card = carriedCard(log, scene);
  if (run.roster?.party !== "continue") return { row: "m13-carried", title, status: "reported", detail: `not a run on a carried roster${card ? `; ${card.card} read ${card.reads.map((d) => d.deed).join(", ")}` : ""}` };
  if (!card) {
    // Only a roster whose world holds a scene's outcome owes a card for it: run 2 of the pair.
    const owed = (brought ?? []).filter((d) => scene.has(d.deed)).map((d) => d.deed);
    return owed.length > 0
      ? { row: "m13-carried", title, status: "fail", detail: `the saved world held ${owed.join(", ")}, and no arrival card read it` }
      : { row: "m13-carried", title, status: "reported", detail: "no arrival card read a scene's outcome from an earlier contract, and the saved world held none" };
  }
  const party = blades(run);
  const fellBack = card.decided ? transcript.filter((r) => r.kind === "fallback" && party.includes(r.speaker) && r.log_head >= card.seq && r.log_head < card.decided!.seq).map((r) => r.speaker) : [];
  const word = card.decided && (card.decided.how === "majority" || card.decided.how === "tie");
  const fails = [
    ...(!card.decided ? ["not decided"] : !word ? [`decided ${card.decided.how}, not by the Blades' word`] : []),
    ...(fellBack.length > 0 ? [`fallback words from ${fellBack.join(", ")}`] : []),
    ...(card.decided && card.wrote.length === 0 ? ["its choice wrote no deed"] : []),
    ...(judged && answer?.answer === "no" ? ["the judge answers no"] : []),
  ];
  const lines = new Set(answer?.lines ?? []);
  // Row 3's flags on the card's lines: the judge's and those Stas added by hand.
  const onIt = flags.filter((f) => f.row === "3" && f.line !== undefined && lines.has(f.line));
  const confirmed = onIt.filter((f) => f.answer === "confirmed");
  const open = onIt.filter((f) => !f.answer);
  if (confirmed.length > 0) fails.push(`contradiction on its lines: ${confirmed.map((f) => f.id).join(", ")}`);
  // The pair is bound by the roster: run 2 loads the file run 1's m13-written row says it saved.
  const head = `roster ${run.roster.name} loaded ${run.roster.loaded_sha256?.slice(0, 12) ?? "?"}; ${card.card} read ${card.reads.map((d) => `${d.deed} (contract ${d.contract}, day ${d.day})`).join(", ")}${card.decided ? `; decided ${card.decided.choice} (${card.decided.how})` : ""}${card.wrote.length > 0 ? `; wrote ${card.wrote.join(", ")}` : ""}`;
  const judgeSays = !judged || !answer ? "the judge has not answered" : answer.answer === "yes" ? `the judge: yes, line ${answer.line}: "${answer.quote}"` : "the judge: no";
  const detail = `${head}; ${judgeSays}${open.length > 0 ? `; flags on its lines to confirm: ${open.map((f) => f.id).join(", ")}` : ""}${fails.length > 0 ? `; ${fails.join("; ")}` : ""}`;
  if (fails.length > 0) return { row: "m13-carried", title, status: "fail", detail };
  return { row: "m13-carried", title, status: !judged || !answer || open.length > 0 ? "pending" : "pass", detail };
}

/** `m13-readable` (run 2, manual): the Vera fallback's and Zoya's reads of the card as the seat showed it, quoted; the verdict is Stas's. */
export function readableRow(run: RunRecord, reads: CarriedReads | undefined, carried = true): VerdictRow {
  const title = "Readable: the Vera fallback and Zoya read the carried card as the seat showed it, Stas rules";
  if (run.roster?.party !== "continue") return { row: "m13-readable", title, status: "reported", detail: "not a run on a carried roster" };
  if (!carried) return { row: "m13-readable", title, status: "reported", detail: "no carried card to read in this run" };
  const missing = [...(!reads?.vera ? ["vera"] : []), ...(!reads?.zoya ? ["zoya"] : [])];
  if (missing.length > 0) return { row: "m13-readable", title, status: "pending", detail: `no ${missing.join(" or ")} read in confirmations.json (m13-readable.${missing[0]})` };
  const ruled = reads!.verdict === "pass" || reads!.verdict === "fail" ? reads!.verdict : undefined;
  return { row: "m13-readable", title, status: ruled ?? "pending", detail: `Vera: ${reads!.vera} Zoya: ${reads!.zoya}${ruled ? "" : " (Stas has not ruled: verdict pass or fail)"}` };
}

export function readCarriedAnswer(dir: string): CarriedAnswer | undefined {
  const file = path.join(dir, JUDGE_QUESTION);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CarriedAnswer) : undefined;
}

/** The engine log's first DM `get_state` that shows the world's deeds: what the saved memory brought (design §8). */
export function firstWorldDeeds(engineLog: Array<{ request?: { cmd?: string; viewer?: string }; response?: { result?: unknown } }>): DeedRead[] | undefined {
  for (const l of engineLog) {
    if (l.request?.cmd !== "get_state" || l.request.viewer !== "dm") continue;
    const deeds = (l.response?.result as { state?: { world?: { deeds?: DeedRead[] } } } | undefined)?.state?.world?.deeds;
    if (deeds) return deeds;
  }
  return undefined;
}

/**
 * The report's Milestone 13 section of a run on a carried roster: the deeds the saved memory
 * brought, the carried card, its choice and deed, its lines, and the answer deed "written, unread".
 */
export function carriedReport(run: RunRecord, log: Event[], digests: DigestRecord[], outcomes: Set<string>, first: DeedRead[] | undefined, transcript: TranscriptRecord[] = []): string[] {
  if (run.roster?.party !== "continue") return [];
  const card = carriedCard(log, outcomes);
  const out = ["", "## The world carries the mill", ""];
  out.push(`Deeds the saved world brought (the DM's first world view): ${first ? first.map((d) => `${d.deed} (by ${d.by.join(", ") || "nobody"}, day ${d.day}, contract ${d.contract})`).join("; ") || "none" : "no DM world view in the engine log"}`);
  if (!card) return [...out, "No arrival card read an outcome deed of an earlier contract."];
  out.push(`Card: ${card.card}, reading ${card.reads.map((d) => d.deed).join(", ")}`);
  // A yard that ended in a fight to the last is not the party's choice: a wolf may have been last (design §8).
  if (card.reads.some((d) => d.deed === "yard_to_the_end")) out.push("At the mill: no goblin was taken.");
  else if (card.reads.some((d) => d.deed === "snitt_yielded")) out.push("At the mill: a goblin yielded in the yard and was taken alive.");
  out.push(card.decided ? `Choice: ${card.decided.choice} (${card.decided.how})` : "Choice: not decided by the run's end");
  // The answer deed: nothing in this run or its world reads it yet.
  const read = new Set(log.flatMap((e) => (e.kind === "card_shown" ? (e.reads ?? []).map((d) => d.deed) : [])));
  for (const d of card.wrote) out.push(`Deed: ${d}, ${read.has(d) ? "written and read in this run" : "written, unread"}`);
  const lines = cardLines(digests, card, transcript);
  out.push("", "Its lines:", ...(lines.length > 0 ? lines.map((d) => `> ${d.line}. ${d.text}`) : ["(the narration digest has not run)"]));
  return out;
}

/** The report's Milestone 13 section, from the run folder: empty for a run not on a carried roster. */
export function m13Report(dir: string, run: RunRecord, log: Event[], pack: string): string[] {
  if (run.roster?.party !== "continue") return [];
  const digests = existsSync(path.join(dir, NARRATION_DIGEST)) ? readDigest(dir).digests : [];
  const engineLog = readLines<Parameters<typeof firstWorldDeeds>[0][number]>(path.join(dir, ENGINE_LOG));
  const transcript = readLines<TranscriptRecord>(path.join(dir, "transcript.jsonl"));
  return carriedReport(run, log, digests, sceneOutcomesOf(pack), firstWorldDeeds(engineLog), transcript);
}
