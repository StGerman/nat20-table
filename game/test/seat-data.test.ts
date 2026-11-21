// Structured seat events (AGT-140, Glass Table design §4.3): every event keeps the lines the
// terminal seat draws, and gains the data a window draws them from. Exit row 1: the scripted scenes
// show the same lines at the Ink seat as before the data was added (the goldens in
// fixtures/seat-lines-*.txt were recorded on main before it), with the data beside them.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat, caravanSeat, yardDm } from "../src/table/scripted.ts";
import type { PlayerIntent, TableEvent } from "../src/table/types.ts";
import { UI_WORDS } from "../src/table/words.ts";
import { eventNames } from "../src/table/seat-data.ts";
import { SeatNames } from "../src/table/seat-lines.ts";
import type { Event } from "@nat20-table/engine-client";
import { eventLines } from "../src/ui/lines.ts";
import { testTable } from "./helpers.ts";

const GOLDEN = path.join(import.meta.dirname, "fixtures");

/** The lines the Ink seat draws for each event, one block per event, in the order shown. */
function inkLines(events: TableEvent[], language: "en" | "ru"): string {
  // The echo of the human's input is for a window and the situation for the panel: the Ink seat draws no line for either.
  const drawn = (e: TableEvent) => e.kind !== "said" && e.kind !== "situation";
  for (const e of events) if (!drawn(e)) assert.deepEqual(eventLines(e), []);
  return events.filter(drawn).map((e) => [`# ${e.kind}`, ...eventLines(e, "bren", false, UI_WORDS[language]).map((l) => `${l.tone}\t${l.text}`)].join("\n")).join("\n") + "\n";
}

/** Compares with the golden; `NAT20_RECORD_SEAT_LINES=1` writes it instead (only on a commit whose lines are known good). */
function sameAsGolden(name: string, lines: string): void {
  const file = path.join(GOLDEN, `seat-lines-${name}.txt`);
  if (process.env.NAT20_RECORD_SEAT_LINES === "1" || !existsSync(file)) {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(file, lines);
    if (process.env.NAT20_RECORD_SEAT_LINES !== "1") assert.fail(`no golden ${file}: written; check it in`);
    return;
  }
  assert.equal(lines, readFileSync(file, "utf8"), `the Ink seat's lines for ${name} changed`);
}

/** The yard fight with Bren on a scripted seat that reads its sheet and where it is, then fights. */
async function yard(): Promise<TableEvent[]> {
  const typed: PlayerIntent[] = [
    { kind: "command", name: "sheet" },
    { kind: "command", name: "where" },
  ];
  const seat = new ScriptedSeat("bren", typed, (prompt, s) => (prompt.kind === "combat_turn" || prompt.kind === "pick" ? ScriptedSeat.fight(prompt, s) : ScriptedSeat.pass(prompt, s)));
  const t = await testTable({ seed: 23, seat });
  try {
    const players = ["torva", "maren", "ilsa"].map((h) => new ScriptedPlayer(h));
    await new TableLoop({ table: t.table, dm: yardDm(), players, maxSteps: 500, situation: true }).run("m5_s3_yard");
    return seat.shown;
  } finally {
    t.close();
  }
}

/** Fair in Wend's first days at a Russian seat: Bren drives the caravan; the scripted DM opens each card. */
async function road(): Promise<TableEvent[]> {
  const pack = path.join(REPO, "scenarios/fair_in_wend");
  const seat = new ScriptedSeat("bren", [], caravanSeat());
  const t = await testTable({ seed: 3, pack, human: "bren", players: ["torva", "maren", "ilsa"], seat, language: "ru" });
  try {
    const party = ["bren", "torva", "maren", "ilsa"];
    const dm = new ScriptedDm({
      card: async (tools) => void (await tools.narrate("Люди с карточки выходят вперёд.")),
      scene_open: async (tools) => void (await tools.narrate("Дорога ждёт.")),
    });
    await new TableLoop({ table: t.table, dm, players: party.slice(1).map((h) => new ScriptedPlayer(h)), maxSteps: 200, language: "ru", situation: true, campaign: { party, dayLimit: 2 } }).run("fw_highsteads");
    return seat.shown;
  } finally {
    t.close();
  }
}

/** No field a player view never carries (Rule 3): a roll's target number or where it came from, a DC. */
function noHiddenFields(events: TableEvent[]): void {
  const json = JSON.stringify(events);
  assert.doesNotMatch(json, /"(against|dc_source|advantage_sources|modifiers|dc|purse_cp|zone)":/);
}

test("the yard fight shows the same lines at the Ink seat, with the data a window draws beside them (exit row 1)", async () => {
  const events = await yard();
  sameAsGolden("yard-en", inkLines(events, "en"));
  noHiddenFields(events);
  const rolls = events.filter((e) => e.kind === "engine" && e.roll);
  assert.ok(rolls.length > 0);
  for (const e of rolls) {
    assert.ok(e.kind === "engine" && e.event?.kind === "roll" && e.event.roll.id === e.roll && e.event.roll.view === "player", "each roll line carries its player-view roll");
    assert.ok(e.kind === "engine" && e.names && Object.keys(e.names).includes(e.event.kind === "roll" ? e.event.roll.roller : ""), "and the roller's name");
  }
  const told = events.flatMap((e) => (e.kind === "narration" ? (e.rolls ?? []) : []));
  assert.ok(told.length > 0, "a narration names the rolls it tells");
  for (const id of told) assert.ok(rolls.some((e) => e.kind === "engine" && e.roll === id), `${id} was a roll line the seat was shown`);
  const options = events.filter((e) => e.kind === "options" && e.budget);
  assert.ok(options.length > 0 && options.every((e) => e.kind === "options" && e.uses !== undefined), "a turn's options carry the uses left");
  assert.ok(options.some((e) => e.kind === "options" && e.unavailable?.some((u) => u.message.length > 0)), "and what is not open now, with why");
  const sheet = events.find((e) => e.kind === "info" && e.sheet);
  assert.ok(sheet?.kind === "info" && sheet.sheet?.sheet.handle === "bren" && sheet.sheet.shown.bren === "Bren", "/sheet carries the human's own sheet");
  const placed = events.find((e) => e.kind === "situation" && e.positions);
  assert.ok(placed?.kind === "situation" && placed.positions && Object.keys(placed.positions.creatures).length > 0 && placed.positions.anchors.length > 0, "the situation carries positions and anchors");
  const said = events.filter((e) => e.kind === "said");
  assert.deepEqual(said.slice(0, 2).map((e) => e.kind === "said" && e.text), ["/sheet", "/where"], "every input is echoed by the host");
  assert.ok(said.some((e) => e.kind === "said" && e.intent.kind === "option" && /^\d+\. \S/.test(e.text)), "a number as the list line it named");
});

test("Fair in Wend's road shows the same lines at a Russian Ink seat, with the card, the road and the contract as data (exit row 1)", async () => {
  const events = await road();
  sameAsGolden("road-ru", inkLines(events, "ru"));
  noHiddenFields(events);
  const card = (events.find((e) => e.kind === "info" && e.card) as Extract<TableEvent, { kind: "info" }> | undefined)?.card;
  assert.ok(card && card.choices.length >= 2 && /[а-я]/.test(card.text) && /[а-я]/.test(card.choices[0]!.text), "a card in the seat's words");
  assert.ok(card.decides.length > 0);
  const listed = events.filter((e) => e.kind === "options" && e.card);
  assert.ok(listed.length > 0, "a card's list carries the card");
  const voted = events.some((e) => e.kind === "options" && e.card && e.card.said.length > 0) || events.some((e) => e.kind === "engine" && e.event?.kind === "card_advice");
  assert.ok(voted, "who said what reaches the seat as data");
  const world = (events.find((e) => e.kind === "situation" && e.road) as Extract<TableEvent, { kind: "situation" }> | undefined)?.road;
  assert.ok(world?.contract && world.contract.blades.length > 0 && /[А-Я]/.test(world.contract.merchant_name), "the contract's terms with the merchant's name");
  assert.ok(world.places.length > 0 && world.places.every((p) => p.name.length > 0));
});

test("eventNames names every creature an event names: handles, a thief, an effect's source, the placed", () => {
  const names = new SeatNames("ru", new Map([["bren", "Брен"], ["wolf_1", "Волк 1"], ["npc:bel", "Бел"], ["npc:tam", "Там"]]));
  const named = (event: unknown) => eventNames(event as Event, names);
  assert.deepEqual(named({ kind: "fled", handles: ["wolf_1"] }), { wolf_1: "Волк 1" });
  assert.deepEqual(named({ kind: "theft_noticed", thief: "npc:tam" }), { "npc:tam": "Там" });
  assert.deepEqual(named({ kind: "npc_named", placed: ["npc:bel"] }), { "npc:bel": "Бел" });
  assert.deepEqual(named({ kind: "effect_started", source: "bren", target: "wolf_1", effect: "x", name: "x" }), { bren: "Брен", wolf_1: "Волк 1" });
  // A roll's dice `source` names what they are for, not a creature.
  assert.deepEqual(named({ kind: "roll", roll: { roller: "bren", dice: [{ source: "d20", dice: "1d20", results: [3] }] } }), { bren: "Брен" });
});
