// The seat configuration of M6 spec §3.2 and each turn's usage record, checked without calling a model.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { agentEnv } from "../src/agents/env.ts";
import { AgentSession, reply, seatTool, sessionOptions, TurnTimeout, UsageLimitReached, type SessionConfig } from "../src/agents/sdk-session.ts";
import { apiEquivalentUsd, percentile, phases, summarize, UsageLog, type UsageRecord } from "../src/usage.ts";

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

test("a usage log makes its run folder when there is none yet", () => {
  // `npm run spike` crashed with ENOENT here: its usage log was opened before its run folder existed.
  const dir = mkdtempSync(path.join(tmpdir(), "usage-log-"));
  try {
    const file = path.join(dir, "runs", "spike-1", "usage.jsonl");
    const usage = new UsageLog(file);
    assert.equal(readFileSync(file, "utf8"), "");
    usage.add({
      agent: "dm", model: "m", effort: "low", purpose: "t", session_turn: 1, outcome: "ok", input_tokens: 1, cache_read_tokens: 0,
      cache_write_tokens: 0, output_tokens: 1, api_calls: 1, wall_ms: 1, ttft_ms: null, api_equivalent_usd: 0, tools: [], at: "",
    });
    assert.equal(readFileSync(file, "utf8").split("\n").filter(Boolean).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("a purpose with its own limit times out at that limit, not the session's", async () => {
  const usage = new UsageLog();
  const s = new AgentSession({
    agent: "dm",
    choice: { model: "claude-sonnet-5-5", effort: "low" },
    systemPrompt: "p",
    tools: [],
    cwd: "/empty",
    usage,
    query: scripted(() => [call("a1", 40, 2)]),
    turnTimeoutMs: 60_000,
    turnTimeoutsMs: { narrate: 300 },
  });
  await assert.rejects(s.turn("go", "narrate"), (e: Error) => e instanceof TurnTimeout && /after 300 ms/.test(e.message));
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

test("a turn records each API call's start, end and tools, and the time spent in tools (M10 S1)", async () => {
  const usage = new UsageLog();
  const slow = seatTool("look", "l", {}, async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return reply("ok");
  });
  let s: AgentSession;
  const query = (({ prompt }: { prompt: AsyncIterable<SDKUserMessage> }) => {
    async function* run(): AsyncGenerator<SDKMessage> {
      for await (const message of prompt) {
        yield { ...call("a1", 10, 2), message: { ...call("a1", 10, 2).message, content: [{ type: "tool_use", name: "mcp__table__look" }] } } as never;
        await s.tools[0].handler({}, {} as never);
        yield call("a2", 12, 3) as never;
        yield { type: "result", subtype: "success", is_error: false, result: "done", ttft_ms: 7, user_message_uuid: message.uuid } as never;
      }
    }
    return Object.assign(run(), { interrupt: async () => undefined });
  }) as never;
  s = new AgentSession({ agent: "dm", choice: { model: "claude-sonnet-5-5", effort: "low" }, systemPrompt: "p", tools: [slow], cwd: "/empty", usage, query });
  await s.turn("go", "narrate");
  const [record] = usage.records;
  assert.equal(record.calls?.length, 2);
  const [first, closing] = record.calls!;
  assert.deepEqual([first.n, first.tools, first.first_token_ms], [1, ["look"], 7]);
  assert.deepEqual([closing.n, closing.tools, closing.first_token_ms], [2, [], undefined]);
  assert.ok(first.tool_ms >= 35, `${first.tool_ms} ms in the tool`);
  assert.equal(record.tool_ms, first.tool_ms);
  assert.ok(closing.started_ms >= first.ended_ms + 35, "the closing call starts once the tool answered");
  assert.ok(closing.ended_ms >= closing.started_ms);
  await s.close();
});

test("the phase summary splits each agent's wakes into first call, tool time and closing call", () => {
  const base = { agent: "dm", model: "m", effort: "low", purpose: "narrate", session_turn: 1, outcome: "ok" as const, input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, api_calls: 2, wall_ms: 0, ttft_ms: null, api_equivalent_usd: 0, tools: [], at: "" };
  const wake = (first: number, tool: number, closing: number) => ({
    ...base,
    tool_ms: tool,
    calls: [
      { n: 1, started_ms: 0, ended_ms: first, tools: ["narrate"], tool_ms: tool },
      { n: 2, started_ms: first + tool, ended_ms: first + tool + closing, tools: [], tool_ms: 0 },
    ],
  });
  const [row] = phases([wake(3000, 10, 2500), wake(4000, 20, 3500), { ...base, purpose: "old" }]);
  assert.deepEqual(row, { agent: "dm", purpose: "narrate", wakes: 2, first_call: [3000, 4000], tool: [10, 20], calls: [2, 2], closing: [2500, 3500], closings: 2 });
  assert.equal(phases([{ ...base }]).length, 0, "a record without calls (an old run) has no phases");
});
