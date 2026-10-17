# 0013. Each AI player is its own agent with its own context

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Stas (review comment on the Demo Run scope: "AI player should be a dedicated agent player with own context window")

## Context

The table has an AI DM, one human and 2-3 AI players. The DM knows the scenario, DCs and monster HP. An AI player that shares that context metagames.

## Options

### A. The DM agent plays the AI players
- Pro: one context, cheapest, lowest latency.
- Con: the players know everything the DM knows; no real independent decisions.

### B. One agent per AI player, with its own context and tools; a game loop passes messages
- Pro: each player sees only its sheet, personality card, what its character perceives and its own notes, which stops metagaming structurally.
- Con: three more context windows of tokens and per-player latency.

## Decision

B. Players talk only through the game loop. Out of combat, all player agents are asked in parallel and ordered after the human; in combat, only the acting player's agent is called. Each keeps a rolling summary of older events plus the current scene.

## Consequences

- Player tools: `my_sheet`, `legal_actions`, `submit_decision`, `react`, `say`, `note`; only `submit_decision` and `react` change state, and the engine validates both.
- Visibility must hold per agent ([0004](0004-visibility-in-types.md)).
- Latency budget: AI player turn p95 at most 10 s (acceptance 4). Use a fast model for players.

## Revisit when

Playtests show token cost or latency breaking the 120-minute budget even with rolling summaries.

## Sources

- `docs/scope/demo-run-scope.md` §4.3-4.4, §7.4; thread "The Demo Run scope".
