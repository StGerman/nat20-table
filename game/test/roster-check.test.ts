// Rule N2 of the allies-in-fights design (§6.1, MAP-24): the pack check's roster rules, on a small
// campaign pack written here. No engine.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { rosterProblems } from "../src/pack/campaign.ts";

function pack(npcs: unknown[], cards: unknown[], glossary: Record<string, string> = {}): { dir: string; close(): void } {
  const dir = mkdtempSync(path.join(tmpdir(), "roster-check-"));
  const world = path.join(dir, "worlds", "t");
  mkdirSync(path.join(world, "deck"), { recursive: true });
  writeFileSync(path.join(world, "map.json"), JSON.stringify({ places: [] }));
  writeFileSync(path.join(world, "npcs.json"), JSON.stringify({ npcs }));
  writeFileSync(path.join(world, "deck", "d.json"), JSON.stringify({ cards }));
  const campaign = { party: [{ handle: "bren", names: ["Bren", "Брен"] }], glossary_ru: glossary, world: { map: "t", start: "a", road_scene: "r", caravan: { owner: "npc:odda" } } };
  writeFileSync(path.join(dir, "campaign.json"), JSON.stringify(campaign));
  return { dir, close: () => rmSync(dir, { recursive: true, force: true }) };
}

const ODDA = { id: "odda", name: "Odda Vell", names: ["Odda", "Одда", "Одду"] };
const card = (id: string, text_ru: string, who: { cast?: string[]; tells?: string[] } = {}) => ({ id, text: "Text.", text_ru, ...who, choices: [{ id: "a", text: "A", text_ru: "А" }] });

test("a pack whose cards name only their cast and tells, with one person per form, has no roster problem", () => {
  const p = pack([ODDA], [card("one", "Одда кивает.", { cast: ["owner"] }), card("two", "Про Одду говорят.", { tells: ["odda"] }), card("three", "Дорога.")], { "Bald Hill": "Лысая гора" });
  try {
    assert.deepEqual(rosterProblems(p.dir), []);
  } finally {
    p.close();
  }
});

test("a shared form, a card naming someone outside its cast and tells, and a person in glossary_ru are each a problem", () => {
  const gwyn = { id: "gwyn", names: ["Gwyn", "Гвин", "Bren"] };
  const p = pack([ODDA, gwyn], [card("one", "Одда смотрит на Гвин.", { cast: ["owner"] })], { "Odda Vell": "Одда Велл" });
  try {
    assert.deepEqual(rosterProblems(p.dir), [
      "name form Bren is shared by gwyn and bren",
      "card one names gwyn, who is in neither its cast nor its tells",
      "glossary_ru Odda Vell is odda, a person of the roster: the roster holds their names",
    ]);
  } finally {
    p.close();
  }
});
