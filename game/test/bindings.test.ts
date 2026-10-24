// Seat and tool bindings (M6 step 4, TASKS.md AGT-18): no player tool reaches another viewer or acts
// out of turn, extra input fields go nowhere, the DM can't decide for an AI player, a stale prompt is
// the orchestrator's problem. Runs the real engine, seeded: m5_s3_yard with seed 27 opens with
// Bren's turn, then goblin_2 and the wolves, then Ilsa (contract/fixtures/m5_fights.jsonl).
import assert from "node:assert/strict";
import { test } from "node:test";
import { DmTools, PlayerTools } from "../src/table/tools.ts";
import { testTable } from "./helpers.ts";

test("a player tool can't act out of turn, and the engine never sees the attempt", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    const maren = new PlayerTools("maren", t.table);
    assert.equal((await dm.loadScene("m5_s3_yard")).ok, true);
    assert.equal((await dm.startCombat("yard_fight")).ok, true);
    assert.deepEqual(t.table.awaiting.kind === "action" && t.table.awaiting.actor, "bren");
    for (const outcome of [
      await maren.submitDecision({ option_id: "cast/bless/1", targets: ["bren"] }),
      await maren.endTurn(),
      await maren.move({ kind: "anchor", anchor: "woodpile" }),
      await maren.legalActions(),
      await maren.react(null),
    ]) {
      assert.equal(outcome.ok, false);
      assert.match(outcome.text, /^not now/);
    }
    const acted = t.requests().filter((r) => ["submit", "end_turn", "move", "legal_actions", "react"].includes(r.cmd as string));
    assert.deepEqual(acted, [], "refused before the engine");
    assert.equal(t.table.retries, 0, "an out-of-turn call is the loop's problem, not a retry");
  } finally {
    t.close();
  }
});

test("tool input can't choose the viewer or the actor", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    await dm.loadScene("m5_s3_yard");
    await dm.startCombat("yard_fight");
    await dm.endTurn(); // Bren; then goblin_2 and the wolves act inside the engine
    assert.deepEqual(t.table.awaiting.kind === "action" && t.table.awaiting.actor, "ilsa");
    const ilsa = new PlayerTools("ilsa", t.table);
    const smuggled = { option_id: "no_such_option", viewer: "dm", actor: "bren", prompt_id: "p999" } as never;
    const outcome = await ilsa.submitDecision(smuggled);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.retryable, true);
    assert.equal(t.table.retries, 1, "a retryable refusal counts toward the decision");
    const submit = t.requests().find((r) => r.cmd === "submit")!;
    assert.equal(submit.viewer, "ilsa");
    assert.equal(submit.actor, "ilsa");
    assert.notEqual(submit.prompt_id, "p999");
  } finally {
    t.close();
  }
});

test("the DM's decision tools act only for the human's character", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    await dm.loadScene("m5_s3_yard");
    await dm.startCombat("yard_fight");
    await dm.endTurn();
    // Ilsa's turn: the DM can neither end it nor submit for her.
    assert.match((await dm.endTurn()).text, /^not now/);
    assert.match((await dm.submit({ option_id: "dodge" })).text, /^not now/);
    assert.match((await dm.move("ilsa", { kind: "anchor", anchor: "woodpile" })).text, /^not now/);
    assert.match((await dm.legalActions()).text, /^not now/);
    const decided = t.requests().filter((r) => ["submit", "end_turn", "move"].includes(r.cmd as string) && r.actor !== "bren");
    assert.deepEqual(decided, []);
  } finally {
    t.close();
  }
});

test("a stale prompt is refreshed and resent once, and is not a retry", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    await dm.loadScene("m5_s3_yard");
    await dm.startCombat("yard_fight");
    await dm.endTurn();
    const awaiting = t.table.awaiting;
    assert.equal(awaiting.kind, "action");
    if (awaiting.kind !== "action") return;
    t.table.awaiting = { ...awaiting, prompt_id: "p1" }; // what the orchestrator believed earlier
    const ended = await new PlayerTools("ilsa", t.table).endTurn();
    assert.equal(ended.ok, true, ended.text);
    assert.equal(t.table.retries, 0);
    const ends = t.requests().filter((r) => r.cmd === "end_turn" && r.actor === "ilsa");
    assert.deepEqual(ends.map((r) => r.prompt_id), ["p1", awaiting.prompt_id]);
  } finally {
    t.close();
  }
});

test("out of combat a player acts once per DM grant, and only an AI player can be granted", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    const maren = new PlayerTools("maren", t.table);
    await dm.loadScene("m5_s3_yard");
    assert.match((await maren.legalActions()).text, /^not now/);
    assert.equal(dm.grantAction("goblin_1").ok, false);
    assert.equal(dm.grantAction("bren").ok, false, "the human acts through the DM's submit");
    assert.equal(dm.grantAction("maren").ok, true);
    const listed = await maren.legalActions();
    assert.equal(listed.ok, true, listed.text);
    assert.match(listed.text, /cast\/bless\/1/);
    const blessed = await maren.submitDecision({ option_id: "cast/bless/1", targets: ["bren", "torva", "ilsa"] });
    assert.equal(blessed.ok, true, blessed.text);
    assert.match((await maren.submitDecision({ option_id: "cast/bless/1", targets: ["bren"] })).text, /^not now/);
    const submits = t.requests().filter((r) => r.cmd === "submit");
    assert.equal(submits.length, 1);
    assert.equal(submits[0].prompt_id, undefined, "an explore submit carries no prompt id");
  } finally {
    t.close();
  }
});

test("a player sees its own numbers and only health bands for others; notes reach only their owner", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    const maren = new PlayerTools("maren", t.table);
    await dm.loadScene("m5_s3_yard");
    const look = await maren.look();
    assert.equal(look.text.match(/HP/g)?.length, 1, look.text);
    assert.doesNotMatch(look.text, /\bAC\b/);
    assert.match(look.text, /Goblin Warrior \(goblin_1, hostile\): unhurt/);
    assert.equal((await maren.note("suspicion", "the reeve knows more than he says")).ok, true);
    assert.equal((await maren.note("gossip" as never, "x")).ok, false);
    assert.deepEqual(t.table.notes.get("maren"), [{ kind: "suspicion", text: "the reeve knows more than he says" }]);
    assert.deepEqual(t.table.drainInbox("torva"), []);
    assert.deepEqual(t.table.drainDmInbox(), []);
    const noteLine = t.table.transcript.records.find((r) => r.kind === "note")!;
    assert.equal(noteLine.channel, "notes:maren");
  } finally {
    t.close();
  }
});

test("the DM names subjects that are in the scene; others are refused before the engine", async () => {
  const t = await testTable({ seed: 27 });
  try {
    const dm = new DmTools(t.table);
    await dm.loadScene("m5_s3_yard");
    const outcome = await dm.requestCheck("reeve", { kind: "ladder", ability: "wisdom", skill: "insight", dc: 10 });
    assert.equal(outcome.ok, false);
    assert.match(outcome.text, /reeve is not in the scene/);
    assert.equal(t.requests().filter((r) => r.cmd === "request_check").length, 0);
    const check = await dm.requestCheck("maren", { kind: "ladder", ability: "wisdom", skill: "insight", dc: 10 });
    assert.equal(check.ok, true, check.text);
    assert.match(check.text, /^\[r\d+\] (success|failure)/);
  } finally {
    t.close();
  }
});
