// The turn loop (M6 step 5, TASKS.md AGT-3) and its retry and fallback model (AGT-11), with
// scripted agents, a scripted human seat and a real seeded engine (spec §8: CI never calls a model).
// The two game fixtures (transcript, session log, seat inputs) replay byte for byte; set
// RECORD_FIXTURES=1 to write them again after a deliberate change, and read the diff.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REPO, SESSION_LOG, type GameEngine } from "../src/engine.ts";
import { readPack } from "../src/pack/read.ts";
import { guards, scenePlan } from "../src/play/run.ts";
import { TurnTimeout, UsageLimitReached } from "../src/errors.ts";
import { TableLoop, type LoopOptions } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedPlayer, ScriptedSeat, walkOnDm, type DmScript, type ScriptedPlayerPolicy } from "../src/table/scripted.ts";
import type { TextGuard } from "../src/table/state.ts";
import type { PlayerIntent, TableEvent } from "../src/table/types.ts";
import { testTable, type TestTable } from "./helpers.ts";
import { trailDm, yardDm } from "./scripts.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/**
 * A run's files a game fixture keeps: what the audit and the leak scan read (step 6,
 * `crates/nat20-duel/tests/game_fixtures.rs`).
 */
const RUN_FILES = ["transcript.jsonl", SESSION_LOG, "inputs.jsonl"];

/** Compares a run's files with its fixture (`<name>.<file>`), or writes the fixture when recording. */
function matchesFixture(name: string, runDir: string): void {
  for (const run of RUN_FILES) {
    const actual = readFileSync(path.join(runDir, run), "utf8");
    const file = path.join(FIXTURES, `${name}.${run}`);
    if (process.env.RECORD_FIXTURES || !existsSync(file)) writeFileSync(file, actual);
    assert.equal(actual, readFileSync(file, "utf8"), `${name}.${run} changed; RECORD_FIXTURES=1 rewrites it`);
  }
}

interface Setup {
  seed: number;
  /** A scenario pack; the engine's test scenes by default. */
  pack?: string;
  scene?: string;
  party?: string[];
  players?: Record<string, ScriptedPlayerPolicy>;
  seat?: ScriptedSeat;
  dm: ScriptedDm | DmScript;
  narrationGuard?: TextGuard;
  speechGuard?: TextGuard;
  guards?: (engine: GameEngine) => { narrationGuard: TextGuard; speechGuard: TextGuard };
  onScene?: LoopOptions["onScene"];
  maxSteps?: number;
  /** Send the human's seat situations, as the terminal does (AGT-35). */
  situation?: boolean;
  /** Sees the table before the run starts. */
  onTable?: (t: TestTable) => void;
}

/** A table on the engine's test scenes, played by the loop until it ends. */
async function play(setup: Setup) {
  const policies = setup.players ?? { torva: {}, maren: {}, ilsa: {} };
  const handles = Object.keys(policies);
  const t = await testTable({
    seed: setup.seed,
    pack: setup.pack,
    guards: setup.guards,
    players: handles,
    seat: setup.seat ?? new ScriptedSeat("bren", [], ScriptedSeat.fight, handles),
    narrationGuard: setup.narrationGuard,
    speechGuard: setup.speechGuard,
  });
  setup.onTable?.(t);
  const players = handles.map((h) => new ScriptedPlayer(h, policies[h]));
  const dm = setup.dm instanceof ScriptedDm ? setup.dm : new ScriptedDm(setup.dm);
  const loop = new TableLoop({ table: t.table, dm, players, onScene: setup.onScene, maxSteps: setup.maxSteps ?? 400, situation: setup.situation });
  try {
    const report = await loop.run(setup.scene ?? "m5_s3_yard", setup.party);
    return { t, report, dm, players: new Map(players.map((p) => [p.handle, p])), seat: t.table.seat as ScriptedSeat };
  } finally {
    t.close();
  }
}

/** The transcript's lines on the run channel: retries, fallbacks, errors. */
function runLines(t: TestTable, kind?: string): string[] {
  return t.table.transcript.records.filter((r) => r.channel === "run" && (!kind || r.kind === kind)).map((r) => r.text);
}

/** Everything the human's seat was given, as the leak scan reads it. */
function humanInputs(t: TestTable): string {
  return readFileSync(path.join(t.runDir, "inputs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { seat: string; text: string; human?: boolean })
    .filter((r) => r.seat === "bren" && !r.human)
    .map((r) => r.text)
    .join("\n");
}

/** A seat that answers `answers` first and then quits. */
function seatThen(answers: PlayerIntent[], then: PlayerIntent = { kind: "command", name: "quit" }): ScriptedSeat {
  return new ScriptedSeat("bren", answers, () => then);
}

/** Opens the yard's fight at once and narrates every wake with one plain line. */
const fightAtOnce: DmScript = {
  scene_open: async (tools) => void (await tools.startCombat("yard_fight")),
  narrate: async (tools) => void (await tools.narrate("The fight goes on.")),
};

// --- The game fixtures -------------------------------------------------------------------------

test("the party, scripted, plays the yard fight to its end, and the transcript replays exactly", async () => {
  // With the situation panel on, so the leak scan over the fixture reads every situation the human got.
  const { t, report, players, seat } = await play({ seed: 23, dm: yardDm(), situation: true });
  assert.equal(report.ended, "the adventure is over");
  assert.deepEqual(report.scenes, ["m5_s3_yard"]);
  assert.equal(report.fallbacks, 0);
  const lines = t.table.transcript.records.map((r) => r.text);
  assert.ok(lines.includes("Combat is over. The party side wins."));
  assert.ok([...players.values()].some((p) => p.briefings.some((b) => b.wake === "reaction")), "an AI player was asked to react");
  assert.ok(seat.shown.some((e) => e.kind === "options"), "the human picked from numbered options");
  matchesFixture("m5_yard", t.runDir);
});

test("the human, scripted, plays the Milestone 3 trail across five scenes, and the transcript replays exactly", async () => {
  const { t, report } = await play({ seed: 5, scene: "m3_s1_green", players: {}, dm: trailDm() });
  assert.equal(report.ended, "the adventure is over");
  assert.deepEqual(report.scenes, ["m3_s1_green", "m3_s2_road", "m3_s3_yard", "m3_s4_prisoner", "m3_s5_cellar"]);
  const lines = t.table.transcript.records.map((r) => r.text);
  assert.ok(lines.includes("Combat is over: the other side surrendered."));
  assert.ok(t.table.transcript.records.some((r) => r.kind === "question"), "the DM asked the human a question");
  matchesFixture("m3_trail", t.runDir);
});

// --- Combat order --------------------------------------------------------------------------------

test("each part of a turn shows its engine lines, then its narration, before the next part", async () => {
  const { seat } = await play({ seed: 23, dm: yardDm() });
  const shown = seat.shown.filter((e): e is Extract<TableEvent, { kind: "engine" | "narration" }> => e.kind === "engine" || e.kind === "narration");
  // After a PC's turn ends, its narration comes before any line of the next creature's turn. A
  // turn the PC played, that is: a downed PC's turn is the engine's (a death save), and is
  // narrated with the monsters' turns around it.
  let played = 0;
  for (const [i, e] of shown.entries()) {
    const pc = e.kind === "engine" ? /^(bren|torva|maren|ilsa)'s turn ends\.$/.exec(e.text)?.[1] : undefined;
    if (!pc) continue;
    let start = i;
    while (start > 0 && shown[start].text !== `${pc}'s turn.`) start -= 1;
    if (!shown.slice(start, i).some((x) => x.text.startsWith(`${pc} uses `) || x.text === `${pc} moves.`)) continue;
    played += 1;
    const next = shown.slice(i + 1).find((x) => x.kind === "narration" || /'s turn\.$/.test(x.text));
    assert.equal(next?.kind, "narration", `narration before the next turn after: ${e.text}`);
  }
  assert.ok(played > 4, `only ${played} PC turns played`);
});

test("the DM's narration of the human's mapped words comes before the next turn, and the turn isn't narrated again", async () => {
  const { seat, dm } = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "I run for the woodpile" }]),
    dm: {
      ...fightAtOnce,
      map_combat: async (tools) => {
        await tools.submit({ option_id: "dash" });
        await tools.endTurn();
        await tools.narrate("Bren sprints for the woodpile.");
      },
    },
  });
  const lines = seat.shown.flatMap((e) => (e.kind === "engine" || e.kind === "narration" ? [e.text] : []));
  const narration = lines.indexOf("Bren sprints for the woodpile.");
  assert.ok(lines.indexOf("bren uses Dash.") < narration);
  assert.ok(narration < lines.indexOf("goblin_2's turn."), "the monsters' turns wait for the narration of Bren's");
  assert.ok(!dm.briefings.some((b) => b.wake === "narrate" && b.briefing.includes("bren uses Dash.")), "the DM narrated Bren's turn once");
  assert.ok(dm.briefings.some((b) => b.wake === "narrate" && b.briefing.includes("goblin_2's turn.")), "and the monsters' turns after it");
});

test("two narrations made at once show each engine line once", async () => {
  const loaded = "Scene m5_s3_yard loaded in explore mode.";
  const { t, seat } = await play({
    seed: 27,
    players: { maren: {} },
    seat: seatThen([]),
    dm: { scene_open: async (tools) => void (await Promise.all([tools.narrate("The yard is quiet."), tools.narrate("Too quiet.")])) },
  });
  assert.equal(seat.shown.filter((e) => e.kind === "engine" && e.text === loaded).length, 1);
  assert.equal(t.table.transcript.records.filter((r) => r.channel === "dm" && r.text === loaded).length, 1);
});

// --- Spec §6, row by row -------------------------------------------------------------------------

test("an engine refusal goes back to the agent that made the call, counts as a retry, and reaches nobody else", async () => {
  let refusal = "";
  let retries = -1;
  let t!: TestTable;
  const { report } = await play({
    seed: 27,
    onTable: (table) => (t = table),
    players: {
      torva: {},
      maren: {},
      ilsa: {
        combat: async (tools) => {
          const outcome = await tools.submitDecision({ option_id: "cast/no_such_spell" });
          refusal = outcome.text;
          retries = t.table.retries("ilsa");
          await tools.endTurn();
          t.table.end("test over");
        },
      },
    },
    dm: fightAtOnce,
  });
  const { table } = t;
  assert.equal(report.ended, "test over");
  assert.match(refusal, /^unknown_option/);
  assert.equal(retries, 1);
  assert.ok(runLines(t, "retry").some((l) => l.startsWith("ilsa: submit refused: unknown_option")), "the retry is on the record");
  assert.deepEqual(runLines(t, "fallback"), []);
  assert.doesNotMatch(humanInputs(t), /no_such_spell/);
  for (const player of ["torva", "maren"]) assert.ok(!table.drainInbox(player).some((l) => l.includes("no_such_spell")));
});

test("an agent that ends its turn without acting is nudged once, then the turn falls back to end_turn", async () => {
  const { t, players, report } = await play({
    seed: 27,
    players: { torva: {}, maren: {}, ilsa: { combat: async () => {} } },
    seat: new ScriptedSeat("bren", [], (prompt, seat) => (seat.shown.filter((e) => e.kind === "status").length > 1 ? { kind: "command", name: "quit" } : ScriptedSeat.pass(prompt, seat))),
    dm: fightAtOnce,
  });
  // The report times the turn, both wakes of it, not each wake on its own.
  assert.equal(report.playerTurns.find((turn) => turn.handle === "ilsa")?.wakes, 2);
  const ilsa = players.get("ilsa")!;
  assert.deepEqual(ilsa.briefings.filter((b) => b.wake === "combat_turn").map((b) => b.briefing.split("\n").at(-1)).slice(0, 2), [
    "Act with your tools, then call end_turn.",
    "It is still your turn. Act with submit_decision or move, and call end_turn when you are done.",
  ]);
  assert.ok(runLines(t, "retry").includes("ilsa didn't end its turn; nudged"));
  assert.ok(runLines(t, "fallback").includes("ilsa's turn ends"));
  assert.ok(t.requests().some((r) => r.cmd === "end_turn" && r.actor === "ilsa"));
});

test("an agent that acts after the nudge doesn't fall back", async () => {
  let woken = 0;
  let t!: TestTable;
  await play({
    seed: 27,
    onTable: (table) => (t = table),
    players: {
      torva: {},
      maren: {},
      ilsa: {
        combat: async (tools) => {
          if (++woken === 2) {
            await tools.endTurn();
            t.table.end("test over");
          }
        },
      },
    },
    dm: fightAtOnce,
  });
  assert.equal(woken, 2);
  assert.deepEqual(runLines(t, "fallback"), []);
});

test("once two retries are spent, no further change reaches the engine and the turn falls back", async () => {
  const texts: string[] = [];
  let t!: TestTable;
  await play({
    seed: 27,
    onTable: (table) => (t = table),
    players: {
      torva: {},
      maren: {},
      ilsa: {
        combat: async (tools) => {
          for (let i = 0; i < 5; i++) texts.push((await tools.submitDecision({ option_id: "cast/no_such_spell" })).text);
          texts.push((await tools.endTurn()).text);
          t.table.end("test over");
        },
      },
    },
    dm: fightAtOnce,
  });
  assert.equal(t.requests().filter((r) => r.cmd === "submit" && r.actor === "ilsa").length, 3, "the first try and two retries");
  assert.deepEqual(texts.slice(3), Array(3).fill("No retries left for this decision; the table moves on."));
  assert.ok(!runLines(t, "retry").includes("ilsa didn't end its turn; nudged"), "no nudge once retries are spent");
  assert.ok(runLines(t, "fallback").includes("ilsa's turn ends"));
});

test("a seat's changes made at once go one at a time, so none slips past a spent decision", async () => {
  const texts: string[] = [];
  let t!: TestTable;
  await play({
    seed: 27,
    onTable: (table) => (t = table),
    players: {
      torva: {},
      maren: {},
      ilsa: {
        combat: async (tools) => {
          const wrong = () => tools.submitDecision({ option_id: "cast/no_such_spell" });
          for (const outcome of await Promise.all([wrong(), wrong(), wrong(), tools.endTurn()])) texts.push(outcome.text);
          t.table.end("test over");
        },
      },
    },
    dm: fightAtOnce,
  });
  assert.equal(t.requests().filter((r) => r.cmd === "submit" && r.actor === "ilsa").length, 3);
  assert.equal(texts[3], "No retries left for this decision; the table moves on.");
  assert.ok(runLines(t, "fallback").includes("ilsa's turn ends"), "the end_turn made alongside them never reached the engine");
});

test("a refusal that isn't retryable is logged as a loop bug and ends the decision", async () => {
  const texts: string[] = [];
  let t!: TestTable;
  await play({
    seed: 27,
    onTable: (table) => (t = table),
    players: {
      torva: {},
      maren: {},
      ilsa: {
        combat: async (tools) => {
          texts.push((await tools.submitDecision({ option_id: "dash", variant: "fast" })).text);
          texts.push((await tools.endTurn()).text);
          t.table.end("test over");
        },
      },
    },
    dm: fightAtOnce,
  });
  assert.match(texts[0], /^bad_request/);
  assert.equal(texts[1], "No retries left for this decision; the table moves on.");
  assert.ok(runLines(t, "error").includes("ilsa: submit answered bad_request: dash has no variants; send it without one."));
  assert.ok(runLines(t, "fallback").includes("ilsa's turn ends"));
});

test("a model timeout falls back without a retry or a nudge", async () => {
  let t!: TestTable;
  await play({
    seed: 27,
    onTable: (table) => (t = table),
    players: {
      torva: {},
      maren: {},
      ilsa: {
        combat: async () => {
          t.table.end("test over");
          throw new TurnTimeout("ilsa: turn timed out after 20000 ms");
        },
      },
    },
    dm: fightAtOnce,
  });
  assert.ok(runLines(t, "error").includes("ilsa (combat_turn) timed out"));
  assert.ok(runLines(t, "fallback").includes("ilsa's turn ends"));
  assert.deepEqual(runLines(t, "retry").filter((l) => l.startsWith("ilsa")), []);
});

test("the plan's usage limit stops the run cleanly and says so", async () => {
  const { t, report, seat } = await play({
    seed: 27,
    players: { torva: {}, maren: {}, ilsa: { combat: async () => Promise.reject(new UsageLimitReached(undefined)) } },
    dm: fightAtOnce,
  });
  assert.equal(report.ended, "The Claude plan's usage limit was reached.");
  assert.deepEqual(seat.shown.at(-1), { kind: "end", text: report.ended });
  assert.ok(runLines(t, "system").includes(`run ended: ${report.ended}`));
  assert.deepEqual(runLines(t, "fallback"), []);
});

test("the engine dying stops the run, with the transcript written", async () => {
  let engine: TestTable["engine"] | undefined;
  const { t, report } = await play({
    seed: 27,
    onTable: (table) => (engine = table.engine),
    dm: {
      scene_open: async (tools) => {
        await tools.narrate("The yard is quiet.");
        engine!.close();
      },
    },
  });
  assert.match(report.ended, /^the engine exited/);
  assert.ok(runLines(t, "system").includes(`run ended: ${report.ended}`));
  assert.match(readFileSync(path.join(t.runDir, "transcript.jsonl"), "utf8"), /The yard is quiet\./);
});

test("a reaction the agent doesn't take is declined; one against an ally is declined without a wake", async () => {
  const ignore = { reaction: async () => {} };
  const { t, players } = await play({ seed: 23, players: { torva: ignore, maren: ignore, ilsa: ignore }, dm: yardDm() });
  const party = new Set(["bren", ...players.keys()]);
  let asked = 0;
  let declinedUnasked = 0;
  for (const [handle, player] of players) {
    const wakes = player.briefings.filter((b) => b.wake === "reaction");
    asked += wakes.length;
    // The engine asks every creature in reach; an AI player is woken only for a foe (TASKS.md AGT-27).
    for (const w of wakes) assert.ok(!party.has(/may react to ([\w-]+)\./.exec(w.briefing)?.[1] ?? ""), `${handle} was woken to react to an ally`);
    assert.equal(runLines(t, "fallback").filter((l) => l === `${handle} lets the reaction pass`).length, wakes.length);
    const declined = t.requests().filter((r) => r.cmd === "react" && r.actor === handle && r.choice === null).length;
    assert.ok(declined >= wakes.length);
    declinedUnasked += declined - wakes.length;
  }
  assert.ok(asked > 0, "an AI player was woken to react to a foe");
  assert.ok(declinedUnasked > 0, "a reaction to an ally was declined with no wake");
});

test("the scripted human lets a reaction to an ally pass, and takes one to a foe", () => {
  // In the first live Scene 3 run, scripted Bren took an Opportunity Attack on Torva walking away.
  const seat = new ScriptedSeat("bren", [], ScriptedSeat.fight, ["torva", "maren", "ilsa"]);
  const offered = (about: string) => {
    seat.show({ kind: "reaction", summary: `bren may react to ${about}.`, options: ["Opportunity Attack"] });
    return ScriptedSeat.fight({ kind: "reaction" }, seat);
  };
  assert.deepEqual(offered("torva"), { kind: "reaction", take: false });
  assert.deepEqual(offered("wolf_1"), { kind: "reaction", take: true });
});

test("the human's refused number gets the engine's sentence and the list again, and is counted", async () => {
  const { t, report, seat } = await play({
    seed: 27,
    seat: new ScriptedSeat("bren", [], (prompt, s) =>
      s.shown.filter((e) => e.kind === "status").length > 1 ? { kind: "command", name: "quit" } : ScriptedSeat.fight(prompt, s),
    ),
    dm: fightAtOnce,
  });
  assert.ok(report.humanRejections >= 1);
  const at = seat.shown.findIndex((e) => e.kind === "info" && e.title === "Not accepted");
  assert.ok(at >= 0);
  assert.match((seat.shown[at] as { text: string }).text, /^Not enough movement/);
  assert.equal(seat.shown.slice(at + 1).find((e) => e.kind === "options" || e.kind === "info")?.kind, "options");
  assert.ok(runLines(t, "retry").some((l) => l.startsWith("bren's choice was not accepted")));
});

test("the human's words in a fight go to the DM, and back to the human when the DM can't map them", async () => {
  const words = "I do a backflip over the goblins";
  const unmapped = await play({ seed: 27, seat: seatThen([{ kind: "text", text: words }]), dm: fightAtOnce });
  assert.ok(unmapped.dm.briefings.some((b) => b.wake === "map_combat" && b.briefing.includes(words)));
  assert.ok(unmapped.seat.shown.some((e) => e.kind === "info" && e.text === "I didn't get that; pick from /options."));
  assert.ok(runLines(unmapped.t, "fallback").includes("the DM didn't map bren's words; back to the human"));

  const mapped = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "I run for the woodpile" }]),
    dm: { ...fightAtOnce, map_combat: async (tools) => void (await tools.submit({ option_id: "dash" })) },
  });
  assert.ok(mapped.t.requests().some((r) => r.cmd === "submit" && r.viewer === "dm" && r.actor === "bren" && r.option_id === "dash"));
  assert.deepEqual(runLines(mapped.t, "fallback"), []);
});

test("the human's words in a fight that the DM answers in fiction are not 'not understood'", async () => {
  // The exit run (2026-10-27): Bren asked a goblin a question; the DM answered and asked back, and the
  // table still said "I didn't get that" and counted a fallback (TASKS.md AGT-29).
  const talk = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "Ask the goblin what they want with the girl" }]),
    dm: {
      ...fightAtOnce,
      map_combat: async (tools) => {
        await tools.narrate("The goblin squeals that the boss wants the grain.");
        await tools.askHuman("Do you spare him?");
      },
    },
  });
  assert.ok(!talk.seat.shown.some((e) => e.kind === "info" && e.text === "I didn't get that; pick from /options."));
  assert.deepEqual(runLines(talk.t, "fallback"), []);
  const asked = talk.seat.shown.findIndex((e) => e.kind === "question");
  assert.ok(asked >= 0);
  assert.equal(talk.seat.shown.slice(asked + 1).find((e) => e.kind === "options" || e.kind === "info")?.kind, "options", "the list comes back");
});

test("a check the DM repeats for the human is refused to the DM, and the check id never reaches the human", async () => {
  const outcomes: string[] = [];
  const { t } = await play({
    seed: 5,
    scene: "m3_s1_green",
    players: {},
    seat: seatThen([{ kind: "text", text: "I study the reeve's face." }]),
    dm: {
      table_turn: async (tools) => {
        outcomes.push((await tools.requestCheck("bren", { kind: "scenario", check_id: "reeve_insight" })).text);
        outcomes.push((await tools.requestCheck("bren", { kind: "scenario", check_id: "reeve_insight" })).text);
        await tools.narrate("The reeve gives nothing more away.");
      },
    },
  });
  assert.match(outcomes[0], /^\[r\d+\] (success|failure)/);
  assert.match(outcomes[1], /already_attempted/);
  assert.match(outcomes[1], /reeve_insight/);
  assert.doesNotMatch(humanInputs(t), /reeve_insight|already_attempted/);
});

test("a refused narration reaches nobody; the DM rewrites it, and after two retries the engine lines stand alone", async () => {
  const digits: TextGuard = (text) => (/\d/.test(text) ? "it holds a number" : undefined);
  const rewritten = await play({
    seed: 27,
    players: { maren: {} },
    seat: seatThen([]),
    narrationGuard: digits,
    dm: {
      scene_open: async (tools) => {
        await tools.narrate("3 goblins and 3 wolves wait.");
        await tools.narrate("Goblins and wolves wait.");
      },
    },
  });
  assert.doesNotMatch(humanInputs(rewritten.t), /3 goblins/);
  assert.ok(!rewritten.players.get("maren")!.briefings.some((b) => b.briefing.includes("3 goblins")));
  assert.ok(runLines(rewritten.t, "retry").includes("narration refused: it holds a number"));
  assert.ok(rewritten.seat.shown.some((e) => e.kind === "narration" && e.text === "Goblins and wolves wait."));

  const stubborn = await play({
    seed: 27,
    players: { maren: {} },
    seat: seatThen([]),
    narrationGuard: digits,
    dm: { scene_open: async (tools) => void (await Promise.all([1, 2, 3, 4].map(() => tools.narrate("3 goblins wait.")))) },
  });
  assert.equal(runLines(stubborn.t, "retry").length, 3);
  assert.ok(runLines(stubborn.t, "fallback").includes("the DM's retries ran out (scene_open); the engine lines stand alone"));
  assert.ok(stubborn.seat.shown.some((e) => e.kind === "engine" && e.text === "Scene m5_s3_yard loaded in explore mode."));
});

test("AI players declare in parallel and are heard in seat order; a refused declaration is asked for again", async () => {
  const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const { t, dm, players } = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "I look for tracks." }]),
    speechGuard: (text) => (/HP/.test(text) ? "it names a game number" : undefined),
    players: {
      torva: {
        declare: async (tools) => {
          await later(30);
          await tools.say("Stay close.");
          return "I guard the gate.";
        },
      },
      maren: { declare: async (_tools, briefing) => (/Refused/.test(briefing) ? "I pray for us all." : "I pray, I have 9 HP left.") },
      ilsa: {
        declare: async (tools) => {
          await tools.say("Something is wrong here.");
          return "I read the old sign.";
        },
      },
    },
    dm: { scene_open: async (tools) => void (await tools.narrate("The yard is quiet.")) },
  });
  const heard = t.table.transcript.records.filter((r) => r.channel === "table" && (r.kind === "speech" || r.kind === "intent")).map((r) => `${r.speaker}: ${r.text}`);
  assert.deepEqual(heard, [
    "bren: I look for tracks.",
    "torva: Stay close.",
    "ilsa: Something is wrong here.",
    "torva: I guard the gate.",
    "maren: I pray for us all.",
    "ilsa: I read the old sign.",
  ]);
  // Maren hears why, declares again, and nothing falls back.
  const retold = players.get("maren")!.briefings.filter((b) => b.wake === "declare").map((b) => b.briefing);
  assert.equal(retold.length, 2);
  assert.match(retold[1], /Refused, nobody heard it: it names a game number/);
  assert.ok(runLines(t, "retry").includes("declaration refused: it names a game number"));
  assert.deepEqual(runLines(t, "fallback"), []);
  const turn = dm.briefings.find((b) => b.wake === "table_turn")!.briefing;
  assert.ok(turn.indexOf("bren: I look for tracks.") < turn.indexOf("torva: I guard the gate."));
  assert.doesNotMatch(turn, /9 HP/);
});

test("a declaration refused again and again is dropped once its retries are spent", async () => {
  const { t, players } = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "I look for tracks." }]),
    speechGuard: (text) => (/HP/.test(text) ? "it names a game number" : undefined),
    players: { maren: { declare: async () => "I pray, I have 9 HP left." } },
    dm: { scene_open: async (tools) => void (await tools.narrate("The yard is quiet.")) },
  });
  // The first declaration and two retries, then the third refusal spends them.
  assert.equal(players.get("maren")!.briefings.filter((b) => b.wake === "declare").length, 3);
  assert.equal(runLines(t, "retry").filter((l) => l.startsWith("declaration refused")).length, 3);
  assert.ok(runLines(t, "fallback").some((l) => l.startsWith("maren's declaration is dropped")));
  assert.ok(!t.table.transcript.records.some((r) => r.speaker === "maren" && r.kind === "intent"));
});

test("a reaction number the human wasn't shown asks again, and never takes a reaction", async () => {
  // Seed 1: Bren is offered a reaction with two options in the yard fight. He types 3, then declines.
  const answers: PlayerIntent[] = [{ kind: "option", number: 3 }, { kind: "reaction", take: false }];
  let asked = 0;
  const seat = new ScriptedSeat("bren", [], (prompt, s) => {
    if (prompt.kind !== "reaction") return ScriptedSeat.fight(prompt, s);
    asked += 1;
    return answers.shift() ?? { kind: "reaction", take: false };
  });
  const { t } = await play({ seed: 1, seat, dm: yardDm() });
  assert.equal(asked, 2);
  const told = seat.shown.findIndex((e) => e.kind === "info" && e.title === "No such reaction");
  assert.ok(told > 0, "the human is told the number isn't one");
  assert.equal(seat.shown[told].kind === "info" && seat.shown[told].text, "There is no reaction 3. Answer y or n, or 1 or 2.");
  const reacted = t.table.transcript.records.filter((r) => r.channel === "dm" && /^bren .*reaction|Opportunity Attack/.test(r.text) && r.text.startsWith("bren"));
  assert.deepEqual(reacted, [], "Bren took no reaction");
});

test("the human's words reach the AI players marked as the human's, so the leak scan skips them", async () => {
  const { t } = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "Is this DC 15?" }]),
    dm: { scene_open: async (tools) => void (await tools.narrate("The yard is quiet.")) },
  });
  const heard = readFileSync(path.join(t.runDir, "inputs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { seat: string; text: string; quoted?: string[] })
    .filter((r) => r.seat !== "bren" && r.text.includes("Is this DC 15?"));
  assert.deepEqual(heard.map((r) => r.seat).sort(), ["ilsa", "maren", "torva"]);
  for (const r of heard) assert.deepEqual(r.quoted, ["bren: Is this DC 15?"]);
});

test("a run whose record can't be written fails instead of ending as usual", async () => {
  await assert.rejects(
    play({
      seed: 27,
      seat: seatThen([]),
      dm: fightAtOnce,
      // The session log's place is taken by a folder, so writing it fails while the engine runs.
      onTable: (t) => mkdirSync(path.join(t.runDir, SESSION_LOG)),
    }),
    /EISDIR/,
  );
});

test("each seat has its own retry budget, so one player's refusals don't spend another's", async () => {
  const { t } = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "We wait." }]),
    speechGuard: (text) => (/HP/.test(text) ? "it names a game number" : undefined),
    players: {
      maren: {
        declare: async (tools) => {
          for (let i = 0; i < 4; i++) await tools.say("I have 9 HP.");
        },
      },
      ilsa: { declare: async (tools) => void (await tools.say("Quiet, both of you.")) },
    },
    dm: {},
  });
  assert.equal(runLines(t, "retry").filter((l) => l === "speech refused: it names a game number").length, 3);
  const heard = t.table.transcript.records.filter((r) => r.kind === "speech").map((r) => `${r.speaker}: ${r.text}`);
  assert.deepEqual(heard, ["ilsa: Quiet, both of you."]);
});

test("/pause stops waking AI players until /pause again", async () => {
  const { players } = await play({
    seed: 27,
    seat: seatThen([
      { kind: "command", name: "pause" },
      { kind: "text", text: "I wait at the gate." },
      { kind: "command", name: "pause" },
      { kind: "text", text: "I step into the yard." },
    ]),
    players: { maren: {} },
    dm: {},
  });
  assert.deepEqual(players.get("maren")!.briefings.map((b) => b.wake), ["declare"]);
  assert.match(players.get("maren")!.briefings[0].briefing, /I step into the yard/);
});

test("/pause holds a granted action and the scene summaries until /pause again, and a /quit meanwhile ends the run", async () => {
  const bless = { granted: async (tools: Parameters<NonNullable<ScriptedPlayerPolicy["granted"]>>[0]) => void (await tools.submitDecision({ option_id: "cast/bless/1", targets: ["bren", "maren"] })) };
  const grant: DmScript = { table_turn: async (tools) => void tools.grantAction("maren") };
  const pause = { kind: "command", name: "pause" } as const;
  const words = { kind: "text", text: "Bless us before we go in." } as const;
  const quit = await play({ seed: 27, seat: seatThen([pause, words]), players: { maren: bless }, dm: grant });
  assert.equal(quit.report.ended, "the human quit");
  assert.deepEqual(quit.players.get("maren")!.briefings, []);
  assert.ok(!quit.t.requests().some((r) => r.cmd === "submit" && r.actor === "maren"));
  assert.ok(quit.seat.shown.some((e) => e.kind === "status" && e.text === "Paused. Type /pause to go on."));

  const resumed = await play({ seed: 27, seat: seatThen([pause, words, pause]), players: { maren: bless }, dm: grant });
  assert.deepEqual(resumed.players.get("maren")!.briefings.map((b) => b.wake), ["granted"]);
  assert.equal(resumed.t.requests().filter((r) => r.cmd === "submit" && r.actor === "maren").length, 1);

  const summaries = await play({
    seed: 27,
    seat: seatThen([pause, { kind: "text", text: "We go down to the cellar." }]),
    players: { maren: {} },
    dm: { table_turn: async (tools) => void (await tools.loadScene("m5_s5_cellar", ["bren", "maren"])) },
  });
  assert.equal(summaries.report.ended, "the human quit");
  assert.deepEqual(summaries.players.get("maren")!.briefings, [], "no summary while paused");
  assert.deepEqual(summaries.dm.briefings.map((b) => b.wake), ["scene_open", "table_turn"]);
});

test("a granted action is taken once; an unused grant falls back to a pass; the DM narrates the outcome", async () => {
  const { t, dm } = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "Bless us before we go in." }]),
    players: {
      maren: { granted: async (tools) => void (await tools.submitDecision({ option_id: "cast/bless/1", targets: ["bren", "maren", "ilsa"] })) },
      ilsa: {},
    },
    dm: {
      table_turn: async (tools) => {
        tools.grantAction("maren");
        tools.grantAction("ilsa");
        await tools.narrate("Maren raises her holy symbol.");
      },
    },
  });
  assert.equal(t.requests().filter((r) => r.cmd === "submit" && r.actor === "maren").length, 1);
  assert.ok(runLines(t, "fallback").includes("ilsa passes on the action it was granted"));
  assert.deepEqual(t.table.grants.size, 0);
  assert.ok(dm.briefings.some((b) => b.wake === "narrate" && /maren/.test(b.briefing)));
});

test("a scene change asks every agent for a summary, and each starts the next scene from it", async () => {
  const { t, report, players, dm } = await play({
    seed: 27,
    seat: seatThen([{ kind: "text", text: "We go down to the cellar." }]),
    players: { maren: {}, ilsa: {} },
    dm: {
      table_turn: async (tools) => void (await tools.loadScene("m5_s5_cellar", ["bren", "maren", "ilsa"])),
      summary: async () => "The party left the yard for the cellar.",
    },
  });
  assert.deepEqual(report.scenes, ["m5_s3_yard", "m5_s5_cellar"]);
  for (const handle of ["maren", "ilsa"]) assert.deepEqual(players.get(handle)!.scenes, [`${handle} remembers the scene.`]);
  assert.ok(dm.briefings.some((b) => b.wake === "summary"));
  assert.ok(dm.briefings.filter((b) => b.wake === "scene_open").length === 2);
  assert.ok(t.table.transcript.records.some((r) => r.channel === "notes:maren" && r.text === "summary: maren remembers the scene."));
  assert.ok(t.table.transcript.records.some((r) => r.channel === "memory:dm" && r.text === "summary: The party left the yard for the cellar."));
});

test("the run can stop before a scene: the exit run plays one scene at a time", async () => {
  const { report, players } = await play({
    seed: 27,
    seat: new ScriptedSeat("bren", [{ kind: "text", text: "On to the cellar." }]),
    players: { maren: {} },
    dm: { table_turn: async (tools) => void (await tools.loadScene("m5_s5_cellar", ["bren", "maren"])) },
    onScene: (scene) => (scene === "m5_s5_cellar" ? "stop" : "continue"),
  });
  assert.equal(report.ended, "the run stops before m5_s5_cellar");
  assert.deepEqual(report.scenes, ["m5_s3_yard"]);
  assert.deepEqual(players.get("maren")!.scenes, [], "no summaries for a scene that isn't played");
});

test("a scene between two played ones is passed over: the party goes on to the next, and the DM hears so", async () => {
  const pack = path.join(REPO, "scenarios/the_silent_mill");
  const scenes = readPack(pack).adventure.scenes;
  const plan = scenePlan(pack, ["s1_village_green", "s3_mill_yard"]);
  const party = ["bren", "torva", "maren", "ilsa"];
  const { t, report, dm, players, seat } = await play({
    seed: 5,
    pack,
    guards: (engine) => guards(pack, engine),
    scene: plan.first,
    onScene: plan.onScene,
    dm: walkOnDm(scenes.map((s) => s.id), { s3_mill_yard: "yard_fight" }, party),
  });
  assert.equal(report.ended, "the adventure is over");
  assert.deepEqual(report.scenes, ["s1_village_green", "s3_mill_yard"]);
  assert.deepEqual(report.passedOver, ["s2_mill_road"]);
  const opened = dm.briefings.filter((b) => b.wake === "scene_open").map((b) => b.briefing);
  assert.equal(opened.length, 2);
  assert.doesNotMatch(opened[0], /passes over/);
  assert.match(opened[1], /This run passes over s2_mill_road/);
  // Scene 1 is summed up once, when Scene 3 opens; Scene 2 is never summed up.
  for (const handle of ["torva", "maren", "ilsa"]) assert.equal(players.get(handle)!.scenes.length, 1, handle);
  assert.equal(dm.briefings.filter((b) => b.wake === "summary").length, 1);
  assert.ok(seat.shown.some((e) => e.kind === "info" && e.title === "Passed over"));
  // The whole party is carried into the yard and fights there.
  // Scene 2 never loads: Scene 3 loads in its place, with the party the DM named.
  const loads = t.requests().filter((r) => r.cmd === "load_scene").map((r) => [r.scene_id, r.party]);
  assert.deepEqual(loads, [["s1_village_green", undefined], ["s3_mill_yard", party]]);
  assert.ok(t.table.transcript.records.some((r) => r.text.startsWith("Combat is over")));
  for (const handle of party) assert.ok(t.requests().some((r) => r.cmd === "submit" && r.actor === handle), `${handle} acted in the fight`);
});

test("the scene plan plays the listed scenes in order, passes over the ones between, and stops after", () => {
  const pack = path.join(REPO, "scenarios/the_silent_mill");
  const plan = scenePlan(pack, ["s1_village_green", "s3_mill_yard"]);
  assert.equal(plan.first, "s1_village_green");
  assert.equal(plan.onScene("s1_village_green", []), "continue");
  assert.deepEqual(plan.onScene("s2_mill_road", ["s1_village_green"]), { skipTo: "s3_mill_yard" });
  assert.equal(plan.onScene("s3_mill_yard", ["s1_village_green"]), "continue");
  assert.equal(plan.onScene("s2_mill_road", ["s1_village_green", "s3_mill_yard"]), "stop", "nothing listed is left to play");
  assert.equal(plan.onScene("s4_captured_goblin", ["s1_village_green"]), "stop");
  // An id the pack doesn't have passes nothing over: it loads as asked, and the engine refuses it.
  assert.equal(plan.onScene("s2_mill_raod", ["s1_village_green"]), "stop");
  // Only a scene on the way forward is passed over, not one before the furthest scene played.
  const later = scenePlan(pack, ["s3_mill_yard", "s5_mill_cellar"]);
  assert.deepEqual(later.onScene("s4_captured_goblin", ["s3_mill_yard"]), { skipTo: "s5_mill_cellar" });
  assert.equal(later.onScene("s2_mill_road", ["s3_mill_yard"]), "stop");
  assert.equal(later.onScene("s1_village_green", []), "stop");
  assert.throws(() => scenePlan(pack, ["s3_mill_yard", "s1_village_green"]), /in the pack's order/);
  assert.throws(() => scenePlan(pack, ["s9_nowhere"]), /has no scene s9_nowhere/);
  assert.throws(() => scenePlan(pack, []), /no scene to play/);
});
