// Agent SDK spike (Milestone 6 step 1, TASKS.md AGT-17). Run on Stas's Mac under his Claude login
// (decision 0036), never in CI or a cloud session: `npm run spike`.
//
// Plays, against the engine state in recorded.json (Maren's first prompt in the Milestone 5 yard
// fight), three player-agent turns for Maren and three DM narrations, each agent in one long-lived
// session configured as M6 spec §3.2 says. The first turn of each session is cold, the rest warm.
// Prints and writes a report: latency, tokens and API-equivalent cost per turn, the credential
// source (must be the subscription), and whether a skill loads from our own plugin folder while
// setting sources stay empty (D10).
//
// Flags: --dry-run (print the session options, call no model), --dm-model, --player-model,
// --dm-effort (default medium), --effort (the player's, default low), --turns N.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AgentSession, UsageLimitReached, reply, seatTool, sessionOptions, type SessionConfig } from "../src/agents/sdk-session.ts";
import { refuseApiKey, runFolder } from "../src/play/run.ts";
import { UsageLog, summarize } from "../src/usage.ts";
import { formatOptions, formatState, type LegalActionsResult } from "../src/view.ts";
import type { Event, State } from "@nat20-table/engine-client";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

const { values: flags } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "dm-model": { type: "string", default: "claude-opus-5-5" },
    "player-model": { type: "string", default: "claude-sonnet-5-5" },
    "dm-effort": { type: "string", default: "medium" },
    effort: { type: "string", default: "low" },
    turns: { type: "string", default: "3" },
  },
});
const effort = flags.effort as EffortLevel;
const turns = Number(flags.turns);

interface Recorded {
  player: string;
  awaiting: { prompt_id: string };
  player_state: { state: State };
  player_sheet: unknown;
  player_options: LegalActionsResult;
  player_events: { events: Event[] };
  dm_events: Event[];
}
const recorded = JSON.parse(readFileSync(path.join(here, "recorded.json"), "utf8")) as Recorded;

// --- The player seat: tools answer from the recording, as the orchestrator would from the engine.

let decided: string[] = [];
const playerTools = [
  seatTool("look", "What you perceive now: the round, places, creatures with distance and health.", {}, async () => reply(formatState(recorded.player_state.state))),
  seatTool("my_sheet", "Your own character sheet.", {}, async () => reply(JSON.stringify(recorded.player_sheet))),
  seatTool("legal_actions", "The options you can take now, with their targets.", {}, async () => reply(formatOptions(recorded.player_options))),
  seatTool(
    "submit_decision",
    "Take one option from legal_actions. Name targets by handle; give a variant when the option lists them.",
    { option_id: z.string(), targets: z.array(z.string()).optional(), variant: z.string().optional() },
    async (input) => {
      const option = recorded.player_options.options.find((o) => o.option_id === input.option_id);
      if (!option) {
        return reply(`unknown_option: ${input.option_id} is not offered now.`, true);
      }
      decided.push(`${input.option_id} ${JSON.stringify(input.targets ?? [])}`);
      return reply("accepted");
    },
  ),
  seatTool("end_turn", "End your turn.", {}, async () => {
    decided.push("end_turn");
    return reply("accepted");
  }),
];

const playerPrompt = [
  "You play Maren, a level 2 human cleric, in a D&D 5e (2024) game. You are one player at a table, not the game master.",
  "Card: steady, dry humour, keeps the party alive first; distrusts goblins but hates needless cruelty.",
  "The engine resolves every rule and roll. You only decide, through your tools: look, my_sheet, legal_actions, submit_decision, end_turn.",
  "On your turn: read the situation, take at most one action and any bonus action that helps, then call end_turn. Be quick: one short sentence of reasoning at most.",
].join("\n");

const playerTurn = [
  "Your turn (round 1). What happened since the fight began:",
  ...recorded.player_events.events.map((e) => `- ${e.text}`),
].join("\n");

// --- The DM seat: one narrate tool; the events are the DM projection of the first round.

const narrations: string[] = [];
const dmTools = [
  seatTool("narrate", "Say this to the table. Fiction only: no numbers, no DCs, no AC, no HP.", { text: z.string() }, async (input) => {
    narrations.push(input.text);
    return reply("said");
  }),
];

const dmPrompt = [
  "You are the Dungeon Master of The Silent Mill, a short D&D 5e (2024) one-shot. The engine resolves every rule and roll; you never decide an outcome.",
  "Scene 3, the mill yard: four goblin warriors by the woodpile and the mill door, three wolves loose in the yard; the party came in through the gate.",
  "When you get engine events, narrate them in one to three vivid sentences with the narrate tool. Never state a number, a DC, an AC or Hit Points; say only what the table would see and hear.",
  "Before your first narration, load your dm-craft skill once.",
].join("\n");

function chunk(events: Event[], parts: number): Event[][] {
  const size = Math.ceil(events.length / parts);
  return Array.from({ length: parts }, (_, i) => events.slice(i * size, (i + 1) * size));
}
const dmBatches = chunk(recorded.dm_events, turns).map((batch) =>
  ["New engine events:", ...batch.map((e) => `- ${e.text}`)].join("\n"),
);

// --- D10: a skill in our own plugin folder, for the DM session only.

const skillPlugin = path.join(here, "dm-craft-plugin");

// A dry run writes nothing. A live run refuses an API key before it makes its run folder, and makes
// the folder before anything is written into it.
if (!flags["dry-run"]) refuseApiKey();
const runDir = flags["dry-run"] ? undefined : runFolder(path.join(repo, "runs"), "spike");
const usage = new UsageLog(runDir && path.join(runDir, "usage.jsonl"));

const player: SessionConfig = {
  agent: recorded.player,
  choice: { model: flags["player-model"]!, effort },
  systemPrompt: playerPrompt,
  tools: playerTools,
  usage,
  turnTimeoutMs: 60_000,
};
const dm: SessionConfig = {
  agent: "dm",
  choice: { model: flags["dm-model"]!, effort: flags["dm-effort"] as EffortLevel },
  systemPrompt: dmPrompt,
  tools: dmTools,
  plugins: [skillPlugin],
  skills: ["nat20-dm-craft-spike:dm-craft"],
  usage,
  turnTimeoutMs: 60_000,
};

// A dry run has no run folder.
if (!runDir) {
  for (const config of [player, dm]) {
    const { mcpServers, ...options } = sessionOptions(config, "<empty temp dir>");
    console.log(config.agent, JSON.stringify({ ...options, mcpServers: Object.keys(mcpServers ?? {}) }, null, 2));
  }
  process.exit(0);
}

const report: string[] = [`# Agent SDK spike, ${new Date().toISOString()}`, ""];
let stoppedAtLimit: string | undefined;

async function play(config: SessionConfig, messages: string[]): Promise<AgentSession> {
  const session = new AgentSession(config);
  try {
    for (const [i, message] of messages.entries()) {
      decided = [];
      const result = await session.turn(message, i === 0 ? "spike/cold" : "spike/warm");
      const u = result.usage;
      console.log(
        `${config.agent} turn ${i + 1}: ${u.wall_ms} ms, in ${u.input_tokens} + cache read ${u.cache_read_tokens} + cache write ${u.cache_write_tokens}, out ${u.output_tokens}, tools ${u.tools.join(" ") || "none"}${decided.length ? `, decided ${decided.join("; ")}` : ""}`,
      );
    }
  } catch (error) {
    if (!(error instanceof UsageLimitReached)) throw error;
    stoppedAtLimit = error.message;
  }
  await session.close();
  return session;
}

const playerSession = await play(player, Array.from({ length: turns }, () => playerTurn));
const dmSession = stoppedAtLimit ? undefined : await play(dm, dmBatches);

const init = playerSession.init;
report.push(
  `- Credential source: \`${init?.apiKeySource ?? "unknown"}\` (must be \`none\`, the subscription login)`,
  `- Claude Code version: ${init?.claude_code_version ?? "unknown"}`,
  `- Player session tools: ${init?.tools.join(", ") || "none"}`,
  `- DM session tools: ${dmSession?.init?.tools.join(", ") || "none"}`,
  `- DM session skills (D10, from ${path.relative(repo, skillPlugin)}): ${dmSession?.init?.skills.join(", ") || "none"}; plugins: ${dmSession?.init?.plugins.map((p) => p.name).join(", ") || "none"}; plugin errors: ${dmSession?.init?.plugin_errors?.map((e) => e.message).join("; ") || "none"}`,
  `- Player session skills: ${init?.skills.join(", ") || "none"}`,
  stoppedAtLimit ? `- **Stopped at the plan's usage limit:** ${stoppedAtLimit}` : "- Usage limit: not reached",
  "",
  "| Agent | Model | Turn | Wall ms | TTFT ms | Input | Cache read | Cache write | Output | API calls | API-equivalent $ | Tools |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...usage.records.map(
    (r) =>
      `| ${r.agent} | ${r.model} | ${r.session_turn} (${r.purpose.replace("spike/", "")}${r.outcome === "ok" ? "" : `, ${r.outcome}`}) | ${r.wall_ms} | ${r.ttft_ms ?? ""} | ${r.input_tokens} | ${r.cache_read_tokens} | ${r.cache_write_tokens} | ${r.output_tokens} | ${r.api_calls} | ${r.api_equivalent_usd} | ${r.tools.join(" ")} |`,
  ),
  "",
  "| Agent | Turns | p50 ms | p95 ms | Target p95 | API-equivalent $ |",
  "|---|---|---|---|---|---|",
  ...summarize(usage.records).map(
    (s) => `| ${s.agent} | ${s.turns} | ${s.p50_ms} | ${s.p95_ms} | ${s.agent === "dm" ? "6000" : "10000"} | ${s.api_equivalent_usd} |`,
  ),
  "",
  "DM narrations:",
  ...narrations.map((n) => `> ${n}`),
);
writeFileSync(path.join(runDir, "report.md"), report.join("\n") + "\n");
console.log("\n" + report.join("\n"));
console.log(`\nWritten to ${path.relative(repo, runDir)}/ (report.md, usage.jsonl). Paste report.md into the thread.`);
