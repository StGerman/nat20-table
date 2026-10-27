// The DM agent on the Agent SDK (M6 step 10, TASKS.md AGT-4, AGT-6, AGT-20, AGT-21), checked
// without a model (spec §8): a stand-in session calls the DM's tools the way a model would, against
// a real seeded engine on The Silent Mill and the real loop. Needs `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CRAFT_PLUGIN, craftSkills, dmPrompt, ModelDm, type CraftMode } from "../src/agents/dm.ts";
import { ModelPlayer } from "../src/agents/player.ts";
import { sessionOptions } from "../src/agents/sdk-session.ts";
import { REPO } from "../src/engine.ts";
import { TurnTimeout } from "../src/errors.ts";
import { readPack } from "../src/pack/read.ts";
import { guards, packParty, startAt } from "../src/play/run.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedSeat } from "../src/table/scripted.ts";
import { DmTools } from "../src/table/tools.ts";
import type { DmWake, PlayerWake } from "../src/table/types.ts";
import { testTable } from "./helpers.ts";
import { StandIn, type Script } from "./stand-in.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");
const PACK = readPack(MILL);
const PARTY = packParty(MILL);
const CHOICE = { model: "claude-opus-5-5", effort: "low" } as const;

/** A model DM whose sessions are stand-ins playing `script`; `sessions` lists them as they open. */
function standInDm(script: Script<DmWake>, craft?: CraftMode): { dm: ModelDm; sessions: StandIn<DmWake>[] } {
  const sessions: StandIn<DmWake>[] = [];
  const dm = new ModelDm({
    pack: PACK,
    human: PARTY.human,
    players: PARTY.ai,
    choice: CHOICE,
    craft,
    open: (config) => {
      const session = new StandIn<DmWake>(config, script);
      sessions.push(session);
      return session;
    },
  });
  return { dm, sessions };
}

function inputs(runDir: string): Array<{ seat: string; text: string }> {
  return readFileSync(path.join(runDir, "inputs.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

const DM_TOOLS = [
  "get_state",
  "get_sheet",
  "load_scene",
  "start_combat",
  "end_combat",
  "spawn",
  "request_check",
  "help",
  "short_rest",
  "move",
  "legal_actions",
  "submit",
  "end_turn",
  "grant_action",
  "narrate",
  "ask_human",
  "remember",
  "end_adventure",
];

test("the DM's prompt holds the rules, the craft guidance and the whole pack; its tools take no viewer", () => {
  const { dm } = standInDm(async () => "");
  assert.ok(dm.systemPrompt.includes(PACK.text), "the whole pack is in the prompt");
  assert.match(dm.systemPrompt, /^You are the Dungeon Master of "The Silent Mill"/);
  assert.match(dm.systemPrompt, /A human plays bren; AI players play torva, maren, ilsa\./);
  // A live exit run (2026-10-27): the DM narrated Bren walking up to a goblin the engine still
  // had 24 ft away (TASKS.md AGT-9).
  assert.match(dm.systemPrompt, /Never narrate a character walking up to someone or somewhere unless move put them there\./);
  assert.match(dm.systemPrompt, /in a fight only bren moves, on bren's turn/);
  for (const skill of craftSkills()) assert.ok(dm.systemPrompt.includes(skill.body), `the ${skill.name} craft text is in the prompt`);
  const options = sessionOptions({ agent: "dm", choice: CHOICE, systemPrompt: dm.systemPrompt, tools: dm.seatTools }, "/empty");
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.settingSources, []);
  assert.deepEqual(options.skills, []);
  assert.deepEqual(options.allowedTools, DM_TOOLS.map((t) => `mcp__table__${t}`));
  for (const tool of dm.seatTools) {
    for (const field of ["viewer", "prompt_id", "hp", "result", "outcome"]) assert.ok(!(field in tool.inputSchema), `${tool.name} takes ${field}`);
  }
});

test("in skills mode the craft guidance is the plugin's skills, named in the prompt, not pasted into it", async () => {
  const { dm, sessions } = standInDm(async () => "", "skills");
  const skills = craftSkills();
  assert.deepEqual(skills.map((s) => s.name), ["checks", "narration", "pacing", "social-scenes"]);
  for (const skill of skills) {
    assert.ok(!dm.systemPrompt.includes(skill.body), `the ${skill.name} text is not pasted`);
    assert.ok(dm.systemPrompt.includes(`nat20-dm-craft:${skill.name} (${skill.description})`));
  }
  const t = await testTable({ seed: 1, pack: MILL });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "s1_village_green" }));
    await dm.wake("narrate", "Narrate these events.", new DmTools(t.table));
    const config = sessions[0].config;
    assert.deepEqual(config.plugins, [CRAFT_PLUGIN]);
    assert.deepEqual(config.skills, skills.map((s) => `nat20-dm-craft:${s.name}`));
    const options = sessionOptions(config, "/empty");
    assert.deepEqual(options.tools, ["Skill"]);
    assert.deepEqual(options.plugins, [{ type: "local", path: CRAFT_PLUGIN, skipMcpDiscovery: true }]);
  } finally {
    t.close();
  }
});

test("the DM runs the yard through its tools; its memory and a refused narration reach no player", async () => {
  // A word no pack file, card or engine line holds: if it reaches a player, memory leaked.
  const SENTINEL = "Quillonmarsh";
  const opened: string[] = [];
  const { dm, sessions } = standInDm(async (wake, call, message) => {
    if (wake === "scene_open") {
      opened.push(message);
      const refused = await call("narrate", { text: "The goblins look tough, AC fifteen or so." });
      assert.equal(refused.isError, true);
      assert.match(refused.text, /^Refused, nobody heard it: it holds a number \(fifteen\)\. Rewrite it\.$/);
      assert.deepEqual(await call("remember", { fact: `The miller's old dog answers to ${SENTINEL}.` }), { text: "remembered", isError: false });
      const numbered = await call("remember", { fact: "goblin_1 has 7 hit points left." });
      assert.equal(numbered.isError, true);
      assert.match(numbered.text, /^Not remembered: it holds a number \(7\)\. Memory holds fiction only\.$/);
      await call("narrate", { text: "Goblins crouch behind the woodpile, and wolves pace by the kennel." });
      const started = await call("start_combat", { encounter_id: "yard_fight" });
      assert.equal(started.isError, false, started.text);
    }
    if (wake === "narrate") await call("narrate", { text: "Steel rings across the yard." });
    if (wake === "combat_over") await call("end_adventure", { text: "The yard falls quiet." });
    return "";
  });
  const fight: Script<PlayerWake> = async (wake, call) => {
    if (wake === "reaction") await call("react", { choice: null });
    if (wake === "combat_turn") await call("end_turn");
    return "";
  };
  const players = PARTY.ai.map(
    (handle) => new ModelPlayer({ handle, card: PARTY.cards.get(handle)!, choice: { model: "claude-sonnet-5-5", effort: "low" }, open: (c) => new StandIn(c, fight) }),
  );
  const t = await testTable({ seed: 23, pack: MILL, seat: new ScriptedSeat(PARTY.human, [], ScriptedSeat.fight), guards: (engine) => guards(MILL, engine) });
  try {
    const carried = await startAt(t.engine, MILL, "s3_mill_yard", [PARTY.human, ...PARTY.ai]);
    const report = await new TableLoop({ table: t.table, dm, players, maxSteps: 2000 }).run("s3_mill_yard", carried);
    assert.equal(report.ended, "the adventure is over");
    assert.equal(sessions.length, 1, "one session for the scene");
    assert.equal(sessions[0].closed, true, "the loop closes it at the end");
    assert.match(opened[0], /^The scene now:\n/);
    assert.match(opened[0], /Scene s3_mill_yard is loaded\. Open it for the table/);
    assert.deepEqual(dm.memory, [`The miller's old dog answers to ${SENTINEL}.`]);

    const records = t.table.transcript.records;
    assert.ok(records.some((r) => r.channel === "memory:dm" && r.kind === "memory" && r.text.includes(SENTINEL)));
    assert.ok(records.filter((r) => r.text.includes(SENTINEL)).every((r) => r.channel === "memory:dm"), "the sentinel is only in DM memory");
    const narrated = records.filter((r) => r.speaker === "dm" && r.kind === "narration").map((r) => r.text);
    assert.deepEqual(narrated.slice(0, 2), ["Goblins crouch behind the woodpile, and wolves pace by the kennel.", "Steel rings across the yard."]);
    assert.equal(narrated.at(-1), "The yard falls quiet.");
    assert.ok(narrated.every((text) => !/fifteen/i.test(text)), "the refused narration reached nobody");
    // AGT-21: no player agent's input, nor the human's, ever held the sentinel.
    const given = inputs(t.runDir);
    assert.ok(given.some((r) => r.seat === "maren"), "the players' inputs were recorded");
    assert.deepEqual(given.filter((r) => r.text.includes(SENTINEL)), []);
    assert.deepEqual(given.filter((r) => /fifteen/i.test(r.text)), []);
    // Every command the DM caused went to the engine as the DM.
    const requests = t.requests();
    assert.ok(requests.some((r) => r.cmd === "start_combat" && r.viewer === "dm"));
    // Outside its wake, a tool does nothing.
    assert.deepEqual(await sessions[0].call("narrate", { text: "Still here." }), { text: "not now: nothing is waiting on you", isError: true });
  } finally {
    t.close();
  }
});

test("a new scene starts a new DM session from the scene's state, the summaries and its memory", async () => {
  let opening = true;
  const { dm, sessions } = standInDm(async (wake, call) => {
    if (wake === "summary") return "The party met the reeve, who hid something about the mill.";
    if (opening) await call("remember", { fact: "The reeve's daughter is called Wren." });
    return "";
  });
  const t = await testTable({ seed: 1, pack: MILL });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "s1_village_green" }));
    const tools = new DmTools(t.table);
    await dm.wake("scene_open", "Scene s1_village_green is loaded.", tools);
    const summary = await dm.wake("summary", "The scene is over.", tools);
    assert.equal(summary, "The party met the reeve, who hid something about the mill.");
    await dm.newScene(summary as string);
    assert.equal(sessions[0].closed, true);
    opening = false;
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "s2_mill_road", party: [PARTY.human, ...PARTY.ai] }));
    await dm.wake("scene_open", "Scene s2_mill_road is loaded.", tools);
    assert.equal(sessions.length, 2);
    const seed = sessions[1].turns[0].message;
    assert.match(seed, /^The scene now:\n/);
    assert.match(seed, /s2_mill_road/);
    assert.match(seed, /The story so far, as you summed it up:\n- The party met the reeve, who hid something about the mill\./);
    assert.match(seed, /What you established in fiction \(your memory\):\n- The reeve's daughter is called Wren\.\n\nScene s2_mill_road is loaded\.$/);
  } finally {
    t.close();
  }
});

test("after a DM timeout the session goes on; after any other failure the next wake starts a fresh one", async () => {
  let fail: Error | undefined;
  const { dm, sessions } = standInDm(async () => {
    if (fail) throw fail;
    return "";
  });
  const t = await testTable({ seed: 1, pack: MILL });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "s1_village_green" }));
    const tools = new DmTools(t.table);
    fail = new TurnTimeout("dm: turn timed out");
    await assert.rejects(dm.wake("narrate", "Narrate.", tools), TurnTimeout);
    fail = undefined;
    await dm.wake("narrate", "Narrate.", tools);
    assert.equal(sessions.length, 1, "the session survives a timeout");
    fail = new Error("dm: the agent session ended");
    await assert.rejects(dm.wake("narrate", "Narrate.", tools), /session ended/);
    assert.equal(sessions[0].closed, true);
    fail = undefined;
    await dm.wake("narrate", "Narrate.", tools);
    assert.equal(sessions.length, 2);
    assert.match(sessions[1].turns[0].message, /^The scene now:\n/);
  } finally {
    t.close();
  }
});

test("the scene run command plays Scene 3 with a scripted DM and players, and writes its run folder", () => {
  const out = mkdtempSync(path.join(tmpdir(), "scene-"));
  try {
    const cli = path.join(REPO, "game/src/play/scene.ts");
    const run = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", cli, "--dm", "scripted", "--players", "scripted", "--seed", "23", "--no-audit", "--out", out],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const [folder] = readdirSync(out);
    assert.match(folder, /^scene-/);
    for (const file of ["transcript.jsonl", "session-log.jsonl", "engine-log.jsonl", "inputs.jsonl", "usage.jsonl", "report.md"]) {
      assert.ok(existsSync(path.join(out, folder, file)), `${file} is written`);
    }
    const report = readFileSync(path.join(out, folder, "report.md"), "utf8");
    assert.match(report, /- Scenes: s3_mill_yard of The Silent Mill/);
    assert.match(report, /- Played: s3_mill_yard\n/);
    assert.match(report, /- Ended: the adventure is over/);
    assert.match(report, /Narration:\n> Foes wait ahead\./);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("the exit run's scene list plays Scene 1, passes over Scene 2 and plays Scene 3", () => {
  const out = mkdtempSync(path.join(tmpdir(), "scene-"));
  try {
    const cli = path.join(REPO, "game/src/play/scene.ts");
    const scenes = ["--scenes", "s1_village_green,s3_mill_yard"];
    const run = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", cli, ...scenes, "--dm", "scripted", "--players", "scripted", "--seed", "5", "--no-audit", "--out", out],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const [folder] = readdirSync(out);
    const report = readFileSync(path.join(out, folder, "report.md"), "utf8");
    assert.match(report, /- Played: s1_village_green, s3_mill_yard; passed over: s2_mill_road\n/);
    assert.match(report, /- Ended: the adventure is over/);
    assert.match(report, /- Fights: Combat is over\./);
    assert.match(run.stdout, new RegExp(`zip -qr ${folder}\\.zip ${folder}\\)`));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("with --lang ru the DM writes what the table hears in Russian; an English run's prompt has no language section", () => {
  const english = dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt");
  const russian = dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt", "ru");
  assert.doesNotMatch(english, /## Language/);
  assert.match(russian, /## Language\n\nWrite everything the table hears in Russian/);
  assert.match(russian, /Tool inputs stay exactly as the tools take them/);
  // Only the section is added: the rest of the prompt, and so its cache, is the same text.
  assert.equal(russian.replace(/## Language\n[\s\S]*?\n\n(?=## The adventure)/, ""), english);
  const cli = path.join(REPO, "game/src/play/scene.ts");
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "--dry-run", "--lang", "ru"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Write everything the table hears in Russian/);
  const unknown = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "--dry-run", "--lang", "de"], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--lang is one of en, ru/);
});

test("the scene run command's dry run prints the DM's session settings and prompt and starts nothing", () => {
  const cli = path.join(REPO, "game/src/play/scene.ts");
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "--dry-run", "--craft", "skills"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /"skills": \[\n\s+"nat20-dm-craft:checks"/);
  // The DM thinks at medium effort unless told otherwise (Stas, 2026-10-27); the players stay at low.
  assert.match(run.stdout, /"effort": "medium"/);
  assert.match(run.stdout, /You are the Dungeon Master of "The Silent Mill"/);
  assert.doesNotMatch(run.stdout, /ANTHROPIC_API_KEY=|sk-ant-/);
});
