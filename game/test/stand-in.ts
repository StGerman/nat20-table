// A session that plays a script instead of calling a model (M6 spec §8: CI never calls a model). It
// calls the agent's own seat tools the way a model would, so the agent's bindings, the loop and the
// engine all run for real.
import assert from "node:assert/strict";
import type { SessionConfig, TurnResult, TurnSession } from "../src/agents/sdk-session.ts";
import type { UsageRecord } from "../src/usage.ts";

/** Calls one of the session's tools as the model would, and gives back its answer. */
export type Call = (tool: string, input?: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;

/** What the stand-in "model" does on a turn, by the wake it was sent for; it returns its final answer. */
export type Script<Wake extends string> = (wake: Wake, call: Call, message: string) => Promise<string>;

export class StandIn<Wake extends string> implements TurnSession {
  readonly turns: Array<{ message: string; purpose: string }> = [];
  closed = false;
  readonly config: SessionConfig;
  private readonly script: Script<Wake>;

  constructor(config: SessionConfig, script: Script<Wake>) {
    this.config = config;
    this.script = script;
  }

  readonly call: Call = async (name, input = {}) => {
    const tool = this.config.tools.find((t) => t.name === name);
    assert.ok(tool, `no tool ${name}`);
    const result = await tool.handler(input, {});
    return { text: result.content.map((c) => (c.type === "text" ? c.text : "")).join(""), isError: result.isError === true };
  };

  async turn(message: string, purpose: string): Promise<TurnResult> {
    this.turns.push({ message, purpose });
    const final = await this.script(purpose as Wake, this.call, message);
    return { text: final, final, usage: {} as UsageRecord };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
