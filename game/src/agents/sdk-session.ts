// One agent's Claude Agent SDK session (M6 spec §3.2, decision 0030): no built-in tools, no
// setting sources, an empty working directory, our own system prompt, and only the in-process MCP
// tools the orchestrator binds for this seat. The session is long-lived (streaming input): each
// `turn()` sends one user message and resolves when the SDK reports that turn's result.
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createSdkMcpServer,
  query,
  tool,
  type EffortLevel,
  type Options,
  type Query,
  type SDKMessage,
  type SDKSystemMessage,
  type SDKUserMessage,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type { z, ZodRawShape } from "zod";
import { ConnectionLost, TurnCancelled, TurnTimeout, UsageLimitReached } from "../errors.ts";
import { agentEnv } from "./env.ts";
import { apiEquivalentUsd, type UsageLog, type UsageRecord } from "../usage.ts";

export { ConnectionLost, TurnCancelled, TurnTimeout, UsageLimitReached };

/** The MCP server name every seat's tools live under; the model sees `mcp__table__<tool>`. */
export const TOOL_SERVER = "table";

/** A model and effort for one agent. Config, not code (decision 0032). */
export interface ModelChoice {
  model: string;
  effort: EffortLevel;
}

/** A tool of one seat's MCP server. Tools with different input shapes share one list. */
export type SeatTool = SdkMcpToolDefinition<any>;

/**
 * Defines a seat tool. The SDK's `tool()` types each tool by its own input shape, which a shared
 * list can't hold under strict function types, so the definition is widened here, once.
 */
export function seatTool<Shape extends ZodRawShape>(
  name: string,
  description: string,
  input: Shape,
  handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<CallToolResult>,
): SeatTool {
  return tool(name, description, input, handler as never) as unknown as SeatTool;
}

/** A tool's answer: text for the model, flagged as an error when the call was refused. */
export type CallToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/** A text answer for a tool call. */
export function reply(text: string, isError = false): CallToolResult {
  return isError ? { content: [{ type: "text", text }], isError } : { content: [{ type: "text", text }] };
}

export interface SessionConfig {
  /** The seat: `dm` or a character handle. */
  agent: string;
  choice: ModelChoice;
  systemPrompt: string;
  tools: SeatTool[];
  /** Local plugin folders whose skills this session may load (D10: the DM's craft guidance). */
  plugins?: string[];
  /** Skills to enable from those plugins, by name. */
  skills?: string[];
  /** The working directory; an empty temporary one when omitted, so no file is in reach. */
  cwd?: string;
  /** Where usage records go. */
  usage?: UsageLog;
  /** A turn that runs longer is interrupted and fails with `TurnTimeout` (spec §6). */
  turnTimeoutMs?: number;
  /** A longer or shorter limit for turns of some purposes, in place of `turnTimeoutMs`. */
  turnTimeoutsMs?: Partial<Record<string, number>>;
  /**
   * Per wake purpose, the tools whose successful call ends the turn for the caller (M10 S2,
   * decision 0053): `turn()` resolves at once, and the SDK turn drains in the background, its
   * closing call never counted as a timeout. The usage record is written when the drain ends,
   * with every token.
   */
  settleOn?: Partial<Record<string, readonly string[]>>;
  /** The SDK's `query`; a test passes a scripted stand-in, so no model is called. */
  query?: typeof query;
}

/** The SDK options for a seat. Kept separate so a test can check the isolation without a model. */
export function sessionOptions(config: SessionConfig, cwd: string): Options {
  const server = createSdkMcpServer({ name: TOOL_SERVER, version: "1.0.0", tools: config.tools });
  const skills = config.skills ?? [];
  return {
    model: config.choice.model,
    effort: config.choice.effort,
    systemPrompt: config.systemPrompt,
    // No Read, Bash, Grep, web or any other built-in tool: the repository holds the DCs. The one
    // exception is the Skill tool, for a seat given skills of its own (D10: the DM only); the
    // `skills` filter below limits it to those.
    tools: skills.length > 0 ? ["Skill"] : [],
    mcpServers: { [TOOL_SERVER]: server },
    allowedTools: [
      ...config.tools.map((tool) => `mcp__${TOOL_SERVER}__${tool.name}`),
      ...(skills.length > 0 ? ["Skill"] : []),
    ],
    // Anything not allowed above is refused without asking anyone.
    permissionMode: "dontAsk",
    // No CLAUDE.md, no user or project settings, no skills but the ones passed here.
    settingSources: [],
    plugins: (config.plugins ?? []).map((plugin) => ({ type: "local", path: plugin, skipMcpDiscovery: true })),
    skills,
    cwd,
    // Sessions are not written to ~/.claude: a run's record is our own transcript.
    persistSession: false,
    env: agentEnv(process.env),
  };
}

/** What an agent needs from a session: `AgentSession`, or a stand-in in tests. */
export interface TurnSession {
  turn(message: string, purpose: string): Promise<TurnResult>;
  close(): Promise<void>;
  /** A timed-out turn's result is still to come, so a tool call now is that turn's (`AgentSession`). */
  readonly settling?: boolean;
  /** Interrupts the turn in flight, if any, which fails with `TurnCancelled` (AGT-34). */
  cancel?(): void;
}

/** What a turn produced. */
export interface TurnResult {
  /** Everything the agent wrote in the turn, between tool calls included. */
  text: string;
  /** Its last message alone: the answer a declaration or a summary asks for. */
  final: string;
  usage: UsageRecord;
}

interface PendingTurn {
  /** The uuid sent with the user message; the SDK echoes it on the turn's result. */
  uuid: string;
  /** The turn's number in the session, from 1. */
  number: number;
  purpose: string;
  sentAt: number;
  texts: string[];
  tools: string[];
  calls: Map<string, { input: number; cacheRead: number; cacheWrite: number; output: number }>;
  /** Each API call in order, for the record's phases (M10 S1): when it started and ended, its tools, time in them. */
  timeline: ApiCall[];
  model: string;
  /** The SDK retried an API call that got no HTTP response during this turn: a lost connection. */
  offline: boolean;
  resolve: (result: TurnResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | undefined;
  /** When a settling tool ended the turn for the caller (M10 S2); the SDK turn drains after it. */
  settledAt?: number;
}

/** One API call of a turn as the session saw it (M10 S1). Times are `performance.now()`. */
interface ApiCall {
  id: string;
  /** When the request went out: the message sent, or the previous call's last tool answer. */
  started: number;
  /** When its last content block arrived. */
  ended: number;
  tools: string[];
  /** Time spent inside our tool handlers for this call's tool uses. */
  toolMs: number;
  /** When its last tool handler returned. */
  toolsDone: number | undefined;
}

/** A queue the SDK reads user messages from, one per turn. */
class Inbox implements AsyncIterable<SDKUserMessage> {
  private readonly items: SDKUserMessage[] = [];
  private waiting: ((result: IteratorResult<SDKUserMessage>) => void) | undefined;
  private closed = false;

  push(item: SDKUserMessage): void {
    if (this.waiting) {
      const wake = this.waiting;
      this.waiting = undefined;
      wake({ value: item, done: false });
    } else {
      this.items.push(item);
    }
  }

  close(): void {
    this.closed = true;
    this.waiting?.({ value: undefined, done: true });
    this.waiting = undefined;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => (this.waiting = resolve));
      },
    };
  }
}

export class AgentSession {
  readonly config: SessionConfig;
  private readonly inbox = new Inbox();
  private readonly query: Query;
  private readonly pump: Promise<void>;
  private pending: PendingTurn | undefined;
  private turns = 0;
  private failure: Error | undefined;
  /** Results still to come for turns that timed out; they belong to no turn. */
  private stale = 0;
  /** A turn a settling tool ended for the caller, whose SDK turn still runs (M10 S2). */
  private draining: PendingTurn | undefined;
  /** The SDK's `init` message: the tools, skills and credential source the session really got. */
  init: SDKSystemMessage | undefined;
  /** The seat's tools as the SDK runs them: each timed toward the turn that called it (M10 S1). */
  readonly tools: SeatTool[];

  /**
   * Whether a timed-out turn's result is still to come. Its tool calls can arrive until then, and
   * Claude Code runs one turn at a time, so a tool call meanwhile is that turn's: the next turn's
   * calls come only after that result, which the session reads first.
   */
  get settling(): boolean {
    return this.stale > 0 || this.draining !== undefined;
  }

  constructor(config: SessionConfig) {
    this.config = config;
    const cwd = config.cwd ?? mkdtempSync(path.join(tmpdir(), `nat20-${config.agent}-`));
    this.tools = config.tools.map((tool) => this.timed(tool));
    this.query = (config.query ?? query)({ prompt: this.inbox, options: sessionOptions({ ...config, tools: this.tools }, cwd) });
    this.pump = this.read();
  }

  /** Sends one message and resolves with the turn's text and usage. One turn at a time. */
  turn(message: string, purpose: string): Promise<TurnResult> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error(`${this.config.agent}: a turn is already running`));
    // A turn still draining (M10 S2) runs on in the SDK before this one; the new turn's clock starts now.
    this.turns += 1;
    return new Promise<TurnResult>((resolve, reject) => {
      const pending: PendingTurn = {
        uuid: randomUUID(),
        number: this.turns,
        purpose,
        sentAt: performance.now(),
        texts: [],
        tools: [],
        calls: new Map(),
        timeline: [],
        model: this.config.choice.model,
        offline: false,
        resolve,
        reject,
        timer: undefined,
      };
      const limit = this.config.turnTimeoutsMs?.[purpose] ?? this.config.turnTimeoutMs;
      if (limit) {
        pending.timer = setTimeout(() => this.timeOut(pending, limit), limit);
      }
      this.pending = pending;
      this.inbox.push({
        type: "user",
        message: { role: "user", content: message },
        parent_tool_use_id: null,
        uuid: pending.uuid as `${string}-${string}-${string}-${string}-${string}`,
      });
    });
  }

  /**
   * Interrupts the turn in flight, as a timeout does: the loop no longer wants its answer (a
   * reaction whose moment passed, AGT-34). Without a turn in flight it does nothing.
   */
  cancel(): void {
    if (this.pending) this.interrupt(new TurnCancelled(`${this.config.agent}: turn cancelled`));
  }

  /**
   * A turn's limit passed. A turn in flight times out; a draining one (already settled for the
   * caller, M10 S2) is cut and recorded as drained: the caller never waited on it.
   */
  private timeOut(turn: PendingTurn, limit: number): void {
    if (turn === this.pending) this.interrupt(new TurnTimeout(`${this.config.agent}: turn timed out after ${limit} ms`));
    else if (turn === this.draining) {
      this.stale += 1;
      void this.query.interrupt().catch(() => undefined);
      this.drained("drained", null);
    }
  }

  /** A settling tool succeeded in the turn in flight (M10 S2): the caller has its answer now. */
  private settleEarly(turn: PendingTurn): void {
    if (turn !== this.pending) return;
    this.pending = undefined;
    this.draining = turn;
    turn.settledAt = performance.now();
    const text = turn.texts.join("\n").trim();
    turn.resolve({ text, final: turn.texts.at(-1)?.trim() ?? "", usage: this.recordOf(turn, "ok", null) });
  }

  /** The draining turn's SDK turn ended (or was cut): its usage record, with every token. */
  private drained(outcome: UsageRecord["outcome"], ttft: number | null): void {
    const turn = this.draining;
    if (!turn) return;
    this.draining = undefined;
    if (turn.timer) clearTimeout(turn.timer);
    this.config.usage?.add(this.recordOf(turn, outcome, ttft));
  }

  /** Ends the turn in flight with `error`; its result, still to come, belongs to no turn. */
  private interrupt(error: TurnTimeout): void {
    this.stale += 1;
    void this.query.interrupt().catch(() => undefined);
    this.settle(error);
  }

  /**
   * A seat tool whose handler time counts toward the turn's call that used it (M10 S1): the time
   * a tool round trip spends in our code (the engine, the guards), not in the model.
   */
  private timed(tool: SeatTool): SeatTool {
    const handler = tool.handler;
    return {
      ...tool,
      handler: async (args: unknown, extra: unknown) => {
        // A tool call of a turn that timed out belongs to no turn's timing.
        const turn = this.stale === 0 ? (this.draining ?? this.pending) : undefined;
        const started = performance.now();
        try {
          const result = (await handler(args as never, extra as never)) as CallToolResult;
          if (turn && !result.isError && this.config.settleOn?.[turn.purpose]?.includes(tool.name)) this.settleEarly(turn);
          return result;
        } finally {
          const call = turn && (turn === this.pending || turn === this.draining) ? turn.timeline.at(-1) : undefined;
          if (call) {
            const now = performance.now();
            call.toolMs += now - started;
            call.toolsDone = now;
          }
        }
      },
    } as SeatTool;
  }

  /** Ends the session and waits for the SDK to shut down. */
  async close(): Promise<void> {
    this.inbox.close();
    await this.pump.catch(() => undefined);
  }

  private async read(): Promise<void> {
    try {
      for await (const message of this.query) this.handle(message);
      this.fail(new Error(`${this.config.agent}: the agent session ended`));
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handle(message: SDKMessage): void {
    // Claude Code runs one turn at a time: until a draining turn's result, every message is its.
    const turn = this.draining ?? this.pending;
    switch (message.type) {
      case "system":
        if (message.subtype === "init") this.init = message;
        // A retry with no HTTP status never reached the API; one with a status, or any answer, did.
        if (message.subtype === "api_retry" && turn && this.stale === 0) turn.offline = message.error_status === null;
        return;
      case "rate_limit_event":
        if (message.rate_limit_info.status === "rejected") {
          this.fail(new UsageLimitReached(message.rate_limit_info.resetsAt));
        }
        return;
      case "assistant": {
        if (!turn || this.stale > 0 || message.parent_tool_use_id !== null) return;
        turn.offline = false;
        const api = message.message;
        turn.model = api.model ?? turn.model;
        // The SDK splits one API response into a message per content block, all with the same id.
        const usage = api.usage;
        turn.calls.set(api.id, {
          input: usage?.input_tokens ?? 0,
          cacheRead: usage?.cache_read_input_tokens ?? 0,
          cacheWrite: usage?.cache_creation_input_tokens ?? 0,
          output: usage?.output_tokens ?? 0,
        });
        const now = performance.now();
        let call = turn.timeline.at(-1);
        if (call?.id !== api.id) {
          call = { id: api.id, started: call ? (call.toolsDone ?? call.ended) : turn.sentAt, ended: now, tools: [], toolMs: 0, toolsDone: undefined };
          turn.timeline.push(call);
        }
        call.ended = now;
        for (const block of api.content) {
          if (block.type === "text") turn.texts.push(block.text);
          if (block.type === "tool_use") {
            const name = block.name.replace(`mcp__${TOOL_SERVER}__`, "");
            turn.tools.push(name);
            call.tools.push(name);
          }
        }
        return;
      }
      case "result": {
        // A result for a turn that timed out belongs to no turn. The SDK names the message a
        // result answers when it can; otherwise the count of timed-out turns decides.
        const echoed = message.user_message_uuid;
        if (this.draining && (echoed ? echoed === this.draining.uuid : this.stale === 0)) {
          this.drained(message.subtype === "success" && !message.is_error ? "ok" : "failed", message.subtype === "success" ? (message.ttft_ms ?? null) : null);
          return;
        }
        if (echoed ? echoed !== turn?.uuid : this.stale > 0) {
          if (this.stale > 0) this.stale -= 1;
          return;
        }
        if (!turn) return;
        // Results come in order, so any timed-out turn before this one has finished by now.
        this.stale = 0;
        if (message.subtype !== "success" || message.is_error) {
          this.settle(new Error(`${this.config.agent}: turn failed (${message.subtype})`));
          return;
        }
        const usage = this.record(turn, "ok", message.ttft_ms ?? null);
        this.settle({ text: turn.texts.join("\n").trim(), final: message.result.trim(), usage });
        return;
      }
      default:
        return;
    }
  }

  /**
   * Writes the turn's usage record. A turn that ends without a result (a timeout, a failure, the
   * plan's limit) is recorded too, with what it spent until then, so a run's report counts every
   * token and every slow turn.
   */
  private record(turn: PendingTurn, outcome: UsageRecord["outcome"], ttft: number | null): UsageRecord {
    const usage = this.recordOf(turn, outcome, ttft);
    this.config.usage?.add(usage);
    return usage;
  }

  /** The turn's usage record as it stands, not yet written. */
  private recordOf(turn: PendingTurn, outcome: UsageRecord["outcome"], ttft: number | null): UsageRecord {
    const tokens = [...turn.calls.values()].reduce(
      (sum, call) => ({
        input: sum.input + call.input,
        cacheRead: sum.cacheRead + call.cacheRead,
        cacheWrite: sum.cacheWrite + call.cacheWrite,
        output: sum.output + call.output,
      }),
      { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    );
    const at = (t: number) => Math.round(t - turn.sentAt);
    const calls = turn.timeline.map((call, i) => ({
      n: i + 1,
      started_ms: at(call.started),
      ...(i === 0 && ttft !== null ? { first_token_ms: ttft } : {}),
      ended_ms: at(call.ended),
      tools: call.tools,
      tool_ms: Math.round(call.toolMs),
    }));
    const usage: UsageRecord = {
      agent: this.config.agent,
      model: turn.model,
      effort: this.config.choice.effort,
      purpose: turn.purpose,
      session_turn: turn.number,
      outcome,
      input_tokens: tokens.input,
      cache_read_tokens: tokens.cacheRead,
      cache_write_tokens: tokens.cacheWrite,
      output_tokens: tokens.output,
      api_calls: turn.calls.size,
      wall_ms: Math.round(performance.now() - turn.sentAt),
      ttft_ms: ttft,
      api_equivalent_usd: apiEquivalentUsd(turn.model, tokens),
      tools: turn.tools,
      calls,
      tool_ms: Math.round(turn.timeline.reduce((sum, call) => sum + call.toolMs, 0)),
      ...(turn.settledAt !== undefined ? { settled_early: true, waited_ms: Math.round(turn.settledAt - turn.sentAt) } : {}),
      at: new Date().toISOString(),
    };
    return usage;
  }

  private settle(outcome: TurnResult | Error): void {
    const turn = this.pending;
    if (!turn) return;
    this.pending = undefined;
    if (turn.timer) clearTimeout(turn.timer);
    if (outcome instanceof Error) {
      // A turn that ended without its answer while the connection was gone failed for that reason.
      if (turn.offline && !(outcome instanceof TurnCancelled) && !(outcome instanceof UsageLimitReached)) outcome = new ConnectionLost(`${this.config.agent}: no connection to the API (${outcome.message})`);
      const how = outcome instanceof TurnCancelled ? "cancelled" : outcome instanceof TurnTimeout ? "timeout" : outcome instanceof UsageLimitReached ? "limit" : "failed";
      this.record(turn, how, null);
      turn.reject(outcome);
    } else turn.resolve(outcome);
  }

  private fail(error: Error): void {
    this.failure ??= error;
    // A plan limit that cuts a draining turn short keeps its own outcome, as a turn in flight does.
    this.drained(error instanceof UsageLimitReached ? "limit" : "drained", null);
    this.settle(error);
  }
}
