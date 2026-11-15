// AGT-98 (design §4, decision 0067): the seat's lines in the run's language. English keeps every
// line AGT-98 doesn't change byte for byte; Russian renders every recorded event without Latin
// letters, and the dictionary names every option the fixtures offer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Event } from "@nat20-table/engine-client";
import { REPO } from "../src/engine.ts";
import { castParty } from "../src/play/run.ts";
import { ruDictionary, SeatNames, seatLine } from "../src/table/seat-lines.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedPlayer, ScriptedSeat, roadDm } from "../src/table/scripted.ts";
import type { HumanPrompt, PlayerIntent } from "../src/table/types.ts";
import { testTable } from "./helpers.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const logs = readdirSync(FIXTURES).filter((f) => f.endsWith(".session-log.jsonl"));
const events: Event[] = logs.flatMap((f) =>
  readFileSync(path.join(FIXTURES, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Event),
);

/** The kinds whose English seat line AGT-98 changes (design §4's table). */
const CHANGED = new Set(["scene_loaded", "ledger", "rest", "card_drawn", "card_advice", "card_resolved", "time_lost", "roll"]);

/** Latin words a Russian line may carry: roll ids, keys and commands. */
const latin = (line: string) => /[A-Za-z]{2,}/.test(line.replace(/\br\d+\b|Enter|Esc|\/\w+/g, ""));

test("an English seat shows every unchanged line as the engine wrote it", () => {
  const names = new SeatNames();
  let seen = 0;
  for (const e of events) {
    if (CHANGED.has(e.kind)) continue;
    assert.equal(seatLine(e, { names, site: "seat" }), e.text, `${e.kind} seq ${e.seq}`);
    seen++;
  }
  assert.ok(seen > 100);
});

test("a Russian seat shows every recorded event without an English word", () => {
  // The Mill's names; `snare_bend` is the server's own test road (m3_s2_road), which no pack plays.
  const ru = castParty(path.join(REPO, "scenarios/the_silent_mill")).seatRu;
  ru.set("anchor:snare_bend", "поворот с силком");
  const names = new SeatNames("ru", ru);
  let shown = 0;
  for (const e of events) {
    for (const site of ["seat", "log"] as const) {
      const line = seatLine(e, { names, site, human: "bren" });
      if (line === null) continue;
      assert.ok(!latin(line), `${e.kind} seq ${e.seq}: ${line}`);
      shown++;
    }
  }
  assert.ok(shown > 100);
});

test("a drawn card's text shows once at the seat: no seat line, `/log` keeps it (AGT-114 b)", () => {
  const drawn = { kind: "card_drawn", seq: 7, visibility: { scope: "public" }, text: "On the road: A tree lies across the road.", card_text: "A tree lies across the road.", choices: [{ id: "clear", text: "Clear it." }], target: "caravan" } as unknown as Event;
  for (const names of [new SeatNames(), new SeatNames("ru", new Map())]) {
    assert.equal(seatLine(drawn, { names, site: "seat" }), null, names.language);
    const logged = seatLine(drawn, { names, site: "log" });
    assert.ok(logged?.includes("A tree lies across the road."), `${names.language}: ${logged}`);
  }
});

test("a card payment is never called a toll, for any payer, in either language (AGT-114 c)", () => {
  const pay = (from: string, what: object, text: string) => ({ kind: "ledger", seq: 9, visibility: { scope: "public" }, text, from, to: "world", what, reason: "toll" }) as unknown as Event;
  const coins = { kind: "coins", copper: 40 };
  const item = { kind: "item", item: "potion_of_healing", quantity: 1 };
  const en = new SeatNames();
  const ru = new SeatNames("ru", new Map([["bren", "Брен"], ["torva", "Торва"]]));
  const line = (e: Event, names: SeatNames, site: "seat" | "log", human?: string) => seatLine(e, { names, site, ...(human ? { human } : {}) });
  assert.equal(line(pay("bren", coins, "bren pays 4 silver pieces in toll."), en, "seat", "bren"), "You pay 4 silver pieces.");
  assert.equal(line(pay("torva", coins, "torva pays 4 silver pieces in toll."), en, "seat", "bren"), "Torva pays 4 silver pieces.");
  assert.equal(line(pay("torva", item, "torva pays a potion of healing in toll."), en, "seat", "bren"), "torva pays a potion of healing.");
  assert.equal(line(pay("bren", coins, "x"), ru, "seat", "bren"), "Вы платите: 4 серебряных.");
  assert.equal(line(pay("torva", coins, "x"), ru, "seat", "bren"), "Торва платит: 4 серебряных.");
  for (const names of [en, ru]) {
    for (const site of ["seat", "log"] as const) {
      for (const from of ["bren", "torva"]) {
        const text = line(pay(from, coins, `${from} pays 4 silver pieces in toll.`), names, site, "bren");
        assert.ok(text && !/toll|пошлин/i.test(text), `${names.language} ${site} ${from}: ${text}`);
      }
    }
  }
});

test("the Russian dictionary names every option the fixtures offer", () => {
  const ids = new Set<string>();
  for (const f of readdirSync(FIXTURES)) {
    for (const m of readFileSync(path.join(FIXTURES, f), "utf8").matchAll(/"option_id":"([^"]+)"/g)) ids.add(m[1]!);
  }
  const { options } = ruDictionary();
  const missing = [...ids].filter((id) => !(id in options));
  assert.deepEqual(missing, []);
});

/** A Hired Blade who reads `/options` and `/sheet`, then takes the road or makes camp. */
function blade(): (prompt: HumanPrompt, seat: ScriptedSeat) => PlayerIntent {
  let listed = false;
  let seen = 0;
  let sheets = 0;
  return (prompt, seat) => {
    if (prompt.kind !== "explore") return prompt.kind === "combat_turn" || prompt.kind === "pick" ? ScriptedSeat.fight(prompt, seat) : ScriptedSeat.pass(prompt, seat);
    if (!listed) {
      listed = true;
      sheets++;
      return { kind: "command", name: sheets === 3 ? "sheet" : "options" };
    }
    listed = false;
    const refused = seat.shown.slice(seen).some((e) => e.kind === "info" && /Не принято/.test(e.title));
    seen = seat.shown.length;
    const act = (k: string) => seat.choices.find((c) => c.act?.kind === k);
    const choice = refused ? act("rest_night") : (act("travel") ?? act("rest_night"));
    return choice ? { kind: "option", number: choice.number } : { kind: "text", text: "Стою на страже." };
  };
}

/** Every string a seat event carries, split into lines. */
function texts(e: Record<string, unknown>): string[] {
  if (e.kind === "narration" || e.kind === "speech") return [];
  const out: string[] = [];
  for (const f of ["text", "title", "line", "prompt", "question"]) if (typeof e[f] === "string") out.push(e[f] as string);
  for (const f of ["lines", "options"]) if (Array.isArray(e[f])) for (const x of e[f] as unknown[]) out.push(typeof x === "string" ? x : JSON.stringify(x));
  return out.flatMap((t) => t.split("\n"));
}

test("a Russian seat on the road to Wend reads Russian, cards and goods included", async () => {
  const pack = path.join(REPO, "scenarios/fair_in_wend");
  const party = ["torva", "maren", "ilsa"];
  const seat = new ScriptedSeat("bren", [], blade());
  const t = await testTable({ seed: 3, pack, human: "bren", players: party, seat, language: "ru" });
  try {
    const loop = new TableLoop({ table: t.table, dm: roadDm(), players: party.map((h) => new ScriptedPlayer(h)), maxSteps: 300, language: "ru", campaign: { party: ["bren", ...party], dayLimit: 4, keepsParty: true } });
    await loop.run("fw_highsteads");
  } finally {
    t.close();
  }
  // Cards, choices and goods read in Russian too (MAP-19): no Latin word at all.
  const offending = seat.shown.flatMap((e) => texts(e as unknown as Record<string, unknown>)).filter(latin);
  assert.deepEqual(offending, []);
  assert.ok(seat.shown.length > 20);
});
