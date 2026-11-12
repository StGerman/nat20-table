// Langfuse tracing (AGT-16): what a session hands the tracer, the spans the tracer makes of it, and
// where the keys come from. No network: the spans go to an in-memory exporter.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { AgentSession, reply, seatTool, setTurnTracer } from "../src/agents/sdk-session.ts";
import { halfSetInShell, langfuseEnv, langfuseTracer, type TracedTurn } from "../src/tracing.ts";
import { tagsOfRun } from "../src/play/record.ts";
import { UsageLog } from "../src/usage.ts";

const narrate = seatTool("narrate", "Say this to the table.", { text: z.string() }, async ({ text }) => reply(text === "bad" ? "refused" : "said", text === "bad"));

/** A stand-in model: one call that narrates twice (once refused), then a closing call with text. */
function oneTurn(tools: () => AgentSession) {
  return (({ prompt }: { prompt: AsyncIterable<SDKUserMessage> }) => {
    async function* run(): AsyncGenerator<SDKMessage> {
      for await (const message of prompt) {
        const asking = [{ type: "tool_use", name: "mcp__table__narrate", input: { text: "hi" } }];
        yield { type: "assistant", parent_tool_use_id: null, message: { id: "a1", model: "claude-sonnet-5-5", usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50 }, content: asking } } as never;
        await tools().tools[0]!.handler({ text: "hi" }, {} as never);
        await tools().tools[0]!.handler({ text: "bad" }, {} as never);
        yield { type: "assistant", parent_tool_use_id: null, message: { id: "a2", model: "claude-sonnet-5-5", usage: { input_tokens: 20, output_tokens: 5 }, content: [{ type: "text", text: "Done." }] } } as never;
        yield { type: "result", subtype: "success", is_error: false, result: "Done.", ttft_ms: 7, user_message_uuid: message.uuid } as never;
      }
    }
    return Object.assign(run(), { interrupt: async () => undefined });
  }) as never;
}

test("a traced session hands the tracer each turn: role, seat, calls with tokens, tools with input and answer", async () => {
  const seen: TracedTurn[] = [];
  setTurnTracer({ turn: (t) => void seen.push(t), flush: async () => undefined });
  try {
    const usage = new UsageLog();
    let s: AgentSession;
    s = new AgentSession({ agent: "ilsa", role: "player", choice: { model: "claude-sonnet-5-5", effort: "low" }, systemPrompt: "sys", tools: [narrate], cwd: "/empty", usage, query: oneTurn(() => s) });
    await s.turn("first", "hand");
    await s.turn("second", "hand");
    await s.close();
    // The tracer hears a turn after its caller has the answer.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.length, 2);
    const [one, two] = seen as [TracedTurn, TracedTurn];
    assert.equal(one.role, "player");
    assert.equal(one.seat, "ilsa");
    assert.equal(one.systemPrompt, "sys", "the system prompt goes with the first turn");
    assert.equal(two.systemPrompt, undefined, "and with no other");
    assert.equal(one.message, "first");
    assert.equal(one.final, "Done.");
    assert.deepEqual(one.usage, usage.records[0], "the trace is built from the record just written");
    assert.deepEqual(one.calls.map((c) => [c.input, c.cacheRead, c.output]), [[100, 50, 10], [20, 0, 5]]);
    assert.ok(one.calls[0]!.usd > 0);
    assert.equal(one.calls[0]!.firstToken, one.started + 7);
    assert.deepEqual(one.tools.map((t) => [t.name, t.call, t.input, t.output, t.refused]), [["narrate", 0, { text: "hi" }, "said", false], ["narrate", 0, { text: "bad" }, "refused", true]]);
  } finally {
    setTurnTracer(undefined);
  }
});

test("the tracer makes one trace a turn: an agent named by role and purpose, a generation per call, a tool per call", async () => {
  const exporter = new InMemorySpanExporter();
  const tracer = await langfuseTracer({ sessionId: "full-2026-11-12T20-00-00-000Z", tags: ["cheap"] }, new LangfuseSpanProcessor({ exporter, exportMode: "immediate" }));
  const t0 = Date.parse("2026-11-12T20:00:00Z");
  tracer.turn({
    role: "player",
    seat: "ilsa",
    purpose: "narration check",
    message: "go",
    final: "Done.",
    started: t0,
    ended: t0 + 900,
    usage: { agent: "ilsa", model: "claude-sonnet-5-5", effort: "low", purpose: "narration check", session_turn: 2, outcome: "timeout", input_tokens: 120, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 15, api_calls: 2, wall_ms: 900, ttft_ms: null, api_equivalent_usd: 0.01, tools: ["narrate"], at: "" },
    calls: [
      { model: "claude-sonnet-5-5", started: t0, ended: t0 + 300, input: 100, cacheRead: 0, cacheWrite: 0, output: 10, usd: 0.008, content: [{ type: "tool_use" }] },
      { model: "claude-sonnet-5-5", started: t0 + 400, ended: t0 + 900, input: 20, cacheRead: 0, cacheWrite: 0, output: 5, usd: 0.002, content: [{ type: "text", text: "Done." }] },
    ],
    tools: [{ name: "narrate", call: 0, started: t0 + 300, ended: t0 + 400, input: { text: "hi" }, output: "refused", refused: true }],
  });
  await tracer.flush(1_000);
  const spans = exporter.getFinishedSpans();
  const byName = new Map(spans.map((s) => [s.name, s]));
  assert.deepEqual([...byName.keys()].sort(), ["claude-sonnet-5-5", "narrate", "player.narration_check"]);
  const root = byName.get("player.narration_check")!;
  assert.equal(new Set(spans.map((s) => s.spanContext().traceId)).size, 1, "one trace");
  for (const s of spans) if (s !== root) assert.equal(s.parentSpanContext?.spanId, root.spanContext().spanId, `${s.name} hangs off the agent`);
  assert.equal(root.attributes["langfuse.observation.type"], "agent");
  assert.equal(root.attributes["session.id"], "full-2026-11-12T20-00-00-000Z");
  assert.equal(root.attributes["langfuse.trace.name"], "player.narration_check");
  assert.equal(root.attributes["langfuse.observation.level"], "WARNING", "a turn that timed out is flagged");
  assert.match(String(root.attributes["langfuse.observation.metadata.seat"]), /ilsa/, "the seat is a value");
  const generations = spans.filter((s) => s.attributes["langfuse.observation.type"] === "generation");
  assert.equal(generations.length, 2);
  assert.equal(generations[0]!.startTime[0], t0 / 1000, "spans keep the turn's own times");
  assert.match(String(generations[0]!.attributes["langfuse.observation.cost_details"]), /0\.008/);
  assert.equal(byName.get("narrate")!.attributes["langfuse.observation.level"], "WARNING", "a refused tool call is flagged");
});

test("a flush waits for a turn a session has just handed over", async () => {
  const exporter = new InMemorySpanExporter();
  const tracer = await langfuseTracer({ sessionId: "s", tags: [] }, new LangfuseSpanProcessor({ exporter, exportMode: "immediate" }));
  const t0 = Date.parse("2026-11-12T20:00:00Z");
  const usage = { agent: "maren", model: "m", effort: "low", purpose: "turn", session_turn: 1, outcome: "ok", input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, api_calls: 0, wall_ms: 1, ttft_ms: null, api_equivalent_usd: 0, tools: [], at: "" } as const;
  // The session's own way of handing a turn over, right before the run's last flush.
  setImmediate(() => tracer.turn({ role: "player", seat: "maren", purpose: "turn", message: "go", final: "", started: t0, ended: t0 + 1, usage: { ...usage, tools: [] }, calls: [], tools: [] }));
  await tracer.flush(1_000);
  assert.deepEqual(exporter.getFinishedSpans().map((s) => s.name), ["player.turn"]);
});

test("the audit's traces carry the run's tags from run.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "run-tags-"));
  try {
    assert.deepEqual(tagsOfRun(dir), [], "no run.json, no tags");
    writeFileSync(path.join(dir, "run.json"), JSON.stringify({ profile: { name: "cheap", sha256: "x" }, settings: { pack: { value: "/a/scenarios/fair_in_wend", from: "flag" } }, roster: { name: "m12" } }));
    assert.deepEqual(tagsOfRun(dir), ["cheap", "fair_in_wend", "roster:m12"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the keys come from the shell, else from .env, and only the three Langfuse ones are taken", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "langfuse-env-"));
  try {
    const file = path.join(dir, ".env");
    writeFileSync(file, "LANGFUSE_PUBLIC_KEY=pk-file\nLANGFUSE_SECRET_KEY=sk-file\nLANGFUSE_BASE_URL=https://us.cloud.langfuse.com\nANTHROPIC_API_KEY=never\n");
    assert.deepEqual(langfuseEnv({}, file), { LANGFUSE_PUBLIC_KEY: "pk-file", LANGFUSE_SECRET_KEY: "sk-file", LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com" });
    assert.equal(langfuseEnv({ LANGFUSE_PUBLIC_KEY: "pk-shell" }, file), undefined, "the shell wins whole: never a shell key with the file's secret");
    assert.equal(langfuseEnv({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_BASE_URL: "u" }, file)?.LANGFUSE_PUBLIC_KEY, "pk");
    assert.equal(langfuseEnv({}, path.join(dir, "missing")), undefined, "no keys, no tracing");
    assert.equal(langfuseEnv({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" }, path.join(dir, "missing")), undefined, "all three or none");
    // A shell with the keys but the old LANGFUSE_HOST is named on stderr, never silently off.
    assert.deepEqual(halfSetInShell({ LANGFUSE_HOST: "h", LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" }), { set: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"], missing: ["LANGFUSE_BASE_URL"] });
    assert.equal(halfSetInShell({}), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
