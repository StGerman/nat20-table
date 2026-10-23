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
import { apiEquivalentUsd, type UsageLog, type UsageRecord } from "../usage.ts";

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
}

/**
 * Variables an agent's Claude Code process may inherit. Everything else is dropped: a variable
 * from the shell that launched the game (a parent Claude Code session's, an `ANTHROPIC_API_KEY`)
 * can redirect the process to another account, another endpoint or another session's memory, and
 * the spike showed one doing exactly that. Without an API key the process uses the Claude login in
 * the home directory: Stas's subscription (decision 0036).
 */
const INHERITED_ENV = /^(PATH|HOME|USER|LOGNAME|SHELL|TERM|TMPDIR|LANG|LC_[A-Z]+|TZ|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR)$/;

/** The environment for an agent's process: the allow-list above, plus the client name. */
export function agentEnv(parent: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(parent)) if (INHERITED_ENV.test(key)) env[key] = value;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "nat20-table/0.1.0";
  return env;
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

/** The plan's usage limit was reached (decision 0036): the run stops cleanly, no retry. */
export class UsageLimitReached extends Error {
  readonly resetsAt: number | undefined;
  constructor(resetsAt: number | undefined) {
    super(
      `The Claude plan's usage limit was reached${resetsAt ? `; it resets at ${new Date(resetsAt * 1000).toISOString()}` : ""}.`,
    );
    this.resetsAt = resetsAt;
  }
}

/** A turn ran past its timeout and was interrupted. */
export class TurnTimeout extends Error {}

/** What a turn produced. */
export interface TurnResult {
  /** The agent's final text, if it wrote any (tool calls carry its decisions). */
  text: string;
  usage: UsageRecord;
}

interface PendingTurn {
  /** The uuid sent with the user message; the SDK echoes it on the turn's result. */
  uuid: string;
  purpose: string;
  sentAt: number;
  texts: string[];
  tools: string[];
  calls: Map<string, { input: number; cacheRead: number; cacheWrite: number; output: number }>;
  model: string;
  resolve: (result: TurnResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | undefined;
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
  /** The SDK's `init` message: the tools, skills and credential source the session really got. */
  init: SDKSystemMessage | undefined;

  constructor(config: SessionConfig) {
    this.config = config;
    const cwd = config.cwd ?? mkdtempSync(path.join(tmpdir(), `nat20-${config.agent}-`));
    this.query = query({ prompt: this.inbox, options: sessionOptions(config, cwd) });
    this.pump = this.read();
  }

  /** Sends one message and resolves with the turn's text and usage. One turn at a time. */
  turn(message: string, purpose: string): Promise<TurnResult> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error(`${this.config.agent}: a turn is already running`));
    this.turns += 1;
    return new Promise<TurnResult>((resolve, reject) => {
      const pending: PendingTurn = {
        uuid: randomUUID(),
        purpose,
        sentAt: performance.now(),
        texts: [],
        tools: [],
        calls: new Map(),
        model: this.config.choice.model,
        resolve,
        reject,
        timer: undefined,
      };
      if (this.config.turnTimeoutMs) {
        pending.timer = setTimeout(() => {
          this.stale += 1;
          void this.query.interrupt().catch(() => undefined);
          this.settle(new TurnTimeout(`${this.config.agent}: turn timed out after ${this.config.turnTimeoutMs} ms`));
        }, this.config.turnTimeoutMs);
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
    const turn = this.pending;
    switch (message.type) {
      case "system":
        if (message.subtype === "init") this.init = message;
        return;
      case "rate_limit_event":
        if (message.rate_limit_info.status === "rejected") {
          this.fail(new UsageLimitReached(message.rate_limit_info.resetsAt));
        }
        return;
      case "assistant": {
        if (!turn || this.stale > 0 || message.parent_tool_use_id !== null) return;
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
        for (const block of api.content) {
          if (block.type === "text") turn.texts.push(block.text);
          if (block.type === "tool_use") turn.tools.push(block.name.replace(`mcp__${TOOL_SERVER}__`, ""));
        }
        return;
      }
      case "result": {
        // A result for a turn that timed out belongs to no turn. The SDK names the message a
        // result answers when it can; otherwise the count of timed-out turns decides.
        const echoed = message.user_message_uuid;
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
        const tokens = [...turn.calls.values()].reduce(
          (sum, call) => ({
            input: sum.input + call.input,
            cacheRead: sum.cacheRead + call.cacheRead,
            cacheWrite: sum.cacheWrite + call.cacheWrite,
            output: sum.output + call.output,
          }),
          { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
        );
        const usage: UsageRecord = {
          agent: this.config.agent,
          model: turn.model,
          effort: this.config.choice.effort,
          purpose: turn.purpose,
          session_turn: this.turns,
          input_tokens: tokens.input,
          cache_read_tokens: tokens.cacheRead,
          cache_write_tokens: tokens.cacheWrite,
          output_tokens: tokens.output,
          api_calls: turn.calls.size,
          wall_ms: Math.round(performance.now() - turn.sentAt),
          ttft_ms: message.ttft_ms ?? null,
          api_equivalent_usd: apiEquivalentUsd(turn.model, tokens),
          tools: turn.tools,
          at: new Date().toISOString(),
        };
        this.config.usage?.add(usage);
        this.settle({ text: turn.texts.join("\n").trim(), usage });
        return;
      }
      default:
        return;
    }
  }

  private settle(outcome: TurnResult | Error): void {
    const turn = this.pending;
    if (!turn) return;
    this.pending = undefined;
    if (turn.timer) clearTimeout(turn.timer);
    if (outcome instanceof Error) turn.reject(outcome);
    else turn.resolve(outcome);
  }

  private fail(error: Error): void {
    this.failure ??= error;
    this.settle(error);
  }
}
