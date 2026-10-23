# 0030. Agents run as Agent SDK sessions with only our tools, bound by the game loop

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decided by:** Claude proposed in the Milestone 6 spec (D6); stands unless Stas changes it in review of the spec PR

## Context

Milestone 6 puts a DM agent and one agent per AI player at the table on the Claude Agent SDK (decisions 0013, 0019). The Agent SDK is the Claude Code harness: by default it gives a session file, shell and web tools, loads CLAUDE.md and project settings, and uses a long default system prompt. This repository holds the scenario files with every DC and stat block, so a player agent that can read files can metagame, and Rule 3 forbids it. Agents also must never choose the viewer the engine projects for, and the engine accepts one client per process (protocol §1).

## Options

### A. One SDK session per agent per scene, only our in-process MCP tools, no setting sources, our own system prompt
- Pro: an agent can do nothing but call tools the game loop wrote, each bound to its seat's viewer and actor; nothing from the repository reaches its context.
- Pro: context is bounded by one scene; the prefix is small and stable, so it caches.
- Con: a summary step at every scene change (AGT-6), and a cold session start per scene.

### B. One session per agent for the whole run
- Pro: no summary step.
- Con: context grows for 90 minutes; cost and latency grow with it (scope §7.4).

### C. A fresh model call per turn, the game loop rebuilding the context each time
- Pro: full control of the context.
- Con: re-sends everything every turn; this is the raw Messages API with extra steps, not what 0019 chose.

## Decision

A. The game loop owns the only engine client. Every agent tool is an in-process MCP tool whose handler fills `viewer`, `actor` and `prompt_id` itself; tool inputs have no such fields. Built-in tools are off, setting sources are empty, the working directory is empty, and the system prompt is ours.

## Consequences

- Visibility holds per agent by construction, plus the leak scan over player inputs (spec §3.5, AGT-19).
- Step 1 of the spec measures the per-session and per-call latency of this setup before anything is built on it.
- Model and effort are per-agent config (decision 0032).

## Revisit when

The step 1 spike or later runs show the SDK cannot meet the latency targets (p95 player 10 s, DM 6 s); then 0019 comes back to Stas.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §3.1, §3.2, D6; `docs/scope/demo-run-scope.md` §4.3; decisions 0004, 0013, 0019.
