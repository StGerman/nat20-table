// Langfuse tracing of agent turns (TASKS.md AGT-16, design https://claude.ai/artifact/77VvhZkSJqdHkGr4b5FfFx).
// Off unless the three LANGFUSE_* variables are set, in the shell or in the repo's `.env`; then
// every turn an `AgentSession` records in `usage.jsonl` is also sent as one Langfuse trace: an
// agent observation, a generation per API call and a tool observation per table tool call. Only
// the run commands turn it on (`tracerFromEnv`), so tests never trace. Nothing reads traces back:
// `usage.jsonl`, the transcript and the report stay the run's record.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { REPO } from "./paths.ts";
import type { UsageRecord } from "./usage.ts";

/** Who a session is: the closed set a trace name carries. The seat's own name is a value, never a key. */
export type Role = "dm" | "player" | "judge" | "suggest";

/** One API call of a traced turn. Times are epoch milliseconds. */
export interface TracedCall {
  model: string;
  started: number;
  ended: number;
  /** Time of the first token, for the turn's first call when the SDK reports it. */
  firstToken?: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  usd: number;
  /** The call's content blocks as the API returned them: text and tool calls. */
  content: unknown[];
}

/** One table tool call of a traced turn. */
export interface TracedTool {
  name: string;
  /** The API call that asked for it, from 0. */
  call: number;
  started: number;
  ended: number;
  input: unknown;
  output: string;
  refused: boolean;
}

/** Everything a turn's trace is built from, gathered by `AgentSession` once the turn's record is written. */
export interface TracedTurn {
  role: Role | undefined;
  seat: string;
  purpose: string;
  /** The system prompt, on a session's first turn only. */
  systemPrompt?: string;
  message: string;
  /** The turn's final text: the result, or its last text block when it ended without one. */
  final: string;
  started: number;
  ended: number;
  usage: UsageRecord;
  calls: TracedCall[];
  tools: TracedTool[];
}

/** Where a session sends its turns; set once by a run command. */
export interface TurnTracer {
  turn(turn: TracedTurn): void;
  /** Sends what is still queued; never throws, never waits longer than `timeoutMs`. */
  flush(timeoutMs?: number): Promise<void>;
}

/** What groups a run's traces: the run id as Langfuse session, and short tags. */
export interface TraceRun {
  sessionId: string;
  tags: string[];
}

const KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;

/**
 * The three Langfuse variables, all from the shell if any is set there, else all from `.env` in the
 * repo root, so a key is never paired with another project's. Only these three are taken from the
 * file: nothing else in it reaches the process.
 */
export function langfuseEnv(env: NodeJS.ProcessEnv = process.env, file = path.join(REPO, ".env")): Record<(typeof KEYS)[number], string> | undefined {
  const shell = KEYS.some((key) => env[key]);
  const source = shell ? env : existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const values = KEYS.map((key) => source[key]);
  if (values.some((v) => !v)) return undefined;
  return Object.fromEntries(KEYS.map((key, i) => [key, values[i]!])) as Record<(typeof KEYS)[number], string>;
}

/** The Langfuse variables the shell sets when it sets some but not all three: the one way tracing goes off unasked. */
export function halfSetInShell(env: NodeJS.ProcessEnv = process.env): { set: string[]; missing: string[] } | undefined {
  const set = KEYS.filter((key) => env[key]);
  if (set.length === 0 || set.length === KEYS.length) return undefined;
  return { set, missing: KEYS.filter((key) => !env[key]) };
}

/**
 * A run command's tracer: Langfuse when the keys are there, otherwise none, and nothing is loaded.
 * A tracer that cannot start (a package not installed) is none, with one line on stderr: a run
 * never fails for its traces.
 */
export async function tracerFromEnv(run: TraceRun): Promise<TurnTracer | undefined> {
  try {
    // Inside the try: an unreadable or malformed `.env` turns tracing off, never the run.
    const keys = langfuseEnv();
    if (!keys) {
      const half = halfSetInShell();
      if (half) console.error(`tracing: off, the shell sets ${half.set.join(", ")} but not ${half.missing.join(", ")}, so .env is not read (all three come from one place)`);
      return undefined;
    }
    const { LangfuseSpanProcessor } = await import("@langfuse/otel");
    return await langfuseTracer(run, new LangfuseSpanProcessor({ publicKey: keys.LANGFUSE_PUBLIC_KEY, secretKey: keys.LANGFUSE_SECRET_KEY, baseUrl: keys.LANGFUSE_BASE_URL }));
  } catch (error) {
    console.error(`tracing: off, Langfuse did not start (${error instanceof Error ? error.message : String(error)})`);
    return undefined;
  }
}

/** The span processor the tracer hands its spans to: Langfuse's, or an in-memory one in tests. */
export interface Processor {
  forceFlush(): Promise<void>;
}

/** A tracer over a span processor. Exported for the test, which passes an in-memory exporter. */
export async function langfuseTracer(run: TraceRun, processor: Processor): Promise<TurnTracer> {
  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { setLangfuseTracerProvider, startObservation, propagateAttributes } = await import("@langfuse/tracing");
  const provider = new NodeTracerProvider({ resource: resourceFromAttributes({ "service.name": "nat20-table" }), spanProcessors: [processor as never] });
  // The context manager `propagateAttributes` needs; our spans are made after the fact, all inside it.
  provider.register();
  setLangfuseTracerProvider(provider);
  const at = (ms: number) => new Date(ms);
  return {
    turn(t) {
      try {
        const name = `${t.role ?? "agent"}.${t.purpose.replaceAll(" ", "_")}`;
        propagateAttributes(
          {
            sessionId: run.sessionId,
            tags: run.tags,
            traceName: name,
            metadata: { seat: t.seat, purpose: t.purpose },
          },
          () => {
            const u = t.usage;
            const root = startObservation(
              name,
              {
                input: t.systemPrompt === undefined ? t.message : { system: t.systemPrompt, message: t.message },
                output: t.final,
                metadata: { seat: t.seat, session_turn: u.session_turn, outcome: u.outcome, effort: u.effort, ...(u.settled_early ? { settled_early: true, waited_ms: u.waited_ms } : {}) },
                ...(u.outcome === "ok" ? {} : { level: "WARNING" as const, statusMessage: u.outcome }),
              },
              { asType: "agent", startTime: at(t.started) },
            );
            const parent = { parentSpanContext: root.otelSpan.spanContext() };
            t.calls.forEach((c, i) => {
              const asked = t.tools.filter((tool) => tool.call === i - 1);
              const generation = startObservation(
                c.model,
                {
                  model: c.model,
                  input: i === 0 ? t.message : asked.map((tool) => ({ tool: tool.name, answer: tool.output })),
                  output: c.content,
                  usageDetails: { input: c.input, output: c.output, cache_read_input_tokens: c.cacheRead, cache_creation_input_tokens: c.cacheWrite },
                  costDetails: { total: c.usd },
                  ...(c.firstToken !== undefined ? { completionStartTime: at(c.firstToken) } : {}),
                },
                { asType: "generation", startTime: at(c.started), ...parent },
              );
              generation.end(at(c.ended));
            });
            for (const tool of t.tools) {
              startObservation(
                tool.name,
                { input: tool.input, output: tool.output, ...(tool.refused ? { level: "WARNING" as const, statusMessage: "refused" } : {}) },
                { asType: "tool", startTime: at(tool.started), ...parent },
              ).end(at(tool.ended));
            }
            root.end(at(t.ended));
          },
        );
      } catch (error) {
        // A trace is never worth a turn: the run goes on without it.
        console.error(`tracing: a turn was not traced (${error instanceof Error ? error.message : String(error)})`);
      }
    },
    async flush(timeoutMs = 10_000) {
      // A session hands its last turn over on the next turn of the event loop (`setImmediate`), so
      // let that run first: otherwise the run's last turn would miss the flush.
      await new Promise((resolve) => setImmediate(resolve));
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<void>((resolve) => (timer = setTimeout(() => resolve(console.error(`tracing: Langfuse did not answer in ${timeoutMs / 1000} s; some traces may be missing`)), timeoutMs)));
      await Promise.race([processor.forceFlush().catch((error: unknown) => console.error(`tracing: ${error instanceof Error ? error.message : String(error)}`)), late]);
      clearTimeout(timer);
    },
  };
}
