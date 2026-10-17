# 0007. Engine transport: JSON-lines over stdio, one engine process per game

- **Status:** Accepted
- **Date:** 2026-10-16 (confirmed by Stas 2026-10-17)
- **Decided by:** Claude proposed in the v1 draft (decision 2); Stas confirmed ("confirm all 5", 2026-10-17)

## Context

The engine has one consumer, the game loop, on the same machine. Latency is dominated by the LLM; the engine budget is milliseconds. The core registry is a process-wide global, so one process can host one ruleset.

## Options

### A. JSON-lines over stdio, strictly request then response
- Pro: no ports, no auth, no server lifecycle; the game loop spawns the engine and owns it.
- Pro: one client per process, so ordering and idempotency are simple.
- Con: one process per session; no remote clients.

### B. Local HTTP
- Pro: debuggable with curl; several clients.
- Con: ports, lifecycle and concurrency to manage for no demo benefit.

## Decision

A for the demo. Local HTTP may come later reusing the same message types (API-15).

## Consequences

- One engine process per game session; logs go to stderr.
- Requests carry a client-unique `id`; a repeated id returns the stored response (last 256).
- Rules out OpenAPI tooling for the contract ([0003](0003-contract-first-rust-crate.md)).

## Revisit when

A second process needs to talk to a running engine, or API-15 is picked up.

## Sources

- `contract/protocol.md` decision 2 and §1; `docs/design/system-design.md` §1 (N4).
