// Fallen allies in a fight, for the run report (hands-and-check spec A3-M, TASKS.md AGT-57).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionOption, Event } from "@nat20-table/engine-client";
import { fallenLines } from "../src/play/run.ts";
import { isFallen, lifts, liftsOn, turnOutcome, type LiftChance } from "../src/table/fallen.ts";

/** An option with only the fields the lift check reads; `targets` as [handle, distance, in range]. */
const option = (option_id: string, fields: Partial<ActionOption> = {}, targets: Array<[string, number, boolean]> = []) =>
  ({
    option_id,
    variants: [],
    range_ft: 5,
    targets: targets.map(([handle, distance_ft, in_range]) => ({ handle, distance_ft, in_range, side: "party" })),
    ...fields,
  }) as unknown as ActionOption;
const spell = (id: string) => ({ spell: { id, level: 1, concentration: false } }) as unknown as Partial<ActionOption>;

let seq = 0;
const at = (fields: Record<string, unknown>) => ({ seq: ++seq, round: 3, text: "", ...fields }) as unknown as Event;

test("a lift is a Potion of Healing, Divine Spark's heal, Cure Wounds or Healing Word; Spare the Dying and an attack aren't", () => {
  assert.ok(lifts(option("use/potion_of_healing")));
  assert.ok(lifts(option("cleric/divine_spark", { variants: [{ name: "Heal", variant: "divine_spark/heal" }] })));
  assert.ok(!lifts(option("cleric/divine_spark", { variants: [{ name: "Radiant", variant: "divine_spark/radiant" }] })));
  assert.ok(lifts(option("cast/cure_wounds/1", spell("cure_wounds"))));
  assert.ok(lifts(option("cast/healing_word/1", spell("healing_word"))));
  assert.ok(!lifts(option("cast/spare_the_dying", spell("spare_the_dying"))));
  assert.ok(!lifts(option("melee_attack/mace")));
  assert.deepEqual(["conscious", "unconscious", "stable", "dead"].map((s) => isFallen(s as never)), [false, true, true, false]);
});

test("a lift counts on a fallen ally in range now, or within a straight walk with the movement left", () => {
  const options = [
    option("use/potion_of_healing", {}, [["ilsa", 20, false], ["torva", 40, false], ["bren", 5, true]]),
    option("cast/healing_word/1", { ...spell("healing_word"), range_ft: 60 }, [["torva", 40, true]]),
    option("melee_attack/mace", {}, [["goblin_5", 5, true]]),
  ];
  // Bren stands beside Maren but isn't down; Torva is too far for the potion, not for Healing Word.
  assert.deepEqual(liftsOn(options, ["ilsa", "torva"], { action: 1, bonus_action: 1, movement_ft: 30, reaction: 1, speed_ft: 30 }), [
    { ally: "ilsa", option_id: "use/potion_of_healing", distance_ft: 20 },
    { ally: "torva", option_id: "cast/healing_word/1", distance_ft: 40 },
  ]);
  // With no movement left only what is in range now counts.
  assert.deepEqual(liftsOn(options, ["ilsa"], { action: 1, bonus_action: 1, movement_ft: 0, reaction: 1, speed_ft: 30 }), []);
});

test("a turn with a fallen ally and a lift in reach where the player attacked is a missed lift on the report", () => {
  const events = [
    at({ kind: "action", actor: "maren", option_id: "cast/sacred_flame", name: "Sacred Flame", targets: ["goblin_5"] }),
    at({ kind: "damage_taken", target: "goblin_5", amount: 4, damage_type: "radiant" }),
    at({ kind: "turn_end", actor: "maren" }),
    // The next turn is someone else's: a lift there isn't Maren's.
    at({ kind: "turn_start", actor: "bren" }),
    at({ kind: "healed", target: "torva", amount: 7 }),
  ];
  const outcome = turnOutcome(events, "maren", ["torva"]);
  assert.deepEqual(outcome, { lifted: [], did: ["Sacred Flame on goblin_5"] });
  const chance: LiftChance = {
    handle: "maren",
    at: "2026-10-30T19:10:00.000Z",
    scene: "s5_mill_cellar",
    fallen: ["torva"],
    lifts: [{ ally: "torva", option_id: "cleric/divine_spark", distance_ft: 18 }],
    ...outcome,
  };
  const lifted: LiftChance = { ...chance, handle: "bren", lifts: [{ ally: "torva", option_id: "use/potion_of_healing", distance_ft: 5 }], lifted: ["torva"], did: ["Potion of Healing on torva"] };
  assert.deepEqual(fallenLines({ liftChances: [chance, lifted], fight: { rounds: 6, lines: 0 } }), [
    "- Fallen allies: 2 chances, 1 lifted, 1 missed",
    "  - missed: 2026-10-30T19:10:00.000Z s5_mill_cellar maren: torva down; could cleric/divine_spark on torva at 18 ft; did Sacred Flame on goblin_5",
  ]);
  // A run with no fight has no line; one with fights and no fallen ally shows the zero.
  assert.deepEqual(fallenLines({ liftChances: [], fight: { rounds: 0, lines: 0 } }), []);
  assert.deepEqual(fallenLines({ liftChances: [], fight: { rounds: 3, lines: 0 } }), ["- Fallen allies: 0 chances, 0 lifted, 0 missed"]);
});

test("a fallen ally healed in the player's own turn is lifted, whichever lift it took", () => {
  const events = [
    at({ kind: "moved", creature: "torva" }),
    at({ kind: "action", actor: "torva", option_id: "use/potion_of_healing", name: "Potion of Healing", targets: ["bren"] }),
    at({ kind: "item_used", actor: "torva", item: "potion_of_healing", target: "bren" }),
    at({ kind: "healed", target: "bren", amount: 6 }),
    at({ kind: "action", actor: "torva", option_id: "melee_attack/greataxe", name: "Greataxe attack", targets: ["boss"] }),
    at({ kind: "turn_end", actor: "torva" }),
  ];
  assert.deepEqual(turnOutcome(events, "torva", ["bren", "ilsa"]), { lifted: ["bren"], did: ["Potion of Healing on bren", "Greataxe attack on boss"] });
});
