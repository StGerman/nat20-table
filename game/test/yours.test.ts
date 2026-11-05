// What the engine did for the human's own character shows at once, in plain words (B4, Stas's
// Wend run 2026-11-05): the wages, the coin taken and the experience were held with others'
// lines and dropped under the DM's narration, so the human never learned he was paid.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Event } from "@nat20-table/engine-client";
import { ScriptedSeat } from "../src/table/scripted.ts";
import { coinPhrase, formatSheet, yourLine } from "../src/view.ts";
import { testTable } from "./helpers.ts";

const ledger = (from: string, to: string, copper: number, reason: string) =>
  ({ kind: "ledger", seq: 1, text: "", visibility: { scope: "public" }, from, to, reason, what: { kind: "coins", copper } }) as unknown as Event;

test("coin and experience for the human's character read as one plain line; anyone else's is not the human's", () => {
  assert.equal(coinPhrase(200), "2 gold pieces");
  assert.equal(coinPhrase(60), "6 silver pieces");
  assert.equal(coinPhrase(121), "1 gold piece, 2 silver pieces and 1 copper piece");
  assert.equal(yourLine(ledger("npc:odda_vell", "bren", 200, "wage"), "bren"), "You are paid your wages: 2 gold pieces.");
  assert.equal(yourLine(ledger("cudgel_man", "bren", 60, "loot"), "bren"), "You take 6 silver pieces.");
  assert.equal(yourLine(ledger("ilsa", "bren", 60, "trade"), "bren"), "Ilsa gives you 6 silver pieces.");
  assert.equal(yourLine(ledger("bren", "world", 300, "inn"), "bren"), "You pay 3 gold pieces for the inn.");
  assert.equal(yourLine(ledger("cudgel_man", "ilsa", 60, "loot"), "bren"), undefined, "Ilsa's purse is the DM's to narrate");
  const xp = (actor: string, can: boolean) => ({ kind: "xp_awarded", seq: 2, text: "", visibility: { scope: "public" }, actor, xp: 25, total: 325, can_level_up: can }) as unknown as Event;
  assert.equal(yourLine(xp("bren", false), "bren"), "You gain 25 experience, 325 in all.");
  assert.equal(yourLine(xp("bren", true), "bren"), "You gain 25 experience, 325 in all: enough for your next level.");
  assert.equal(yourLine(xp("maren", false), "bren"), undefined);
});

test("the advance the merchant pays at the start shows to the human at once, and /sheet has the purse", async () => {
  const seat = new ScriptedSeat("bren", []);
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"], seat });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" }));
    t.table.observe(await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] }));
    await t.table.flush();
    const engine = seat.shown.filter((e) => e.kind === "engine");
    const paid = engine.find((e) => e.kind === "engine" && e.text === "You are paid your wages: 2 gold pieces.");
    assert.ok(paid?.kind === "engine" && paid.own, JSON.stringify(engine));
    const maren = engine.find((e) => e.kind === "engine" && e.text.includes("pays maren"));
    assert.ok(maren?.kind === "engine" && !maren.own, "maren's wages wait for the narration");
    const sheet = await t.engine.request("bren", { cmd: "get_sheet", actor: "bren" });
    assert.ok(sheet.result?.cmd === "get_sheet");
    assert.match(formatSheet(sheet.result.sheet), /^Purse: .*\d+ gold.*\.$/m);
  } finally {
    t.close();
  }
});
