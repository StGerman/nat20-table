// The seat configuration of M6 spec §3.2 and each turn's usage record, checked without calling a model.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { AgentSession, agentEnv, reply, seatTool, sessionOptions, TurnTimeout, UsageLimitReached, type SessionConfig } from "../src/agents/sdk-session.ts";
import { apiEquivalentUsd, percentile, summarize, UsageLog, type UsageRecord } from "../src/usage.ts";

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
    agent, model: "m", effort: "low", purpose: "t", session_turn: 1, outcome: "ok", input_tokens: 10, cache_read_tokens: 0,
    cache_write_tokens: 0, output_tokens: 1, api_calls: 1, wall_ms, ttft_ms: null, api_equivalent_usd: 0.5, tools: [], at: "",
  });
  const [dm] = summarize([record("dm", 100), record("dm", 300), record("maren", 50)]);
  assert.deepEqual(dm, {
    agent: "dm", turns: 2, p50_ms: 100, p95_ms: 300, input_tokens: 20, cache_read_tokens: 0,
    cache_write_tokens: 0, output_tokens: 2, api_equivalent_usd: 1,
  });
});

/** A stand-in for the SDK's `query`: answers each user message with `answer`'s messages. */
function scripted(answer: (message: SDKUserMessage) => object[]): NonNullable<SessionConfig["query"]> {
  return (({ prompt }: { prompt: AsyncIterable<SDKUserMessage> }) => {
    async function* run(): AsyncGenerator<SDKMessage> {
      for await (const message of prompt) for (const out of answer(message)) yield out as SDKMessage;
    }
    return Object.assign(run(), { interrupt: async () => undefined });
  }) as never;
}

/** One API response of the stand-in, with its token counts. */
const call = (id: string, input: number, output: number) => ({
  type: "assistant",
  parent_tool_use_id: null,
  message: { id, model: "claude-sonnet-5-5", usage: { input_tokens: input, output_tokens: output }, content: [] },
});

function session(answer: (message: SDKUserMessage) => object[], turnTimeoutMs?: number) {
  const usage = new UsageLog();
  const config: SessionConfig = {
    agent: "maren",
    choice: { model: "claude-sonnet-5-5", effort: "low" },
    systemPrompt: "p",
    tools: [],
    cwd: "/empty",
    usage,
    query: scripted(answer),
    ...(turnTimeoutMs ? { turnTimeoutMs } : {}),
  };
  return { session: new AgentSession(config), usage };
}

test("a turn that ends with its result is recorded as ok", async () => {
  const { session: s, usage } = session((m) => [
    call("a1", 100, 5),
    { type: "result", subtype: "success", is_error: false, result: "done", user_message_uuid: m.uuid },
  ]);
  const result = await s.turn("go", "combat_turn");
  assert.equal(result.usage.outcome, "ok");
  assert.deepEqual(
    usage.records.map((r) => [r.outcome, r.input_tokens, r.output_tokens, r.api_calls]),
    [["ok", 100, 5, 1]],
  );
  await s.close();
});

test("a turn stopped at the plan's limit is recorded with the tokens it spent", async () => {
  const { session: s, usage } = session(() => [call("a1", 100, 5), { type: "rate_limit_event", rate_limit_info: { status: "rejected" } }]);
  await assert.rejects(s.turn("go", "combat_turn"), UsageLimitReached);
  assert.deepEqual(
    usage.records.map((r) => [r.outcome, r.purpose, r.input_tokens, r.output_tokens, r.api_calls]),
    [["limit", "combat_turn", 100, 5, 1]],
  );
  await s.close();
});

test("a turn that times out is recorded with its time and the tokens it spent", async () => {
  // The stand-in answers at once and never ends the turn; the timeout leaves it room on a busy machine.
  const { session: s, usage } = session(() => [call("a1", 40, 2)], 300);
  await assert.rejects(s.turn("go", "combat_turn"), TurnTimeout);
  const [record] = usage.records;
  assert.deepEqual([record.outcome, record.input_tokens, record.api_calls], ["timeout", 40, 1]);
  assert.ok(record.wall_ms >= 300, `${record.wall_ms} ms`);
  await s.close();
});
