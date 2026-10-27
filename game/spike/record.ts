// Records the engine state the Agent SDK spike (M6 step 1, AGT-17) plays against, so the spike
// itself needs no engine: Maren's first action prompt in the Milestone 5 yard fight, as Maren sees
// it, and the first round's events as the DM sees them. Run from the repo root after
// `cargo build -p nat20-api-server`: `npm run spike:record`. Writes game/spike/recorded.json.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EngineClient, type Response } from "@nat20-table/engine-client";

const here = path.dirname(fileURLToPath(import.meta.url));
const binary = process.env.NAT20_API_SERVER ?? path.resolve(here, "../../target/debug/nat20-api-server");
const SEED = 27; // the Milestone 5 exit fixture's seed (contract/fixtures/m5_fights.jsonl)
const PLAYER = "maren";

function ok(response: Response): Response {
  if (!response.ok) throw new Error(`engine refused: ${JSON.stringify(response.error)}`);
  return response;
}

const engine = await EngineClient.start(binary);
try {
  ok(await engine.request("dm", { cmd: "new_session", seed: SEED }));
  ok(await engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
  const started = ok(await engine.request("dm", { cmd: "start_combat", encounter_id: "yard_fight" }));
  const dmEvents = [...started.events];
  let awaiting = started.awaiting;
  // Party members other than Maren end their turns until the prompt is hers.
  for (let guard = 0; awaiting.kind === "action" && awaiting.actor !== PLAYER; guard++) {
    if (guard > 20) throw new Error("Maren never got a prompt");
    const ended = ok(await engine.request("dm", { cmd: "end_turn", actor: awaiting.actor, prompt_id: awaiting.prompt_id }));
    dmEvents.push(...ended.events);
    awaiting = ended.awaiting;
  }
  if (awaiting.kind !== "action") throw new Error(`unexpected prompt ${JSON.stringify(awaiting)}`);
  const state = ok(await engine.request(PLAYER, { cmd: "get_state" }));
  const sheet = ok(await engine.request(PLAYER, { cmd: "get_sheet", actor: PLAYER }));
  const options = ok(await engine.request(PLAYER, { cmd: "legal_actions", actor: PLAYER }));
  const since = ok(await engine.request(PLAYER, { cmd: "events", since: 0 }));
  const recorded = {
    _comment: "Recorded by game/spike/record.ts from m5_s3_yard, seed 27. Engine output only; regenerate rather than edit.",
    player: PLAYER,
    awaiting,
    player_state: state.result,
    player_sheet: sheet.result,
    player_options: options.result,
    player_events: since.result,
    dm_events: dmEvents,
  };
  writeFileSync(path.join(here, "recorded.json"), JSON.stringify(recorded, null, 2) + "\n");
  console.log(`recorded Maren's prompt ${awaiting.prompt_id} and ${dmEvents.length} DM events`);
} finally {
  engine.close();
}
