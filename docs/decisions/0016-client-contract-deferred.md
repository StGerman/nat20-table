# 0016. No client talks to the engine; the public client contract is deferred

- **Status:** Accepted (choice of client wire deferred)
- **Date:** 2026-10-16 (AG-UI assessed 2026-10-17)
- **Decided by:** Claude proposed in system design §9 when Stas asked about mobile; AG-UI assessment answered Stas's question 2026-10-17, acknowledged by Stas

## Context

Stas asked whether Swift or Kotlin clients would change the contract decision, and later whether to adopt AG-UI. The engine contract carries DM-only data (DCs, monster HP, scenario), and agents need Claude API keys that cannot ship in an app. JSON Schema → quicktype collapses every tagged union into one struct with all-optional fields.

## Options

### A. Clients talk to the engine contract directly, or embed the engine (UniFFI)
- Con: hidden data reaches a device its owner controls; API keys in the app. Rejected.

### B. Protobuf + Connect for a game server ↔ client contract
- Pro: Swift, Kotlin and TS codegen with proper sum types; streaming built in.
- Con: a second toolchain.

### C. AG-UI for the client contract
- Pro: maps well: narration to text events, sheet and `/where` to state snapshots and deltas, player decisions to frontend tool calls; MIT; ready web components.
- Con: game events (rolls, damage, conditions) become custom events, so we still need our own typed schema; no Swift SDK; streams one agent at a time, so we label the speaker ourselves.

### D. Decide now
- Con: no client exists; the demo is terminal-only and the UI talks to the game loop in-process.

## Decision

A is rejected. Between B and C, decide when a real web or mobile client is planned (C likely if web comes first, B for native mobile). Now: keep the text UI behind one in-process boundary in `game/` (player events out, player intents in), with events shaped to map one-to-one onto AG-UI's (text start/content/end, state snapshot/delta, a tool call per player decision).

## Consequences

- Two contracts with two audiences; the game server maps between them, where the visibility boundary already sits.
- Milestone 6 shapes the UI boundary events accordingly.

## Revisit when

A web or mobile client is planned.

## Sources

- `docs/design/system-design.md` §9; `/mnt/project-files/engine/design/contract-spike/mobile/`.
- Threads "System decomposition and dev process", "Engine API contract review" (2026-10-17 10:17Z).
