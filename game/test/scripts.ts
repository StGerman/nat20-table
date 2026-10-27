// Scripted DMs for the game fixtures (M6 spec §8, §10): the DM side of a seeded run, from a fixed
// plan, through the same bound tools the DM agent gets.
import type { HitDiceSpend, State } from "@nat20-table/engine-client";
import { ScriptedDm, yardDm } from "../src/table/scripted.ts";
import type { DmTools } from "../src/table/tools.ts";

type Step = (tools: DmTools) => Promise<unknown>;

const walk = (anchor: string): Step => (tools) => tools.move("bren", { kind: "anchor", anchor });
const check = (check_id: string): Step => (tools) => tools.requestCheck("bren", { kind: "scenario", check_id });

async function dmState(tools: DmTools): Promise<Extract<State, { view: "dm" }>> {
  const outcome = await tools.getState();
  const state = (outcome.data as { state: State }).state;
  if (state.view !== "dm") throw new Error("the DM got a player view");
  return state;
}

/** The yard fight on its own; it lives in src because the step 9 run plays it too. */
export { yardDm };

/**
 * The Milestone 3 trail (crates/nat20-duel/src/trail.rs) as a DM would run it: each human action
 * moves the scene one step on; the yard fight ends in a surrender when the goblins offer one, the
 * prisoners are carried into the storeroom, and the cellar fight brings in the reserve in round 2
 * and ends by the scenario in round 4.
 */
export function trailDm(): ScriptedDm {
  const plans: Record<string, { steps: Step[]; next?: Step }> = {
    m3_s1_green: {
      steps: [walk("reeve_porch"), check("reeve_insight")],
      next: (tools) => tools.loadScene("m3_s2_road", ["bren"]),
    },
    m3_s2_road: {
      steps: [walk("snare_bend"), check("find_tracks"), walk("mill_gate"), check("spot_lookouts")],
      next: (tools) => tools.loadScene("m3_s3_yard", ["bren"]),
    },
    m3_s3_yard: { steps: [(tools) => tools.startCombat("yard_fight")] },
    m3_s4_prisoner: {
      steps: [
        (tools) => tools.askHuman("The goblin shakes. What do you ask it?"),
        check("interrogate"),
        (tools) => tools.shortRest(["bren"], [{ handle: "bren", count: 1 } satisfies HitDiceSpend]),
      ],
      next: (tools) => tools.loadScene("m3_s5_cellar", ["bren"]),
    },
    m3_s5_cellar: { steps: [(tools) => tools.startCombat("cellar_fight")] },
  };
  let scene = "";
  let step = 0;
  let reserve = false;
  return new ScriptedDm({
    scene_open: async (tools) => {
      scene = (await dmState(tools)).scene_id ?? "";
      step = 0;
      await tools.narrate("A new place opens before you.");
    },
    table_turn: async (tools) => {
      const plan = plans[scene];
      const next = plan?.steps[step++];
      if (next) {
        await next(tools);
        await tools.narrate("The world answers.");
      } else if (plan?.next) {
        await tools.narrate("You move on.");
        await plan.next(tools);
      }
    },
    narrate: async (tools) => {
      const state = await dmState(tools);
      if (scene === "m3_s3_yard" && state.encounters.some((e) => e.running && e.surrender_available)) {
        await tools.endCombat("surrender");
      } else if (scene === "m3_s5_cellar" && (state.round ?? 0) >= 4) {
        await tools.endCombat("scenario");
      } else if (scene === "m3_s5_cellar" && (state.round ?? 0) >= 2 && !reserve) {
        reserve = true;
        await tools.spawn("reserve");
      }
      await tools.narrate("Blades flash.");
    },
    combat_over: async (tools) => {
      const state = await dmState(tools);
      const bren = state.creatures.find((c) => c.handle === "bren");
      if (bren?.life_state !== "conscious") return void (await tools.endAdventure("Bren falls, and the trail ends here."));
      if (scene === "m3_s3_yard") {
        const prisoners = state.creatures.filter((c) => c.side === "neutral" && c.life_state === "conscious").map((c) => c.handle);
        await tools.narrate("The yard is yours.");
        await tools.loadScene("m3_s4_prisoner", ["bren", ...prisoners]);
      } else {
        await tools.endAdventure("The cellar falls silent. The mill is quiet again.");
      }
    },
  });
}
