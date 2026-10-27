// The AI player on the Agent SDK (M6 step 9, TASKS.md AGT-5, AGT-6, AGT-21, CHR-5), checked without
// a model (spec §8): a stand-in session calls the player's tools the way a model would, against a
// real seeded engine and the real loop. Needs `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { declaration, ModelPlayer, playerPrompt } from "../src/agents/player.ts";
import { sessionOptions } from "../src/agents/sdk-session.ts";
import { REPO } from "../src/engine.ts";
import { TurnTimeout } from "../src/errors.ts";
import { packParty } from "../src/play/run.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedSeat } from "../src/table/scripted.ts";
import { PlayerTools } from "../src/table/tools.ts";
import type { PlayerWake } from "../src/table/types.ts";
import { testTable } from "./helpers.ts";
import { StandIn, type Script as PlayerScript } from "./stand-in.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");
const CHOICE = { model: "claude-sonnet-5-5", effort: "low" } as const;

type Script = PlayerScript<PlayerWake>;

/** A model player whose sessions are stand-ins playing `script`; `sessions` lists them as they open. */
function standInPlayer(handle: string, script: Script): { player: ModelPlayer; sessions: StandIn<PlayerWake>[] } {
  const sessions: StandIn<PlayerWake>[] = [];
  const card = packParty(MILL).cards.get(handle)!;
  const player = new ModelPlayer({
    handle,
    card,
    choice: CHOICE,
    open: (config) => {
      const session = new StandIn<PlayerWake>(config, script);
      sessions.push(session);
      return session;
    },
  });
  return { player, sessions };
}

function inputs(runDir: string): Array<{ seat: string; text: string }> {
  return readFileSync(path.join(runDir, "inputs.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

test("a model player's session has its own prompt with its card, its nine seat tools and nothing built in", () => {
  const { player } = standInPlayer("maren", async () => "");
  const card = packParty(MILL).cards.get("maren")!;
  assert.equal(player.systemPrompt, playerPrompt("maren", card));
  assert.ok(player.systemPrompt.includes(card.trim()), "the card is in the prompt as written");
  assert.match(player.systemPrompt, /You play one character, Maren \(handle maren\)/);
  const options = sessionOptions({ agent: "maren", choice: CHOICE, systemPrompt: player.systemPrompt, tools: player.seatTools }, "/empty");
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.settingSources, []);
  assert.deepEqual(options.skills, []);
  assert.deepEqual(
    options.allowedTools,
    ["my_sheet", "look", "legal_actions", "submit_decision", "move", "end_turn", "react", "say", "note"].map((t) => `mcp__table__${t}`),
  );
  for (const tool of player.seatTools) {
    for (const field of ["viewer", "actor", "prompt_id"]) assert.ok(!(field in tool.inputSchema), `${tool.name} takes ${field}`);
  }
});

test("a model player passes as a normal answer, plays from its card's At the table, and may speak on its own combat turn", () => {
  const card = packParty(MILL).cards.get("maren")!;
  assert.match(card, /\*\*At the table\.\*\* Speaks when/);
  const prompt = playerPrompt("maren", card);
  assert.match(prompt, /If not, just PASS: that is a normal answer/);
  assert.match(prompt, /your card's "At the table" and "With the party", and your notes/);
  assert.match(prompt, /Don't repeat what someone else already said/);
  assert.match(prompt, /You may also say one short line with say, reacting to what happened since your last turn/);
});

test("with --lang ru a model player speaks, declares, notes and summarises in Russian, and still passes with PASS", () => {
  const card = packParty(MILL).cards.get("maren")!;
  const english = playerPrompt("maren", card);
  const russian = playerPrompt("maren", card, "ru");
  assert.doesNotMatch(english, /Russian/);
  assert.ok(russian.startsWith(english), "the language rule is added at the end, after the same English prompt");
  assert.match(russian, /write in Russian everything you say, declare, note or summarise/);
  assert.match(russian, /just PASS, in Latin letters/);
  assert.equal(declaration("PASS"), undefined);
});

test("a declaration is its one line, and PASS or nothing is a pass", () => {
  assert.equal(declaration(' "Maren kneels by the tracks." '), "Maren kneels by the tracks.");
  assert.equal(declaration("PASS"), undefined);
  assert.equal(declaration("Pass. Maren waits."), undefined);
  assert.equal(declaration(""), undefined);
  assert.equal(declaration("Passing the well, Torva looks around."), "Passing the well, Torva looks around.");
});

test("in a fight, model players act through their bound tools, and what they were given is recorded", async () => {
  const fight: Script = async (wake, call) => {
    if (wake === "reaction") await call("react", { choice: null });
    if (wake === "combat_turn") {
      await call("look");
      await call("note", { kind: "fact", text: "Goblins hold the yard." });
      await call("end_turn");
    }
    return "";
  };
  const party = ["torva", "maren", "ilsa"].map((h) => standInPlayer(h, fight));
  const t = await testTable({
    seed: 27,
    seat: new ScriptedSeat("bren", [], (prompt, seat) =>
      seat.shown.filter((e) => e.kind === "status").length > 1 ? { kind: "command", name: "quit" } : ScriptedSeat.pass(prompt, seat),
    ),
  });
  const dm = new ScriptedDm({
    scene_open: async (tools) => void (await tools.startCombat("yard_fight")),
    narrate: async (tools) => void (await tools.narrate("The fight goes on.")),
  });
  try {
    const report = await new TableLoop({ table: t.table, dm, players: party.map((p) => p.player), maxSteps: 200 }).run("m5_s3_yard");
    assert.equal(report.ended, "the human quit");
    const requests = readFileSync(path.join(t.runDir, "engine-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).request);
    const given = inputs(t.runDir);
    let played = 0;
    for (const { player, sessions } of party) {
      const turns = sessions.flatMap((s) => s.turns).filter((turn) => turn.purpose === "combat_turn");
      if (turns.length === 0) continue;
      played += 1;
      const me = player.handle;
      assert.equal(sessions.length, 1, "one session for the scene");
      assert.match(turns[0].message, /^Your character sheet \(only you see it\):\n\{/);
      assert.match(turns[0].message, /Act with your tools, then call end_turn\.$/);
      // Every command it caused was sent as itself, for itself.
      const mine = requests.filter((r) => r.viewer === me);
      assert.ok(mine.some((r) => r.cmd === "end_turn" && r.actor === me));
      assert.ok(mine.filter((r) => "actor" in r).every((r) => r.actor === me));
      assert.deepEqual(player.notes[0], { kind: "fact", text: "Goblins hold the yard." });
      assert.ok(t.table.transcript.records.some((r) => r.channel === `notes:${me}` && r.text === "fact: Goblins hold the yard."));
      // Its prompt and its session's seed are among the inputs the leak scan reads.
      assert.ok(given.some((r) => r.seat === me && r.text === player.systemPrompt));
      assert.ok(given.some((r) => r.seat === me && r.text.startsWith("Your character sheet (only you see it):")));
      // Outside its wake, a tool does nothing.
      const late = await sessions[0].call("say", { text: "Still here." });
      assert.deepEqual(late, { text: "not now: the table isn't waiting on you", isError: true });
    }
    assert.ok(played >= 2, `only ${played} players had a turn`);
  } finally {
    t.close();
  }
});

test("a new scene starts a new session from the sheet, the summaries and the newest notes", async () => {
  let pass = false;
  const { player, sessions } = standInPlayer("maren", async (wake, call) => {
    if (wake === "summary") return "We reached the mill. I promised Bren I would watch the gate.";
    if (pass) return "PASS";
    assert.deepEqual(await call("say", { text: "Easy, my dears. Let me look first." }), { text: "said", isError: false });
    for (let i = 0; i < 60; i += 1) await call("note", { kind: "plan", text: `Plan ${i}: keep the bread for whoever is hungriest.` });
    await call("note", { kind: "promise", text: "I told Bren I would watch the gate." });
    return "Maren kneels beside the gate to look at the tracks.";
  });
  const t = await testTable({ seed: 1, players: ["maren"] });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    const tools = new PlayerTools("maren", t.table);
    assert.equal(await player.wake("declare", "Declare at most one thing.", tools), "Maren kneels beside the gate to look at the tracks.");
    const summary = await player.wake("summary", "The scene is over.", tools);
    assert.equal(summary, "We reached the mill. I promised Bren I would watch the gate.");
    await player.newScene(summary as string);
    assert.equal(sessions[0].closed, true);
    pass = true;
    assert.equal(await player.wake("declare", "Declare at most one thing.", tools), undefined);
    assert.equal(sessions.length, 2);
    const seed = sessions[1].turns[0].message;
    assert.match(seed, /^Your character sheet \(only you see it\):\n\{/);
    assert.match(seed, /The story so far, as you summed it up:\n- We reached the mill\. I promised Bren I would watch the gate\./);
    assert.match(seed, /Your notes \(the newest; older ones are in your summaries\):/);
    assert.match(seed, /- promise: I told Bren I would watch the gate\.\n\nDeclare at most one thing\.$/);
    assert.match(seed, /Plan 59:/);
    assert.doesNotMatch(seed, /Plan 0:/);
    // Its line reached the table; its notes reached only its own channel.
    const records = t.table.transcript.records;
    assert.ok(records.some((r) => r.channel === "table" && r.speaker === "maren" && r.text === "Easy, my dears. Let me look first."));
    assert.ok(records.filter((r) => r.kind === "note").every((r) => r.channel === "notes:maren"));
  } finally {
    t.close();
  }
});

test("after a timeout the session goes on; after any other failure the next wake starts a fresh one", async () => {
  let fail: Error | undefined;
  const { player, sessions } = standInPlayer("ilsa", async () => {
    if (fail) throw fail;
    return "";
  });
  const t = await testTable({ seed: 1, players: ["ilsa"] });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    const tools = new PlayerTools("ilsa", t.table);
    fail = new TurnTimeout("ilsa: turn timed out");
    await assert.rejects(player.wake("declare", "Declare.", tools), TurnTimeout);
    fail = undefined;
    await player.wake("declare", "Declare.", tools);
    assert.equal(sessions.length, 1, "the session survives a timeout");
    fail = new Error("ilsa: the agent session ended");
    await assert.rejects(player.wake("declare", "Declare.", tools), /session ended/);
    assert.equal(sessions[0].closed, true);
    fail = undefined;
    await player.wake("declare", "Declare.", tools);
    assert.equal(sessions.length, 2);
    assert.match(sessions[1].turns[0].message, /^Your character sheet \(only you see it\):/);
  } finally {
    t.close();
  }
});

test("a tool call that comes while a timed-out turn settles is refused, not acted on", async () => {
  const answers: string[] = [];
  const { player, sessions } = standInPlayer("ilsa", async (_wake, call) => {
    answers.push((await call("look")).text);
    return "";
  });
  const t = await testTable({ seed: 1, players: ["ilsa"] });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    const tools = new PlayerTools("ilsa", t.table);
    await player.wake("declare", "Declare.", tools);
    const looked = t.requests().filter((r) => r.cmd === "get_state").length;
    sessions[0].settling = true;
    await player.wake("declare", "Declare.", tools);
    assert.equal(answers[1], "not now: that turn is over");
    assert.equal(t.requests().filter((r) => r.cmd === "get_state").length, looked, "the late call never reached the engine");
    sessions[0].settling = false;
    await player.wake("declare", "Declare.", tools);
    assert.doesNotMatch(answers[2], /^not now/);
  } finally {
    t.close();
  }
});

test("the all-AI run command plays the yard with scripted players and writes its run folder", () => {
  const out = mkdtempSync(path.join(tmpdir(), "ai-party-"));
  try {
    const cli = path.join(REPO, "game/src/play/ai-party.ts");
    const run = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", cli, "--players", "scripted", "--seed", "23", "--no-audit", "--out", out],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const [folder] = readdirSync(out);
    assert.match(folder, /^ai-party-/);
    for (const file of ["transcript.jsonl", "session-log.jsonl", "engine-log.jsonl", "inputs.jsonl", "usage.jsonl", "report.md"]) {
      assert.ok(existsSync(path.join(out, folder, file)), `${file} is written`);
    }
    const report = readFileSync(path.join(out, folder, "report.md"), "utf8");
    assert.match(report, /- Ended: the adventure is over/);
    assert.match(report, /- Fights: Combat is over\. The party side wins\./);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
