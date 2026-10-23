// The seat configuration of M6 spec §3.2, checked without calling a model.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { agentEnv, reply, seatTool, sessionOptions } from "../src/agents/sdk-session.ts";
import { apiEquivalentUsd, percentile, summarize, type UsageRecord } from "../src/usage.ts";

const narrate = seatTool("narrate", "Say this to the table.", { text: z.string() }, async () => reply("said"));

test("a seat gets no built-in tool, no setting source and only its own MCP tools", () => {
  const options = sessionOptions(
    { agent: "maren", choice: { model: "claude-sonnet-5-5", effort: "low" }, systemPrompt: "p", tools: [narrate] },
    "/empty",
  );
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.settingSources, []);
  assert.deepEqual(options.allowedTools, ["mcp__table__narrate"]);
  assert.deepEqual(options.skills, []);
  assert.deepEqual(options.plugins, []);
  assert.equal(options.permissionMode, "dontAsk");
  assert.equal(options.persistSession, false);
  assert.equal(options.systemPrompt, "p");
  assert.equal(options.cwd, "/empty");
});

test("only a seat with skills of its own gets the Skill tool", () => {
  const options = sessionOptions(
    {
      agent: "dm",
      choice: { model: "claude-opus-5-5", effort: "low" },
      systemPrompt: "p",
      tools: [narrate],
      plugins: ["/pack/dm-craft"],
      skills: ["dm-craft:narration"],
    },
    "/empty",
  );
  assert.deepEqual(options.tools, ["Skill"]);
  assert.deepEqual(options.allowedTools, ["mcp__table__narrate", "Skill"]);
  assert.deepEqual(options.skills, ["dm-craft:narration"]);
});

test("an agent's process inherits no Claude or Anthropic variable", () => {
  const env = agentEnv({
    PATH: "/bin",
    HOME: "/Users/stas",
    ANTHROPIC_API_KEY: "sk-ant-secret",
    ANTHROPIC_BASE_URL: "https://elsewhere",
    CLAUDE_CODE_SESSION_ID: "parent",
    CLAUDECODE: "1",
    HTTPS_PROXY: "http://proxy",
  });
  assert.deepEqual(env, {
    PATH: "/bin",
    HOME: "/Users/stas",
    HTTPS_PROXY: "http://proxy",
    CLAUDE_AGENT_SDK_CLIENT_APP: "nat20-table/0.1.0",
  });
});

test("usage sums tokens and prices them at the API list price", () => {
  // Opus 5.5: $4 in, $20 out, $0.20 cached read; cache writes at 1.25x input.
  assert.equal(apiEquivalentUsd("claude-opus-5-5", { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 }), 4);
  assert.equal(apiEquivalentUsd("claude-opus-5-5", { input: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000 }), 25.2);
  assert.equal(apiEquivalentUsd("some-other-model", { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 }), 0);
  assert.equal(percentile([5, 1, 4, 2, 3], 50), 3);
  assert.equal(percentile([5, 1, 4, 2, 3], 95), 5);
  const record = (agent: string, wall_ms: number): UsageRecord => ({
    agent, model: "m", effort: "low", purpose: "t", session_turn: 1, input_tokens: 10, cache_read_tokens: 0,
    cache_write_tokens: 0, output_tokens: 1, api_calls: 1, wall_ms, ttft_ms: null, api_equivalent_usd: 0.5, tools: [], at: "",
  });
  const [dm] = summarize([record("dm", 100), record("dm", 300), record("maren", 50)]);
  assert.deepEqual(dm, {
    agent: "dm", turns: 2, p50_ms: 100, p95_ms: 300, input_tokens: 20, cache_read_tokens: 0,
    cache_write_tokens: 0, output_tokens: 2, api_equivalent_usd: 1,
  });
});
