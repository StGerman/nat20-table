// The DM agent on the Agent SDK (M6 step 10, TASKS.md AGT-4, AGT-6, AGT-20, AGT-21), checked
// without a model (spec §8): a stand-in session calls the DM's tools the way a model would, against
// a real seeded engine on The Silent Mill and the real loop. Needs `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CRAFT_PLUGIN, craftSkills, DM_SETTLE_ON, DM_LONG_WAKE_TIMEOUT_MS, DM_TURN_TIMEOUT_MS, dmPrompt, FIRESIDE_LINE, ModelDm, type CraftMode } from "../src/agents/dm.ts";
import { ModelPlayer } from "../src/agents/player.ts";
import { sessionOptions } from "../src/agents/sdk-session.ts";
import { REPO } from "../src/engine.ts";
import { TurnTimeout } from "../src/errors.ts";
import { readPack } from "../src/pack/read.ts";
import { guards, castParty, startAt } from "../src/play/run.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedSeat } from "../src/table/scripted.ts";
import { DmTools } from "../src/table/tools.ts";
import type { DmWake, PlayerWake } from "../src/table/types.ts";
import { testTable } from "./helpers.ts";
import { StandIn, type Script } from "./stand-in.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");
const PACK = readPack(MILL);
const CAST = castParty(MILL);
const PARTY = { ...CAST, human: CAST.human! };
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
  "offer_surrender",
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
  // The English run called Torva "he" throughout (M7 design §3.4).
  assert.match(dm.systemPrompt, /Pronouns: torva she\/her, maren she\/her, ilsa she\/her; keep to them in every language\./);
  // A live exit run (2026-10-27): the DM narrated Bren walking up to a goblin the engine still
  // had 24 ft away (TASKS.md AGT-9).
  assert.match(dm.systemPrompt, /Never narrate a character walking up to someone or somewhere unless move put them there\./);
  // Run full-2026-10-30T17-35-35-676Z (n80-1): a goblin boss hit by Sacred Flame "backs away behind
  // the millstone", and the engine never moved him (TASKS.md AGT-53).
  assert.match(dm.systemPrompt, /No creature backs away, flees, ducks behind something or closes in unless the engine shows it moving: a hit alone moves nobody\./);
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

test("a Fireside run adds one ask to the adventure part; a Plain run's prompt is byte for byte as before (AGT-102)", () => {
  const plain = dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt", "ru");
  assert.equal(dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt", "ru", "plain"), plain);
  assert.ok(!plain.includes(FIRESIDE_LINE));
  assert.ok(plain.includes(`## The adventure (only you see it)\n\n${PACK.text}`));
  const fireside = dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt", "ru", "fireside");
  assert.equal(fireside, plain.replace("## The adventure (only you see it)\n\n", `## The adventure (only you see it)\n\n${FIRESIDE_LINE}\n\n`));
  // The skills mode carries the same ask: the voice skill reads it from the adventure's instructions.
  assert.ok(dmPrompt(PACK, PARTY.human, PARTY.ai, "skills", "en", "fireside").includes(FIRESIDE_LINE));
  // The run command passes the flag through to the DM's prompt.
  const cli = path.join(REPO, "game/src/play/scene.ts");
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "--dry-run", "--voice", "fireside"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.ok(run.stdout.includes(FIRESIDE_LINE));
  const unknown = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "--dry-run", "--voice", "loud"], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--voice is one of plain, fireside/);
});

test("in skills mode the craft guidance is the plugin's skills, named in the prompt, not pasted into it", async () => {
  const { dm, sessions } = standInDm(async () => "", "skills");
  const skills = craftSkills();
  assert.deepEqual(skills.map((s) => s.name), ["checks", "narration", "pacing", "social-scenes", "voice"]);
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

test("remember still keeps a fact after a settling tool ended the DM's turn; other tools don't act (run 2026-11-13)", async () => {
  const { dm, sessions } = standInDm(async () => "");
  const t = await testTable({ seed: 1, pack: MILL });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "s1_village_green" }));
    await dm.wake("narrate", "Narrate these events.", new DmTools(t.table));
    sessions[0]!.settling = true;
    assert.deepEqual(await sessions[0]!.call("remember", { fact: "The scribe is called Pickler." }), { text: "remembered", isError: false });
    assert.deepEqual(dm.memory, ["The scribe is called Pickler."]);
    assert.equal((await sessions[0]!.call("narrate", { text: "Too late." })).isError, true);
    // A wake that timed out keeps no tools: its late memory goes nowhere.
    const timedOut = standInDm(async () => {
      throw new TurnTimeout("dm: turn timed out");
    });
    await assert.rejects(timedOut.dm.wake("narrate", "Narrate these events.", new DmTools(t.table)));
    assert.equal((await timedOut.sessions[0]!.call("remember", { fact: "Stale." })).isError, true);
    assert.deepEqual(timedOut.dm.memory, []);
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
      assert.match(refused.text, /^Refused, nobody heard it: it gives a number for a game statistic \(AC, fifteen\): the table never hears those\. Rewrite it\.$/);
      assert.deepEqual(await call("remember", { fact: `The miller's old dog answers to ${SENTINEL}.` }), { text: "remembered", isError: false });
      const numbered = await call("remember", { fact: "goblin_1 has 7 hit points left." });
      assert.equal(numbered.isError, true);
      assert.match(numbered.text, /^Not remembered: it gives a number for a game statistic \(hit points, 7\): the table never hears those\. Memory holds fiction only\.$/);
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
    (handle) => new ModelPlayer({ handle, card: PARTY.cards.get(handle)!, characterClass: PARTY.classes.get(handle)!, choice: { model: "claude-sonnet-5-5", effort: "low" }, open: (c) => new StandIn(c, fight) }),
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
      ["--experimental-strip-types", "--no-warnings", cli, "--dm", "scripted", "--players", "scripted", "--seed", "23", "--no-audit", "--no-upload", "--out", out],
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

test("--seat ai plays the scene with every character an AI player and records no human seat (AGT-40)", () => {
  const out = mkdtempSync(path.join(tmpdir(), "scene-"));
  try {
    const cli = path.join(REPO, "game/src/play/scene.ts");
    const run = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", cli, "--seat", "ai", "--dm", "scripted", "--players", "scripted", "--seed", "5", "--no-audit", "--no-upload", "--out", out],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const [folder] = readdirSync(out);
    const record = JSON.parse(readFileSync(path.join(out, folder, "run.json"), "utf8")) as { seats: { human: string | null; ai: string[] } };
    assert.deepEqual(record.seats, { human: null, ai: ["bren", "torva", "maren", "ilsa"] });
    const report = readFileSync(path.join(out, folder, "report.md"), "utf8");
    assert.match(report, /- AI players: bren, torva, maren, ilsa, scripted; no human at the table\n/);
    // The ts job has no Rust toolchain, so the audit stays off here (as in the other CLI tests); the
    // no-human leak scan is game_fixtures.rs on m7_adventure_ai, which CI runs in rust-test.
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("a campaign refuses scripted players, who would never move the caravan (AGT-80)", () => {
  const cli = path.join(REPO, "game/src/play/full.ts");
  const pack = path.join(REPO, "scenarios/fair_in_wend");
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", cli, "--pack", pack, "--seat", "ai", "--dm", "scripted", "--players", "scripted", "--seed", "5", "--no-audit", "--no-upload"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 2, run.stderr || run.stdout);
  assert.match(run.stderr, /scripted players never move the caravan/);
});

test("the exit run's scene list plays Scene 1, passes over Scene 2 and plays Scene 3", () => {
  const out = mkdtempSync(path.join(tmpdir(), "scene-"));
  try {
    const cli = path.join(REPO, "game/src/play/scene.ts");
    const scenes = ["--scenes", "s1_village_green,s3_mill_yard"];
    const run = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", cli, ...scenes, "--dm", "scripted", "--players", "scripted", "--seed", "5", "--no-audit", "--no-upload", "--out", out],
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

test("with no human at the table, the DM's prompt and tools leave the human out (AGT-40)", () => {
  const all = castParty(MILL, "none");
  const dm = new ModelDm({ pack: PACK, players: all.ai, choice: CHOICE });
  assert.match(dm.systemPrompt, /AI players play every character: bren, torva, maren, ilsa\. No human sits at this table\./);
  assert.doesNotMatch(dm.systemPrompt, /ask_human|offer_surrender|the human playing|A human plays/);
  assert.doesNotMatch(dm.systemPrompt, /undefined/);
  assert.match(dm.systemPrompt, /- Surrender: while get_state shows a surrender is available, you decide/);
  assert.match(dm.systemPrompt, /call load_scene with the next scene's id and the party \(bren, torva, maren, ilsa\)/);
  const names = dm.seatTools.map((t) => t.name);
  for (const gone of ["offer_surrender", "legal_actions", "submit", "end_turn", "ask_human"]) assert.ok(!names.includes(gone), `no ${gone}`);
  assert.deepEqual(names, DM_TOOLS.filter((t) => !["offer_surrender", "legal_actions", "submit", "end_turn", "ask_human"].includes(t)));
  for (const tool of dm.seatTools) assert.doesNotMatch(tool.description, /undefined|human/, `${tool.name}'s description`);
  // The human's table is unchanged.
  assert.equal(dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt"), new ModelDm({ pack: PACK, human: PARTY.human, players: PARTY.ai, choice: CHOICE }).systemPrompt);
  assert.doesNotMatch(dmPrompt(PACK, undefined, all.ai, "prompt", "ru"), /questions to the human|The human may write/);
});

test("the DM's scene openings, table turns and summaries get the long limit; --dm-timeout-ms sets every wake's", () => {
  const config = new ModelDm({ pack: PACK, human: PARTY.human, players: PARTY.ai, choice: CHOICE }).sessionConfig();
  assert.equal(config.turnTimeoutMs, DM_TURN_TIMEOUT_MS);
  // A player's words on a card get their own 30 s (AGT-99): a refused own move and its retry rewrite the narration.
  assert.deepEqual(config.turnTimeoutsMs, { scene_open: DM_LONG_WAKE_TIMEOUT_MS, table_turn: DM_LONG_WAKE_TIMEOUT_MS, summary: DM_LONG_WAKE_TIMEOUT_MS, suggest: DM_LONG_WAKE_TIMEOUT_MS, card_words: 30_000 });
  const flat = new ModelDm({ pack: PACK, human: PARTY.human, players: PARTY.ai, choice: CHOICE, turnTimeoutMs: 20_000 }).sessionConfig();
  assert.equal(flat.turnTimeoutMs, 20_000);
  assert.equal(flat.turnTimeoutsMs, undefined);
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

test("a refused narration takes its preview off the seat at once, not at the wake's end (M10 S4)", async () => {
  const shown: Array<string | undefined> = [];
  const seen: Array<string | undefined> = [];
  const dm = new ModelDm({
    pack: PACK,
    human: PARTY.human,
    players: PARTY.ai,
    choice: CHOICE,
    preview: (text) => shown.push(text),
    open: (config) =>
      new StandIn<DmWake>(config, async (_wake, call) => {
        config.onPartial!("narrate", '{"to":"table","text":"The goblins look tough. AC');
        const refused = await call("narrate", { to: "table", text: "The goblins look tough, AC fifteen or so." });
        assert.equal(refused.isError, true, refused.text);
        seen.push(shown.at(-1));
        return "";
      }),
  });
  const t = await testTable({ seed: 1, pack: MILL, guards: (engine) => guards(MILL, engine) });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "s1_village_green" }));
    await dm.wake("narrate", "Narrate these events.", new DmTools(t.table));
    assert.deepEqual(seen, [undefined], "cleared while the wake still ran");
    assert.deepEqual(shown, ["The goblins look tough.", undefined]);
  } finally {
    t.close();
  }
});

test("a pack with a creature list gives the DM place_creature and start_fight, and names the list (AGT-24)", () => {
  const pack = { ...PACK, adventure: { ...PACK.adventure, stat_blocks: [{ id: "road_wolf", monster: "wolf", side: "hostile" as const, name: "Grey wolf" }] } };
  const dm = new ModelDm({ pack, human: PARTY.human, players: PARTY.ai, choice: CHOICE });
  const names = dm.seatTools.map((t) => t.name);
  assert.deepEqual(names, [...DM_TOOLS.slice(0, DM_TOOLS.indexOf("spawn") + 1), "place_creature", "start_fight", ...DM_TOOLS.slice(DM_TOOLS.indexOf("spawn") + 1)]);
  assert.doesNotMatch(dm.systemPrompt, /- Coin and items:/, "format 1 has no goods tools");
  assert.match(dm.systemPrompt, /place_creature from this list, never another: road_wolf \(Grey wolf\)/);
  assert.doesNotMatch(dm.systemPrompt, /there is no fight with anyone the scene doesn't hold/);
  // The Silent Mill lists none, so its DM keeps the old rule and tools.
  assert.match(new ModelDm({ pack: PACK, human: PARTY.human, players: PARTY.ai, choice: CHOICE }).systemPrompt, /there is no fight with anyone the scene doesn't hold/);
});

test("a format 2 pack gives the DM give, steal and loot, and the rule that an unseen theft is the thief's alone (ITM-6)", async () => {
  const pack = { ...PACK, adventure: { ...PACK.adventure, format_version: 2 } };
  const dm = new ModelDm({ pack, human: PARTY.human, players: PARTY.ai, choice: CHOICE });
  const names = dm.seatTools.map((t) => t.name);
  for (const tool of ["give", "steal", "loot"]) assert.ok(names.includes(tool), tool);
  assert.ok(!names.includes("place_creature"), "no creature list, no place_creature");
  assert.match(dm.systemPrompt, /A theft that goes unseen you tell to the thief alone/);
  assert.ok(!new ModelDm({ pack: PACK, human: PARTY.human, players: PARTY.ai, choice: CHOICE }).seatTools.some((t) => t.name === "steal"), "The Silent Mill has none");
});

test("on the road the DM has no load_scene or end_adventure, and the scenes rule says the journey loads them (AGT-80, AGT-81)", () => {
  const wend = readPack(path.join(REPO, "scenarios/fair_in_wend"));
  const dm = new ModelDm({ pack: wend, human: "bren", players: ["torva", "maren", "ilsa"], choice: CHOICE, livingWorld: true });
  const names = dm.seatTools.map((t) => t.name);
  assert.ok(!names.includes("load_scene") && !names.includes("end_adventure"), names.join(", "));
  assert.ok(names.includes("start_fight") || names.includes("place_creature"), "the road's fights stay");
  assert.match(dm.systemPrompt, /- Scenes: the journey loads them\./);
  assert.doesNotMatch(dm.systemPrompt, /lists the scenes in order with their exits/);
  // The craft notes are shared with packs played in order: the road's own rule overrides them.
  assert.match(dm.systemPrompt, /read the road instead: the journey moves the party on/);
  // A pack played in order keeps both.
  const mill = new ModelDm({ pack: PACK, human: PARTY.human, players: PARTY.ai, choice: CHOICE }).seatTools.map((t) => t.name);
  assert.ok(mill.includes("load_scene") && mill.includes("end_adventure"));
  // Time in a place (API-50, decision 0060 F2): the road's DM lets it pass, a pack played in order has no clock.
  assert.ok(names.includes("pass_time"), names.join(", "));
  assert.match(dm.systemPrompt, /- Time in a place: .*call pass_time once for it/);
  assert.ok(!mill.includes("pass_time"));
  // The DM's pick (AGT-88): the road's DM picks among offered cards by the rule; a pack played in order has no deck.
  assert.ok(names.includes("pick_card"), names.join(", "));
  assert.match(dm.systemPrompt, /- "Pick a road card": .*continues what the party did.*clearest problem.*can come to a fight\. Never pick a card to spare the party a fight\. Say why in one line, then narrate the card.s opening: narrate before the pick is refused\./);
  assert.match(dm.systemPrompt, /- "A road card is on the table": a card came with no pick\. Open it in two to four sentences/);
  assert.match(dm.systemPrompt, /before you narrate; narrate last\./);
  assert.ok(!mill.includes("pick_card"));
  // Own move (AGT-99): the road's DM answers a player's words on a card with own_move_or_answer, by the rule.
  assert.ok(names.includes("own_move_or_answer") && !mill.includes("own_move_or_answer"));
  assert.match(dm.systemPrompt, /- "A player's words on the road card": .*If no two choices fit, give only the narration.*A failure never brings a choice that breaks a custom, or a deliberate act the words did not ask for; a success brings a fight only when the words asked for one/);
  // Scouting at the table (AGT-90): the DM opens a scouted card on what the scout saw.
  assert.match(dm.systemPrompt, /- The scout: .*If they saw it, open the card on what the scout saw/);
  // Story-space (AGT-89, design decision 9): five rules on the road, the human's character named in the second.
  const space = dm.systemPrompt.slice(dm.systemPrompt.indexOf("## Story-space"));
  assert.equal(space.split("\n").filter((l) => l.startsWith("- ")).length, 5, space);
  assert.match(space, /- Open every scene on its problem/);
  assert.match(space, /- Put bren in that problem/);
  assert.match(space, /co-writers: .*never decide for them/);
  assert.match(space, /- Tie every consequence to a deed or a roll/);
  assert.match(space, /- No "pleasant nothing"/);
  const noHuman = new ModelDm({ pack: wend, players: ["bren", "torva", "maren", "ilsa"], choice: CHOICE, livingWorld: true }).systemPrompt;
  assert.match(noHuman, /- Put one of the party in that problem/);
  assert.doesNotMatch(noHuman, /undefined/);
  assert.doesNotMatch(new ModelDm({ pack: PACK, human: PARTY.human, players: PARTY.ai, choice: CHOICE }).systemPrompt, /## Story-space/, "The Silent Mill keeps its prompt");
});

test("the DM speaks to the human's character as you and names everyone else; a table with no human has no such rule", () => {
  // Stas's Wend run (2026-11-05): 30 of 51 narrations spoke of the human's character in the third person.
  const prompt = dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt", "ru");
  assert.match(prompt, new RegExp(`narration speaks to ${PARTY.human} as "you" \\(second person singular\\), and of everyone else by name`));
  assert.match(prompt, /Speak to the human's character with «ты», never «вы»/);
  assert.doesNotMatch(dmPrompt(PACK, PARTY.human, PARTY.ai, "prompt"), /«ты»/, "the English prompt stays English");
  assert.match(prompt, /Narration to one AI player's handle alone speaks to that character as "you"/);
  assert.doesNotMatch(dmPrompt(PACK, undefined, [PARTY.human!, ...PARTY.ai], "prompt"), /second person singular/);
});

test("the wakes that narrate last end on their narration, never on the cap (AGT-97)", () => {
  for (const wake of ["narrate", "combat_over", "road", "pick", "card"] as const) assert.deepEqual(DM_SETTLE_ON[wake], ["narrate"], wake);
  // These may still act after a narration (a move after the attack it narrated): they run to their end.
  for (const wake of ["map_combat", "surrender_words"] as const) assert.equal(DM_SETTLE_ON[wake], undefined, wake);
  assert.deepEqual(DM_SETTLE_ON.card_words, ["own_move_or_answer"]);
  // The long wakes keep calling tools after they narrate: they run to their own cap.
  for (const wake of ["scene_open", "table_turn", "summary", "suggest"] as const) assert.equal(DM_SETTLE_ON[wake], undefined, wake);
});
