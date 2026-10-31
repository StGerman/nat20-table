// The action card's text (AGT-70): an entry for every option the pregens get, the same words as
// the AI players' rules primer, no numbers the engine hasn't shown, and the choices carry the id.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildChoices } from "../src/table/choices.ts";
import { costText, guideFor, GUIDE_IDS } from "../src/table/guide.ts";
import { cardRows, rowText } from "../src/ui/panel.ts";
import type { LegalActionsResult } from "../src/view.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

/** Every option id the recorded games and the contract fixtures offered. */
function recordedIds(): string[] {
  const files = [
    ...readdirSync(path.join(HERE, "fixtures")).map((f) => path.join(HERE, "fixtures", f)),
    ...readdirSync(path.join(ROOT, "contract/fixtures")).map((f) => path.join(ROOT, "contract/fixtures", f)),
  ].filter((f) => f.endsWith(".jsonl"));
  const ids = new Set<string>();
  for (const file of files) for (const m of readFileSync(file, "utf8").matchAll(/"option_id":"([^"]+)"/g)) ids.add(m[1]);
  return [...ids].sort();
}

test("every option the party has been offered has a card; only the monsters' own go without", () => {
  const missing = recordedIds().filter((id) => !guideFor(id) && !id.startsWith("monster/") && !/^melee_attack\/(wolf_bite|giant_rat_bite)$/.test(id));
  assert.deepEqual(missing, []);
  // A spell's slot level and a weapon's name share one entry.
  assert.equal(guideFor("cast/bless/1")?.text, guideFor("cast/bless")?.text);
  assert.equal(guideFor("melee_attack/greataxe")?.text, guideFor("melee_attack/longsword")?.text);
  assert.equal(guideFor("barbarian/reckless_attack_reaction")?.text, guideFor("barbarian/reckless_attack")?.text);
  assert.equal(guideFor("nothing/we_know"), undefined);
});

test("the card describes and never computes: no DCs, odds or averages (Rule 4)", () => {
  for (const id of GUIDE_IDS) {
    const text = guideFor(id)!.text;
    assert.ok(!/\bDC\b|%|\baverage\b|\bchance\b/i.test(text), `${id}: ${text}`);
    assert.ok(text.length <= 240, `${id}: keep it to a few lines of the pane`);
  }
});

test("Dash, Disengage and Dodge say what the AI players' primer says", () => {
  const primer = readFileSync(path.join(HERE, "../src/agents/primer/rules.md"), "utf8");
  for (const [id, name] of [["dash", "Dash"], ["disengage", "Disengage"], ["dodge", "Dodge"]]) {
    const line = primer.split("\n").find((l) => l.startsWith(`- **${name}:**`))!;
    const said = line.replace(`- **${name}:** `, "");
    const text = guideFor(id)!.text;
    assert.equal(text.charAt(0).toLowerCase() + text.slice(1), said);
  }
});

test("a choice carries the option it plays and its cost; Move and End turn carry their own", () => {
  const cost = { action: 1, bonus_action: 0, reaction: 0, movement_ft: 0 };
  const result = {
    cmd: "legal_actions",
    prompt_id: "p1",
    options: [
      {
        name: "Longsword attack",
        option_id: "melee_attack/longsword",
        action: "attack",
        cost,
        targeting: "single",
        max_targets: 1,
        targets: [
          { handle: "goblin_3", side: "hostile", distance_ft: 5, in_range: true },
          { handle: "goblin_4", side: "hostile", distance_ft: 24, in_range: false },
        ],
        variants: [],
      },
    ],
    unavailable: [],
    can_end_turn: true,
  } as unknown as LegalActionsResult;
  const choices = buildChoices(result, undefined, true);
  assert.deepEqual(choices[0].about, { id: "melee_attack/longsword", cost });
  assert.deepEqual(choices.find((c) => c.next)?.next?.[0].about, { id: "melee_attack/longsword", cost }, "the follow-up pick too");
  assert.deepEqual(choices.at(-1)?.about, { id: "end_turn" });
  assert.equal(costText(cost), "Action");
  assert.equal(costText({ action: 0, bonus_action: 1, reaction: 0, movement_ft: 0, spell_slot: 1 }), "Bonus Action · level 1 slot");
  assert.equal(costText({ action: 0, bonus_action: 0, reaction: 0, movement_ft: 0 }), undefined);
  const card = cardRows("Longsword attack → goblin_3", "Action", guideFor("melee_attack/longsword")!.text, 40).map(rowText);
  assert.equal(card[0], "Longsword attack → goblin_3 · Action");
  assert.ok(card.slice(1).every((r) => r.length <= 40), card.join("\n"));
});
