// Who a DM line names (allies-in-fights design §6.1 rule N4, API-58): a listed form as a whole
// word, sent to the engine as a `mention`, which places the caravan's owner in the scene.
import assert from "node:assert/strict";
import { test } from "node:test";
import { namedIn } from "../src/table/mentions.ts";
import { testTable } from "./helpers.ts";

const ROSTER = [
  { id: "innkeeper_wren", names: ["Wren", "Рен"] },
  { id: "old_tobin", names: ["Tobin", "Тобин", "Тобина", "Тобину"] },
];

test("a DM line names a roster person by any listed form, as a whole word in its own case", () => {
  assert.deepEqual(namedIn("Рен ставит кружку перед Тобину.", ROSTER), ["innkeeper_wren", "old_tobin"]);
  assert.deepEqual(namedIn("Tobin, old and slow, nods.", ROSTER), ["old_tobin"]);
  // Inside a longer word, in another case, or a form the roster doesn't list: nobody.
  assert.deepEqual(namedIn("Тобинка и wren-птица, Тобином звали пса.", ROSTER), []);
  assert.deepEqual(namedIn("No names here.", []), []);
});

test("a said line that names the caravan's owner places him in the scene", async () => {
  const t = await testTable({ seed: 1, human: "bren", players: ["maren"] });
  try {
    const ok = (r: { ok: boolean }) => assert.ok(r.ok, JSON.stringify(r));
    ok(await t.engine.request("dm", { cmd: "load_scene", scene_id: "vale_town" }));
    ok(await t.engine.request("dm", { cmd: "start_campaign", party: ["bren", "maren"] }));
    t.table.roster = ROSTER;
    const handles = async () => {
      const r = await t.engine.request("dm", { cmd: "get_state" });
      assert.ok(r.result?.cmd === "get_state" && r.result.state.view === "dm");
      return r.result.state.creatures.map((c) => c.handle);
    };
    assert.ok(!(await handles()).includes("old_tobin"));
    ok(await t.table.narrate("Тобин слезает с козел и машет вам рукой."));
    assert.ok((await handles()).includes("old_tobin"));
  } finally {
    t.close();
  }
});
