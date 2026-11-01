// The action card (AGT-70) and the agents' option text read the rule's own summary from the engine
// (contract 1.0.0-dev.38): the choices carry it, the seat's own two lines have ours, and an agent
// reads each summary once a session.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChoices } from "../src/table/choices.ts";
import { cardText, costText, SEAT_LINE_IDS } from "../src/table/guide.ts";
import { cardRows, rowText } from "../src/ui/panel.ts";
import { formatOptions, type LegalActionsResult } from "../src/view.ts";

test("the card shows the engine's summary, ours only for Move and End turn", () => {
  assert.equal(cardText({ id: "dodge", summary: "Until the start of your next turn…" }), "Until the start of your next turn…");
  assert.equal(cardText({ id: "monster/nimble_escape" }), undefined, "no summary, no card: no fallback text");
  assert.deepEqual(SEAT_LINE_IDS.sort(), ["end_turn", "move"]);
  for (const id of SEAT_LINE_IDS) {
    const text = cardText({ id })!;
    assert.ok(text.length <= 240 && !/\bDC\b|%|\baverage\b|\bchance\b/i.test(text), text);
  }
});

test("an agent reads each option's summary once a session", () => {
  const result = {
    cmd: "legal_actions",
    prompt_id: "p1",
    options: [
      { option_id: "dodge", action: "nat20_core::action.dodge", name: "Dodge", summary: "Until the start of your next turn…", cost: { action: 1, bonus_action: 0, reaction: 0, movement_ft: 0 }, targeting: "self", max_targets: 0, targets: [], variants: [] },
    ],
    unavailable: [],
    can_end_turn: false,
  } as unknown as LegalActionsResult;
  assert.ok(!formatOptions(result).includes("Until the start"), "no set, no summaries (the DM's briefing)");
  const described = new Set<string>();
  assert.match(formatOptions(result, described), /- dodge: Dodge \(action\)\n {2}Until the start of your next turn…/);
  assert.ok(!formatOptions(result, described).includes("Until the start"), "the second listing stays short");
  assert.deepEqual([...described], ["nat20_core::action.dodge"]);
});

test("a choice carries the option it plays and its cost; Move and End turn carry their own", () => {
  const cost = { action: 1, bonus_action: 0, reaction: 0, movement_ft: 0 };
  const result = {
    cmd: "legal_actions",
    prompt_id: "p1",
    options: [
      {
        name: "Longsword attack",
        summary: "Attack a creature within the weapon's reach. A hit deals the weapon's damage.",
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
  const summary = "Attack a creature within the weapon's reach. A hit deals the weapon's damage.";
  assert.deepEqual(choices[0].about, { id: "melee_attack/longsword", cost, summary });
  assert.deepEqual(choices.find((c) => c.next)?.next?.[0].about, { id: "melee_attack/longsword", cost, summary }, "the follow-up pick too");
  assert.deepEqual(choices.at(-1)?.about, { id: "end_turn" });
  assert.equal(costText(cost), "Action");
  assert.equal(costText({ action: 0, bonus_action: 1, reaction: 0, movement_ft: 0, spell_slot: 1 }), "Bonus Action · level 1 slot");
  assert.equal(costText({ action: 0, bonus_action: 0, reaction: 0, movement_ft: 0 }), undefined);
  const card = cardRows("Longsword attack → goblin_3", "Action", summary, 40).map(rowText);
  assert.equal(card[0], "Longsword attack → goblin_3 · Action");
  assert.ok(card.slice(1).every((r) => r.length <= 40), card.join("\n"));
});
