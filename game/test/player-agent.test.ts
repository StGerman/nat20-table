// The AI player on the Agent SDK (M6 step 9, TASKS.md AGT-5, AGT-6, AGT-21, CHR-5), checked without
// a model (spec §8): a stand-in session calls the player's tools the way a model would, against a
// real seeded engine and the real loop. Needs `cargo build -p nat20-api-server`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { declaration, ModelPlayer, PLAYER_LONG_WAKE_TIMEOUT_MS, PLAYER_TURN_TIMEOUT_MS, playerPrompt, promptCard, rulesPrimer } from "../src/agents/player.ts";
import { dmPrompt } from "../src/agents/dm.ts";
import { readPack } from "../src/pack/read.ts";
import { sessionOptions } from "../src/agents/sdk-session.ts";
import { REPO } from "../src/engine.ts";
import { TurnCancelled, TurnTimeout } from "../src/errors.ts";
import { addressLines, castParty, talkLines } from "../src/play/run.ts";
import { packIds } from "../src/table/guards.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm, ScriptedSeat } from "../src/table/scripted.ts";
import { HandTools, PlayerTools } from "../src/table/tools.ts";
import type { PlayerWake } from "../src/table/types.ts";
import { testTable } from "./helpers.ts";
import { StandIn, type Script as PlayerScript } from "./stand-in.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");
const CHOICE = { model: "claude-sonnet-5-5", effort: "low" } as const;

type Script = PlayerScript<PlayerWake>;

/** A model player whose sessions are stand-ins playing `script`; `sessions` lists them as they open. */
function standInPlayer(handle: string, script: Script): { player: ModelPlayer; sessions: StandIn<PlayerWake>[] } {
  const sessions: StandIn<PlayerWake>[] = [];
  const party = castParty(MILL);
  const player = new ModelPlayer({
    handle,
    card: party.cards.get(handle)!,
    characterClass: party.classes.get(handle)!,
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

test("a player's combat turns and granted actions get the long limit; a set limit applies to every wake", () => {
  const card = castParty(MILL).cards.get("torva")!;
  const config = new ModelPlayer({ handle: "torva", card, characterClass: "barbarian", choice: CHOICE }).sessionConfig();
  assert.equal(config.turnTimeoutMs, PLAYER_TURN_TIMEOUT_MS);
  assert.deepEqual(config.turnTimeoutsMs, { combat_turn: PLAYER_LONG_WAKE_TIMEOUT_MS, granted: PLAYER_LONG_WAKE_TIMEOUT_MS });
  const flat = new ModelPlayer({ handle: "torva", card, characterClass: "barbarian", choice: CHOICE, turnTimeoutMs: 5_000 }).sessionConfig();
  assert.equal(flat.turnTimeoutMs, 5_000);
  assert.equal(flat.turnTimeoutsMs, undefined);
});

test("a model player's session has its own prompt with its card, its nine seat tools and nothing built in", () => {
  const { player } = standInPlayer("maren", async () => "");
  const card = castParty(MILL).cards.get("maren")!;
  assert.equal(player.systemPrompt, playerPrompt("maren", card, "cleric"));
  assert.ok(player.systemPrompt.includes(promptCard(card)), "the card is in the prompt as written, but for its Russian voice");
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

test("a model player passes as a normal answer, plays from its card's Talk and silence, and may speak on its own combat turn", () => {
  const card = castParty(MILL).cards.get("maren")!;
  assert.match(card, /## Talk and silence\n\n- Speaks when/);
  const prompt = playerPrompt("maren", card, "cleric");
  assert.match(prompt, /If not, just PASS: that is a normal answer/);
  assert.match(prompt, /your card's "Talk and silence" and "With the party", and your notes/);
  assert.match(prompt, /Don't repeat what someone else already said/);
  assert.match(prompt, /usually one call: submit_decision with the option .*, a line in say if Maren would speak, and end_turn: true/);
  assert.match(prompt, /The line reacts to what happened since your last turn/);
  assert.match(prompt, /"Do you raise your hand\?": .*Call no tool: your final answer starts with SPEAK \(a line to say\), BOTH \(a line and a deed\), ACT: and one sentence/);
  assert.match(prompt, /"You have the floor": you raised your hand, someone named Maren, or a companion spoke to Maren\./);
  // Addressing a companion (party talk §4.4): whom and how from the card and bond notes, never sheets.
  assert.match(prompt, /give their handle as to; a line for the whole party needs no to\. Choose whom and how from your card's "With the party" and your bond notes, never from anyone's sheet\./);
  assert.match(prompt, /Out of combat the one you speak to has the floor next/);
  assert.doesNotMatch(prompt, /Set asks|request or a proposal that wants/);
  assert.match(prompt, /The human's character answers when its player likes; nobody waits for it\./);
  // A reaction between turns in a fight (party talk §5 R1): one line or PASS, say only, first line heard.
  assert.match(prompt, /"Something just happened in the fight": it isn't your turn, and the fight goes on without waiting\./);
  assert.match(prompt, /Only the first companion to speak is heard, so a line that comes too late reaches nobody\./);
});

test("every party member has its names, whichever seat plays it: handle, card name and the pack's forms", () => {
  const { names } = castParty(MILL);
  assert.deepEqual(names.get("torva"), ["torva", "Torva", "Торва", "Торвы", "Торве", "Торву", "Торвой"]);
  assert.deepEqual(names.get("maren"), ["maren", "Maren", "Марен", "Мэрен", "Марена", "Марене", "Марену", "Мареной"]);
  // The human wrote «Ильза» in the Russian party-talk run of 2026-10-27 (AGT-38): both spellings count.
  for (const form of ["Ильса", "Ильза", "Ильзе", "Ильзой"]) assert.ok(names.get("ilsa")!.includes(form), form);
  assert.ok(names.get("bren")!.includes("Брену"), "the human's character too, for a run where an AI plays it");
});

test("a model player answers a hand wake with its answer as written, and its tools wait for the floor", async () => {
  const { player } = standInPlayer("ilsa", async (wake, call) => {
    if (wake !== "hand") return "PASS";
    assert.deepEqual(await call("say", { text: "Me first!" }), { text: "not now: wait for the floor: answer SPEAK, BOTH, ACT: <what you do> or PASS", isError: true });
    assert.equal((await call("look")).isError, false, "it may still look");
    return "ACT: Ilsa writes the name down.\nit may matter";
  });
  const t = await testTable({ seed: 1, players: ["ilsa"] });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    assert.equal(await player.wake("hand", "Do you raise your hand?", new HandTools("ilsa", t.table)), "ACT: Ilsa writes the name down.\nit may matter");
    assert.ok(!t.table.transcript.records.some((r) => r.kind === "speech"), "nothing was said");
  } finally {
    t.close();
  }
});

test("a model player speaks to a companion with to; the table marks the line and keeps the address", async () => {
  const { player } = standInPlayer("ilsa", async (wake, call) => {
    assert.equal(wake, "declare");
    assert.equal((await call("say", { text: "Torva, the door?", to: "torva" })).isError, false);
    assert.equal((await call("say", { text: "Bren, look.", to: "bren" })).isError, false);
    return "PASS";
  });
  const t = await testTable({ seed: 1, players: ["ilsa", "torva"] });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    await player.wake("declare", "You have the floor.", new PlayerTools("ilsa", t.table));
    assert.deepEqual(t.table.takeAddresses(), [
      { from: "ilsa", to: "torva" },
      { from: "ilsa", to: "bren" },
    ]);
    assert.deepEqual(t.table.drainInbox("torva"), ["ilsa says to you: Torva, the door?", "ilsa says to bren: Bren, look."]);
    assert.ok((t.table.seat as ScriptedSeat).shown.some((e) => e.kind === "speech" && e.to === "bren"), "the human sees the line spoken to their character");
  } finally {
    t.close();
  }
});

test("the report counts the lines spoken to a companion, by who spoke to whom", () => {
  const line = (speaker: string, to?: string) => ({ at: "t", speaker, channel: "table" as const, kind: "speech" as const, text: "…", rolls: [], log_head: 0, ...(to ? { to } : {}) });
  assert.deepEqual(addressLines([line("torva")]), []);
  assert.deepEqual(addressLines([line("torva", "ilsa"), line("ilsa", "torva"), line("torva", "ilsa"), line("maren")]), [
    "- Lines spoken to a companion: 3 of 4 AI lines (torva to ilsa 2, ilsa to torva 1)",
  ]);
});

test("the report counts talk rounds: lines, silence, hands, named players who answered, scenes left with someone waiting, and time", () => {
  const round = { named: [], hands: {}, floor_wakes: 0, lapsed: [], carried: [], spoke: [], declared: [], silent: [], wall_ms: 0 };
  assert.deepEqual(talkLines([]), []);
  assert.deepEqual(
    talkLines([
      { ...round, named: ["ilsa"], hands: { torva: "act", maren: "pass" }, floor_wakes: 1, spoke: ["ilsa"], declared: ["torva"], silent: ["maren"], first_line_ms: 4000, wall_ms: 6000 },
      { ...round, hands: { torva: "speak", maren: "both", ilsa: "pass" }, floor_wakes: 3, handed_to: "ilsa", carried: ["torva"], spoke: ["torva", "maren", "ilsa"], declared: ["maren"], silent: [], first_line_ms: 6000, wall_ms: 12000 },
      { ...round, hands: { torva: "pass", maren: "pass", ilsa: "unread" }, silent: ["torva", "maren", "ilsa"], wall_ms: 3000 },
    ], [
      { id: "s2_mill_road", started_at: "2026-10-30T18:50:00.000Z", ended_at: "2026-10-30T18:55:00.000Z", rounds: 0, left_waiting: ["torva"] },
      { id: "s3_mill_yard", started_at: "2026-10-30T18:55:00.000Z", rounds: 0 },
    ]),
    [
      "- Talk rounds: 3; lines per round 1.3; silent share 44% (target at least 30%); floor wakes 4 (p50 1, max 3 a round), hands lapsed 0 (must be 0)",
      "- Hands: speak 1, both 1, act 1, pass 4, unread 1; named players who answered first: 1 of 1; hand-offs 1, addresses carried to the next round 1, scene exits with someone waiting 1",
      "- Talk round time: first line p50 4000 ms (target 7000 ms), round p50 6000 ms, p95 12000 ms (target 20000 ms)",
    ],
  );
});

test("with --lang ru a model player speaks, declares, notes and summarises in Russian, and still passes with PASS", () => {
  const card = castParty(MILL).cards.get("maren")!;
  const english = playerPrompt("maren", card, "cleric");
  const russian = playerPrompt("maren", card, "cleric", "ru");
  assert.doesNotMatch(english, /Russian/);
  assert.ok(russian.startsWith(english), "the language rule is added at the end, after the same English prompt");
  assert.match(russian, /write in Russian everything you say, declare, note or summarise/);
  assert.match(russian, /just PASS, in Latin letters/);
  assert.equal(declaration("PASS"), undefined);
});

test("a Russian run gives every agent the party's Russian names, and the DM the NPCs' too (AGT-38)", () => {
  const party = castParty(MILL);
  assert.deepEqual(party.russianNames, ["bren: Брен", "torva: Торва", "maren: Марен", "ilsa: Ильза"]);
  const line = `Names in Russian: write each as given here, declined as Russian declines it: ${party.russianNames.join("; ")}.`;
  const card = party.cards.get("maren")!;
  const russian = playerPrompt("maren", card, "cleric", "ru", true, party.russianNames);
  assert.ok(russian.includes(line));
  // The NPCs are scenario data (Rule 3): a player never learns a name the table hasn't heard.
  for (const npc of ["Осрик", "Гритч", "Крапивного", "Снитт", "Венна"]) assert.ok(!russian.includes(npc), npc);
  assert.ok(!playerPrompt("maren", card, "cleric", "en", true, party.russianNames).includes("Names in Russian"), "an English prompt has no Russian names");
  const pack = readPack(MILL);
  const dm = dmPrompt(pack, "bren", party.ai, "prompt", "ru");
  assert.match(dm, /Names in Russian: write each as given here, declined as Russian declines it: bren: Брен; torva: Торва; maren: Марен; ilsa: Ильза; osric_hale: староста Осрик Хейл;/);
  assert.ok(!dmPrompt(pack, "bren", party.ai, "prompt", "en").includes("Names in Russian"));
});

test("a card's Voice in Russian reaches only a Russian prompt, after the rule to carry the voice by meaning", () => {
  const card = castParty(MILL).cards.get("maren")!;
  assert.match(card, /## Voice in Russian\n\n/);
  const english = playerPrompt("maren", card, "cleric");
  const russian = playerPrompt("maren", card, "cleric", "ru");
  assert.doesNotMatch(english, /Voice in Russian|[А-Яа-яЁё]/);
  assert.ok(russian.startsWith(english), "the Russian voice is added at the end, after the same English prompt");
  assert.match(russian, /never translate its catchphrases or forms of address word for word, and never leave them in English\./);
  assert.match(russian, /How your character sounds in Russian, from your card:\n\nГоворит как полковой капеллан/);
  assert.match(english, /## Voice\n\nA field chaplain's[^\n]*\n\n## Talk and silence/);
  // A card without the section still gets the rule, and no empty voice block.
  const torva = playerPrompt("torva", castParty(MILL).cards.get("torva")!, "barbarian", "ru");
  assert.match(torva, /never leave them in English\.$/);
});

test("with no human at the table, a player hears that only AI players play the others, Bren too (AGT-40)", () => {
  const all = castParty(MILL, "none");
  const card = all.cards.get("bren")!;
  const alone = playerPrompt("bren", card, "fighter", "en", false);
  assert.match(alone, /You play one character, Bren \(handle bren\), and only Bren\./);
  assert.match(alone, /Other AI players play the other characters\./);
  assert.match(alone, /out of combat, after the DM narrated, before anyone has the floor/);
  // Bren's card says a human may sit in Bren's seat; the table's rules say nothing of a human.
  assert.doesNotMatch(alone.replace(promptCard(card), ""), /human/);
  // With a human, the prompt is as it was.
  assert.match(playerPrompt("maren", all.cards.get("maren")!, "cleric"), /A human and other AI players play the other characters\./);
  assert.equal(new ModelPlayer({ handle: "bren", card, characterClass: "fighter", choice: CHOICE, withHuman: false }).systemPrompt, alone);
});

test("a player's read summaries last its session: emptied when the session closes (AGT-70)", async () => {
  const card = castParty(MILL).cards.get("maren")!;
  const player = new ModelPlayer({ handle: "maren", card, characterClass: "cleric", choice: CHOICE, withHuman: true });
  player.described.add("nat20_core::action.dodge");
  await player.close();
  assert.equal(player.described.size, 0, "the next session reads each summary again");
});

test("each party member's class comes from its pregen, for its block of the rules primer (AGT-52)", () => {
  assert.deepEqual(Object.fromEntries(castParty(MILL).classes), { bren: "fighter", torva: "barbarian", maren: "cleric", ilsa: "wizard" });
  const fighter = rulesPrimer("fighter");
  assert.match(fighter, /^## The rules you know\n/);
  assert.match(fighter, /\n\n## Your class: Fighter\n/);
  // What an action does comes with the option, from the engine (AGT-70): the primer only names them.
  assert.match(fighter, /\*\*Actions everyone has:\*\* Attack, Dash, Disengage, Dodge, Help/);
  assert.ok(!fighter.includes("a second Dash in the same turn"), "no copy of an option's summary");
  assert.throws(() => rulesPrimer("bard"), /no rules primer block for class "bard"/, "a class with no block stops the run before play");
  assert.throws(() => rulesPrimer("../fighter"), /no rules primer block for class "\.\.\/fighter"/, "a class is a bare name, never a path");
});

test("an AI seat with no pregen in the first scene has no class, and casting the party fails (AGT-52)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "no-class-"));
  try {
    const pack = path.join(root, "the_silent_mill");
    cpSync(MILL, pack, { recursive: true });
    const first = path.join(pack, "scenes/s1_village_green.json");
    const scene = JSON.parse(readFileSync(first, "utf8")) as { creatures: Array<{ handle: string; pregen?: string; monster?: string }> };
    const ilsa = scene.creatures.find((c) => c.handle === "ilsa")!;
    delete ilsa.pregen;
    ilsa.monster = "goblin_warrior";
    writeFileSync(first, JSON.stringify(scene));
    assert.throws(() => castParty(pack, "none"), /party ilsa has an AI seat and no pregen in the first scene, so no class/);
    assert.deepEqual([...castParty(pack, { play: "ilsa" }).classes.keys()], ["bren", "torva", "maren"], "the human's seat needs no class");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a player's prompt follows the table's four rules: at the table, the rules, the character, the team (AGT-52)", () => {
  const all = castParty(MILL, "none");
  const blocks = { bren: "Fighter", torva: "Barbarian", maren: "Cleric", ilsa: "Wizard" } as const;
  for (const [handle, block] of Object.entries(blocks)) {
    const card = all.cards.get(handle)!;
    for (const prompt of [playerPrompt(handle, card, all.classes.get(handle)!, "en", true), playerPrompt(handle, card, all.classes.get(handle)!, "ru", false)]) {
      const sections = ["## At the table", "## The rules you know", `## Your class: ${block}`, "## Your character", "## Play as a team", "## How this table works", "## Why you are woken", "## Speaking and notes"];
      const at = sections.map((heading) => prompt.indexOf(`\n${heading}\n`));
      assert.ok(at.every((i) => i > 0), `${handle}: every section is there`);
      assert.deepEqual([...at].sort((a, b) => a - b), at, `${handle}: the sections come in order`);
      for (const other of Object.values(blocks).filter((b) => b !== block)) assert.doesNotMatch(prompt, new RegExp(`## Your class: ${other}`), `${handle} gets only its own class block`);
      assert.doesNotMatch(prompt, /undefined/);
    }
  }
  const maren = playerPrompt("maren", all.cards.get("maren")!, "cleric", "en", false);
  // Role-play first; the party's decisions are noted as plans, followed, and summed up at a scene's end.
  assert.match(maren, /never throw Maren's life, or a companion's, away for a moment of drama/);
  // Personality first: a cold or selfish character goes along in its own way and for its own reasons (AGT-52).
  assert.match(maren, /Personality first, and the party still holds\./);
  assert.match(maren, /find Maren's own reason to stick with the party \(their own skin, a share, a debt, pride, a grudge against the foe\)/);
  assert.doesNotMatch(maren, /always matters|whatever Maren's temperament/);
  assert.match(maren, /write it down with note as a plan, and follow it later, also in a new scene\. If it goes against what Maren believes or would never do, Maren comes first: say so aloud/);
  assert.match(maren, /a decision the party made is a plan\./);
  assert.match(maren, /what happened, who you met, what the party decided, what you promised or suspect/);
  // A plan, a rest or a companion in danger is usually worth a raised hand; idle talk can still pass.
  assert.match(maren, /A plan, a rest or a companion in danger usually is, for Maren's own reasons\. If not, just PASS/);
  // A short check before a combat action replaces "Be quick".
  assert.match(maren, /Before you act in a fight, check three things/);
  assert.doesNotMatch(maren, /Be quick|Decide quickly/);
});

test("a player's prompt says nothing of what lies ahead: no scenario id, foe or count of fights (Rule 3, AGT-52)", () => {
  const all = castParty(MILL, "none");
  const { dmOnly, shown } = packIds(MILL);
  const adventure = JSON.parse(readFileSync(path.join(MILL, "adventure.json"), "utf8")) as { npcs: Array<{ id: string; name: string }> };
  const party = new Set(all.ai);
  const ids = [...dmOnly, ...[...shown].filter((id) => !party.has(id))];
  const names = [...adventure.npcs.flatMap((n) => [n.id, n.name.split(/[ ,]/)[0]]), "Goblin", "Wolf", "Rat", "Gritch"];
  for (const handle of all.ai) {
    const card = all.cards.get(handle)!;
    const rules = playerPrompt(handle, card, all.classes.get(handle)!, "en", false).replace(promptCard(card), "");
    for (const id of ids) assert.ok(!new RegExp(`\\b${id}\\b`).test(rules), `${handle}'s prompt names the pack's ${id}`);
    for (const name of names) assert.ok(!new RegExp(`\\b${name}\\b`, "i").test(rules), `${handle}'s prompt names ${name}`);
    assert.doesNotMatch(rules, /\b(one|two|three|four|five|six|\d+)\s+(more\s+)?(fights?|scenes?|encounters?|battles?)\b/i);
    // The audit's leak scan reads this prompt among the player's inputs; nothing in our text may look
    // like a creature's current Hit Points or an AC or DC number to it (shows_current_hp and
    // names_a_target_number in crates/nat20-duel/src/leak_scan.rs and nat20-api-server's leaks.rs).
    for (const line of rules.split("\n")) {
      assert.doesNotMatch(line, /\b(has|at|to|with)\s+\d+\s+(HP|hit\b)/i, `${handle}: reads as current Hit Points: ${line}`);
      assert.doesNotMatch(line, /\d\/\d+ (HP|Hit Points)/, `${handle}: reads as current Hit Points: ${line}`);
      assert.doesNotMatch(line, /(^|[^\p{L}\p{N}])(AC|DC) \d/u, `${handle}: reads as an AC or DC number: ${line}`);
    }
    assert.match(rules, /You don't know what lies ahead: not how many fights, places or foes the adventure holds\./);
  }
});

test("a declaration is its one line, and PASS or nothing is a pass", () => {
  assert.equal(declaration(' "Maren kneels by the tracks." '), "Maren kneels by the tracks.");
  assert.equal(declaration("PASS"), undefined);
  assert.equal(declaration("Pass. Maren waits."), undefined);
  assert.equal(declaration(""), undefined);
  assert.equal(declaration("Passing the well, Torva looks around."), "Passing the well, Torva looks around.");
  // The hand question's words and the model's own labels never reach the table (AGT-72, run 19-50-27).
  assert.equal(declaration("ACT: Марен остаётся у ворот рядом с Торвой."), "Марен остаётся у ворот рядом с Торвой.");
  assert.equal(declaration("BOTH: Ильза захлопывает книжку. «Идём, Торва.» ACT: Ильза становится в строй."), "Ильза захлопывает книжку. «Идём, Торва.» Ильза становится в строй.");
  assert.equal(declaration("SPEAK: Согласна.\n\nACT: Ильза спускается за Торвой."), "Согласна. Ильза спускается за Торвой.");
  assert.equal(declaration("SPEAK\nИльза: «Лампа моя.»"), "Ильза: «Лампа моя.»");
  assert.equal(declaration("SPEAK: Две строки.\n\nSentence on what Ilsa does: ACT: Ильза убирает блокнот."), "Две строки. Ильза убирает блокнот.");
  assert.equal(declaration("SPEAK: «Один вопрос.»\n\nIlsa's answer as the floor: BOTH: Ильза ждёт."), "«Один вопрос.» Ильза ждёт.");
  assert.equal(declaration("PASS"), undefined);
  // The delimiters and the bare word the hand parser accepts (floor.ts), and leading indentation.
  assert.equal(declaration("ACT — Ильза ждёт у двери."), "Ильза ждёт у двери.");
  assert.equal(declaration("  ACT: Ilsa waits."), "Ilsa waits.");
  assert.equal(declaration("**ACT**: Ilsa waits."), "Ilsa waits.");
  assert.equal(declaration("SPEAK"), undefined);
  // The parser reads the word in any case before a colon, and a quote opened before the word closes after the line.
  assert.equal(declaration("act: Ilsa waits."), "Ilsa waits.");
  assert.equal(declaration("Both: Ilsa waits."), "Ilsa waits.");
  assert.equal(declaration('"ACT: Ilsa waits."'), "Ilsa waits.");
  assert.equal(declaration('ACT: Ilsa says "wait".'), 'Ilsa says "wait".');
  assert.equal(declaration("Both sides back away. Ilsa waits."), "Both sides back away. Ilsa waits.");
  // An ordinary word that only starts like one is left alone.
  assert.equal(declaration("Actually, Torva acts first and bothers nobody."), "Actually, Torva acts first and bothers nobody.");
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
      // The session's first turn carries the seed, whether it is a turn or a reaction between turns.
      assert.match(sessions[0].turns[0].message, /^Your character sheet \(only you see it\):\n\{/);
      assert.match(turns[0].message, /Act with your tools: usually one submit_decision with end_turn: true\.$/);
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

test("one submit_decision takes the option, says the line and ends the turn; a refused one says nothing and keeps the turn (M10 S3)", async () => {
  const answers: Array<{ text: string; isError: boolean }> = [];
  const oneCall: Script = async (wake, call) => {
    if (wake === "reaction") await call("react", { choice: null });
    if (wake === "combat_turn" && answers.length === 0) {
      const options = (await call("legal_actions")).text;
      const id = /\b((?:melee|ranged)_attack\/\S+?):?\s/.exec(options)?.[1];
      const target = /\b((?:goblin|wolf)_\d+)\b/.exec(options)?.[1];
      answers.push(await call("submit_decision", { option_id: "no_such_option", say: "For the mill!", end_turn: true }));
      answers.push(await call("submit_decision", { option_id: id, targets: [target], say: "For the mill!", end_turn: true }));
    } else if (wake === "combat_turn") await call("end_turn");
    return "";
  };
  const party = ["torva", "maren", "ilsa"].map((h) => standInPlayer(h, oneCall));
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
    await new TableLoop({ table: t.table, dm, players: party.map((p) => p.player), maxSteps: 200 }).run("m5_s3_yard");
    const [refused, taken] = answers;
    assert.equal(refused.isError, true, refused.text);
    assert.doesNotMatch(refused.text, /said|turn ended/);
    assert.equal(taken.isError, false, taken.text);
    // Seed 27: the attack opens a reaction window, so the turn's end waits for the next wake.
    assert.match(taken.text, /\nsaid: .*\n(turn ended|the turn waits on a reaction; end it once you are woken again)$/s);
    const lines = t.table.transcript.records.filter((r) => r.kind === "speech" && r.text.includes("For the mill!"));
    assert.equal(lines.length, 1, "the line is said once, by the accepted call only");
  } finally {
    t.close();
  }
});

test("a new scene starts a new session from the sheet, the summaries and the newest notes", async () => {
  let pass = false;
  const { player, sessions } = standInPlayer("maren", async (wake, call) => {
    if (wake === "summary") return "We reached the mill. I promised Bren I would watch the gate.";
    if (pass) return "PASS";
    assert.deepEqual(await call("say", { text: "Easy. Let me look first." }), { text: "said", isError: false });
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
    assert.ok(records.some((r) => r.channel === "table" && r.speaker === "maren" && r.text === "Easy. Let me look first."));
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

test("a wake cancelled while its new session's sheet comes ends without a turn, and the next wake runs as usual", async () => {
  const { player, sessions } = standInPlayer("ilsa", async () => "PASS");
  const t = await testTable({ seed: 1, players: ["ilsa"] });
  try {
    t.table.observe(await t.engine.request("dm", { cmd: "load_scene", scene_id: "m5_s3_yard" }));
    let sheetCame!: () => void;
    const slow = new Promise<void>((go) => (sheetCame = go));
    class SlowSheet extends PlayerTools {
      override async sheet() {
        await slow;
        return super.sheet();
      }
    }
    const bark = player.wake("bark", "Something just happened in the fight.", new SlowSheet("ilsa", t.table));
    player.cancel();
    sheetCame();
    await assert.rejects(bark, TurnCancelled);
    assert.equal(sessions.length, 0, "no session opened, no turn sent");
    assert.equal(await player.wake("declare", "Declare.", new PlayerTools("ilsa", t.table)), undefined);
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].turns.map((turn) => turn.purpose), ["declare"]);
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
      ["--experimental-strip-types", "--no-warnings", cli, "--players", "scripted", "--seed", "23", "--no-audit", "--no-upload", "--out", out],
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
