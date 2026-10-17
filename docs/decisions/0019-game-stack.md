# 0019. Game side: TypeScript, Ink and the Claude Agent SDK; the engine as a separate process

- **Status:** Accepted (not built yet)
- **Date:** 2026-10-16
- **Decided by:** Claude recommended when Stas asked what Claude Code's CLI uses; accepted with the Demo Run scope

## Context

The game loop runs a DM agent, 2-3 player agents and a text UI. Each agent needs its own context and tools. The engine is Rust.

## Options

### A. TypeScript + Ink (React for terminals) + Claude Agent SDK
- Pro: the agent loop Claude Code itself uses; separate agents with own context and tools without writing our own loop; Ink suits a chat-style game with a status bar.
- Pro: the generated TS client already types the engine wire.
- Con: two languages in the repo (Rust engine, TS game).

### B. Python + Textual + Claude Agent SDK (Python)
- Pro: also viable.
- Con: needs a Python generator for the contract (not spiked); less aligned with the tooling in use.

### C. Game loop in Rust
- Con: no first-party agent SDK.

## Decision

A, with the engine as a separate process over stdio ([0007](0007-stdio-transport.md)).

## Consequences

- `packages/engine-client/` spawns the server and uses the generated types.
- Milestone 6 builds the game loop, agents and UI on this stack.

## Revisit when

Agents need Python-only libraries, or the Agent SDK cannot meet the latency budget.

## Sources

- Thread "The Demo Run scope" (2026-10-16 18:23Z); `docs/scope/demo-run-scope.md`.
