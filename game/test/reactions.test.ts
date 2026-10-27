// Which event in a fight the AI players may react to, and who may (party talk §5 R1, TASKS.md AGT-34).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Event } from "@nat20-table/engine-client";
import { mayReact, triggerIn, type Trigger } from "../src/table/reactions.ts";

const PARTY = ["bren", "torva", "maren", "ilsa"];
const PLAYERS = ["torva", "maren", "ilsa"];

let seq = 0;
/** An event in combat round 2, in the DM's view; only the fields the triggers read. */
const at = (fields: Record<string, unknown>, round: number | null = 2) => ({ seq: ++seq, round, text: "", ...fields }) as unknown as Event;
const turn = (actor: string) => at({ kind: "turn_start", actor });
const lifeState = (target: string, state: string) => at({ kind: "life_state", target, state });
const roll = (roller: string, target: string, outcome: string) => at({ kind: "roll", roll: { roller, target, outcome } });
const damage = (target: string) => at({ kind: "damage_taken", target, amount: 4, damage_type: "slashing" });

test("a batch's trigger is its most salient event, an ally down before anything else", () => {
  const events = [turn("goblin_1"), damage("torva"), roll("goblin_1", "maren", "critical_hit"), lifeState("goblin_2", "dead"), lifeState("bren", "unconscious")];
  const trigger = triggerIn(events, PARTY, PLAYERS);
  // The human's character counts as an ally like any other.
  assert.deepEqual(
    { kind: trigger?.kind, subject: trigger?.subject, by: trigger?.by, round: trigger?.round },
    { kind: "ally_down", subject: "bren", by: "goblin_1", round: 2 },
  );
  assert.equal(triggerIn(events.slice(0, 4), PARTY, PLAYERS)?.kind, "foe_down");
  assert.equal(triggerIn(events.slice(0, 3), PARTY, PLAYERS)?.kind, "critical");
  assert.equal(triggerIn(events.slice(0, 2), PARTY, PLAYERS)?.kind, "hit");
});

test("an ally back up, a surrender and a critical hit by the party are triggers; a monster's miss isn't", () => {
  assert.equal(triggerIn([turn("maren"), lifeState("ilsa", "conscious")], PARTY, PLAYERS)?.kind, "ally_up");
  assert.equal(triggerIn([at({ kind: "surrendered", handles: ["goblin_1"] })], PARTY, PLAYERS)?.kind, "surrender");
  const crit = triggerIn([turn("torva"), roll("torva", "goblin_1", "critical_hit")], PARTY, PLAYERS);
  assert.deepEqual([crit?.kind, crit?.by], ["critical", "torva"]);
  assert.equal(triggerIn([turn("goblin_1"), roll("goblin_1", "torva", "miss")], PARTY, PLAYERS), undefined);
  // Damage to the human's character is not "an AI player is hit"; it gets a reaction only when it drops.
  assert.equal(triggerIn([turn("goblin_1"), damage("bren")], PARTY, PLAYERS), undefined);
  // Out of combat nothing is a trigger.
  assert.equal(triggerIn([at({ kind: "life_state", target: "maren", state: "unconscious" }, null)], PARTY, PLAYERS), undefined);
});

test("only a conscious AI player may react, never the one whose turn is next nor the one whose deed it was", () => {
  const trigger: Trigger = { kind: "foe_down", seq: 1, round: 2, subject: "goblin_1", by: "torva" };
  const conscious = new Set(["bren", "torva", "maren", "ilsa"]);
  assert.deepEqual(mayReact(trigger, PLAYERS, conscious), ["maren", "ilsa"]);
  assert.deepEqual(mayReact(trigger, PLAYERS, conscious, "maren"), ["ilsa"]);
  assert.deepEqual(mayReact(trigger, PLAYERS, new Set(["torva", "maren"]), undefined), ["maren"]);
  // The one it happened to reacts, unless it is down.
  const hit: Trigger = { kind: "hit", seq: 2, round: 2, subject: "ilsa", by: "goblin_1" };
  assert.deepEqual(mayReact(hit, PLAYERS, conscious, "torva"), ["maren", "ilsa"]);
});
