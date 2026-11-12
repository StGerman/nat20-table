// The run report's "Word on the road" section (Milestone 11, AGT-91, design "The run report and
// the verdict"): every deed, every card with how it came and what it paid off, the draw-three
// counts, every fight, every scout look, and the DM's suggested cards. A pure function of the run
// folder, like the verdict, so it can be written again anywhere.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Event, Handle } from "@nat20-table/engine-client";
import { SESSION_LOG } from "../engine.ts";
import { cardsMet, type CardMet } from "./verdict.ts";
import { readLines } from "./record.ts";

/** The DM's suggested cards after the run (decision 4): deck-file JSON, never loaded. */
export const SUGGESTED_CARDS = "suggested-cards.json";

const readLog = (dir: string): Event[] => readLines<Event>(path.join(dir, SESSION_LOG));

/** One fight in the run: what started it, how many rounds, who dropped. */
export interface FightMet {
  seq: number;
  /** The card whose choice started it, or none for the DM's or a scene's. */
  card?: string;
  choice?: string;
  rounds: number;
  dropped: Handle[];
  /** How it ended, as `combat_over` says; absent when the run ended first. */
  ended?: string;
}

/** Every fight in the log, with the card that started it (from `cardsMet`). */
export function fightsMet(log: Event[], cards: CardMet[]): FightMet[] {
  const out: FightMet[] = [];
  let open: FightMet | undefined;
  for (const e of log) {
    if (e.kind === "combat_started") {
      // The card that started it: the last card before it, when `cardsMet` gave it a fight that
      // no earlier fight has claimed.
      const card = cards.filter((c) => c.seq < e.seq).at(-1);
      const its = card?.fight === true && !out.some((f) => f.seq > card.seq && f.card === card.card);
      open = { seq: e.seq, rounds: 0, dropped: [], ...(its ? { card: card.card, ...(card.decided ? { choice: card.decided } : {}) } : {}) };
      out.push(open);
    } else if (!open) continue;
    else if (e.kind === "round") open.rounds = Math.max(open.rounds, e.number);
    else if (e.kind === "life_state" && e.state !== "conscious" && !open.dropped.includes(e.target)) open.dropped.push(e.target);
    else if (e.kind === "combat_over") {
      open.ended = e.reason;
      open = undefined;
    }
  }
  return out;
}

const cameText = (c: CardMet) =>
  c.came === "dm_pick" ? `the DM picked it: ${c.reason ?? "no reason given"}` : c.came === "engine_pick" ? "the DM did not answer; the engine took the first card" : c.came === "soon" ? "an earlier choice sent it" : "the only card the draw rolled";

/** The section's lines, or none for a run with no living world (no card met, no deed). */
export function wordReport(dir: string): string[] {
  const log = readLog(dir);
  const cards = cardsMet(log);
  const deeds = log.flatMap((e) => (e.kind === "deed_remembered" ? [e] : []));
  if (cards.length === 0 && deeds.length === 0 && !log.some((e) => e.kind === "cards_offered")) return [];
  const fights = fightsMet(log, cards);
  const offered = log.flatMap((e) => (e.kind === "cards_offered" ? [e] : []));
  const picks = cards.filter((c) => c.came === "dm_pick");
  const looks = cards.filter((c) => c.scout);
  const saw = looks.filter((c) => c.scout!.saw);
  const taken = saw.filter((c) => c.forewarned !== undefined && c.decided === c.forewarned);
  const out = ["", "## Word on the road", "", `Deeds written this run: ${deeds.length}`];
  for (const d of deeds) out.push(`- ${d.deed}: contract ${d.contract}, day ${d.day}, by ${d.by.join(", ") || "nobody who spoke"}`);
  out.push("", `Cards on the table: ${cards.length}`);
  cards.forEach((c, i) => {
    const parts = [`${c.when}`, cameText(c), c.decided ? `decided: ${c.decided}` : "not decided when the run ended"];
    if (c.reads.length > 0) parts.push(`reads ${c.reads.map((d) => `${d.deed} (contract ${d.contract}, day ${d.day})`).join(", ")}`);
    if (c.scout) parts.push(`${c.scout.actor} scouted (${c.scout.roll}) and ${c.scout.saw ? `saw it${c.forewarned ? `; forewarned choice ${c.forewarned} ${c.decided === c.forewarned ? "taken" : "not taken"}` : ""}` : "missed it"}`);
    if (c.fight) parts.push("it came to a fight");
    out.push(`${i + 1}. ${c.card}: ${parts.join("; ")}`);
  });
  const paid = cards.filter((c) => c.reads.length > 0);
  out.push("", `Pay-offs (a card that read a deed): ${paid.length}${paid.length > 0 ? `: ${paid.map((c) => `${c.card} (${c.reads.map((d) => d.deed).join(", ")})`).join("; ")}` : ""}`);
  // The cards each offer passed over: all but the one that went on the table next.
  const passed = offered.flatMap((o) => {
    const pick = cards.find((c) => c.seq > o.seq);
    return pick ? o.cards.filter((x) => x.id !== pick.card).map((x) => x.id) : [];
  });
  out.push(
    `Draw three: ${offered.length} draws offered cards; ${picks.length} DM picks, ${picks.filter((c) => c.reads.length > 0).length} of them a card that reads a deed; ${cards.filter((c) => c.came === "engine_pick").length} draws the DM did not answer; passed over: ${passed.join(", ") || "none"}`,
  );
  out.push("", `Fights: ${fights.length}`);
  for (const f of fights) out.push(`- ${f.card ? `card ${f.card}, choice ${f.choice ?? "?"}` : "started by the DM or a scene"}: ${f.rounds} rounds; dropped: ${f.dropped.join(", ") || "nobody"}${f.ended ? `; ended: ${f.ended}` : "; still on at the end"}`);
  out.push("", `Scout looks: ${looks.length}, ${saw.length} saw it, ${taken.length} forewarned choices taken`);
  const file = path.join(dir, SUGGESTED_CARDS);
  if (existsSync(file)) {
    const suggested = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown[]; why?: unknown[]; unread?: unknown };
    if (typeof suggested.unread === "string") {
      // Not JSON: the DM's answer as written.
      out.push("", `The DM's suggested cards (not loaded; ${SUGGESTED_CARDS}) were not JSON; as written:`, ...suggested.unread.split("\n").map((l) => `> ${l}`));
    } else {
      const cards = Array.isArray(suggested.cards) ? suggested.cards : [];
      const field = (c: unknown, key: string): string => {
        const v = c !== null && typeof c === "object" ? (c as Record<string, unknown>)[key] : undefined;
        return typeof v === "string" ? v : "";
      };
      out.push("", `The DM's suggested cards (not loaded; ${SUGGESTED_CARDS}): ${cards.length}`);
      cards.forEach((c, i) => {
        const why = Array.isArray(suggested.why) && typeof suggested.why[i] === "string" ? ` (why: ${suggested.why[i]})` : "";
        out.push(`- ${field(c, "id") || "?"}: ${field(c, "text")}${why}`);
      });
    }
  } else out.push("", "The DM's suggested cards: none written");
  return out;
}
