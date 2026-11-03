// Level-up at the table (M9, AGT-80 step 3): out of a fight the human's options gain "Level up"
// when the sheet says it is due; each choice comes in plain lines with the recommended pick first,
// which Enter takes; an AI player that leaves a level-up open gets the recommended pick.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LevelUpChoice } from "@nat20-table/engine-client";
import { levelUpChoices } from "../src/table/choices.ts";
import { TableLoop } from "../src/table/loop.ts";
import { send } from "../src/table/tools.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat } from "../src/table/scripted.ts";
import type { HumanPrompt, PlayerIntent } from "../src/table/types.ts";
import { formatSheet } from "../src/view.ts";
import { testTable } from "./helpers.ts";

const CHOICE = {
  prompt_id: "l1",
  actor: "maren",
  level: 3,
  label: "Spell Selection",
  picks: 1,
  options: [
    { id: "aid", name: "Aid", summary: "More Hit Points for three friends." },
    { id: "hold_person", name: "Hold Person" },
  ],
  recommended: ["aid"],
} as LevelUpChoice;

test("a level-up choice for the human: the recommended pick first, then each option in plain words", () => {
  assert.deepEqual(levelUpChoices(CHOICE).map((c) => `${c.number}. ${c.label}`), [
    "1. Take the recommended: Aid",
    "2. Aid: More Hit Points for three friends.",
    "3. Hold Person",
  ]);
  assert.deepEqual(levelUpChoices({ ...CHOICE, picks: 2 }, ["aid"]).map((c) => c.about?.id), ["recommended", "hold_person"]);
});

/**
 * A human who lists the options once, levels up when offered, asks for `/options` at the first
 * level-up choice, takes each recommended pick with Enter, then quits.
 */
function leveller(): (prompt: HumanPrompt, seat: ScriptedSeat) => PlayerIntent {
  let listed = false;
  let leveled = false;
  let relisted = false;
  return (prompt, seat) => {
    if (prompt.kind === "level_up") {
      if (!relisted) {
        relisted = true;
        return { kind: "command", name: "options" };
      }
      leveled = true;
      return { kind: "option", number: 1 };
    }
    if (prompt.kind !== "explore") return ScriptedSeat.pass(prompt, seat);
    if (leveled) return { kind: "command", name: "quit" };
    if (!listed) {
      listed = true;
      return { kind: "command", name: "options" };
    }
    listed = false;
    const up = seat.choices.find((c) => c.act?.kind === "level_up");
    return up ? { kind: "option", number: up.number } : { kind: "text", text: "I wait." };
  };
}

test("the human levels up from the options after a fight, one plain choice at a time, and Enter takes the recommended; an AI player's open level-up gets the recommended", async () => {
  const seat = new ScriptedSeat("maren", [], leveller());
  const t = await testTable({ seed: 3, human: "maren", players: ["torva"], seat });
  try {
    const dm = new ScriptedDm({
      // The bosses flee at once: the party earns their XP (the level_up fixture's yard).
      scene_open: async (tools) => {
        await tools.startCombat("yard_rout");
        await tools.endCombat("fled");
        // Torva starts a level-up and leaves it open, as a failed wake would.
        assert.ok((await send(t.table, "torva", { cmd: "level_up", actor: "torva" }, () => "open")).ok);
      },
    });
    const report = await new TableLoop({ table: t.table, dm, players: [new ScriptedPlayer("torva")], maxSteps: 100 }).run("level_up_yard");
    assert.equal(report.ended, "the human quit");
    const asked = seat.shown.filter((e) => e.kind === "options" && e.title?.startsWith("Level 3: "));
    assert.ok(asked.length > 1, "a level-up choice was shown");
    // `/options` at a level-up choice shows that choice again, not the round's options.
    assert.equal(asked[1].kind === "options" && asked[1].title, asked[0].kind === "options" && asked[0].title);
    for (const e of asked) {
      assert.ok(e.kind === "options");
      assert.match(e.lines[0], /^1\. Take the recommended: /);
      assert.equal(e.preset, 1);
    }
    const fallback = t.table.transcript.records.find((r) => r.kind === "fallback" && r.speaker === "torva");
    assert.match(fallback?.text ?? "", /left a level-up choice open: the recommended pick/);
    const answers = t.requests().filter((r) => r.cmd === "answer_level_up" && r.viewer === "maren");
    assert.ok(answers.length > 0 && answers.every((r) => r.viewer === "maren" && Array.isArray(r.picks) && (r.picks as unknown[]).length === 0), "Enter takes the recommended: empty picks");
    const sheet = await t.engine.request("maren", { cmd: "get_sheet", actor: "maren" });
    assert.ok(sheet.result?.cmd === "get_sheet");
    assert.equal(sheet.result.sheet.level, 3);
    const torva = await t.engine.request("torva", { cmd: "get_sheet", actor: "torva" });
    assert.ok(torva.result?.cmd === "get_sheet");
    assert.equal(torva.result.sheet.level, 3);
    assert.match(formatSheet(sheet.result.sheet), /^Experience: \d+ XP/m);
  } finally {
    t.close();
  }
});
