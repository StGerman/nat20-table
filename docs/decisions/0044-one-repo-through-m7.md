# 0044. nat20-table stays one repo through Milestone 7; the next contract goes on the line between the game loop and its clients

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas, on a decision card in the Milestone 7 design thread (19:48Z, option "Keep through M7, then client line")

## Context

Stas asked whether to split nat20-table into a Rust API repo and a TypeScript client repo before Milestone 7. On main at the time:
- Since Milestone 6 began, 8 of 44 merged PRs changed both the Rust crates and `game/`. Six were contract changes; the other two changed engine output the game fixtures record, or the audit that reads the game's transcripts. The contract went from `1.0.0-dev.30` to `dev.36` in a week, and most versions re-recorded game fixtures, which need the engine built.
- The Rust-to-TypeScript line is internal: only our game loop talks to the engine, and that wire already has a contract, a schema hash, fixtures and a breaking-change check.
- The North Star's first product (a Telegram front end, one client contract on a hosted game-loop service) needs a different line: between the game loop and its clients. Today that line is the in-process `Seat` interface (`game/src/table/types.ts`), and `loop.ts` imports no UI code.
- Two implicit contracts cross the Rust/TS line too: the transcript (written by TS, read by the Rust audit) and the scenario pack (engine data and DM prose in one folder).

## Options

### A. Split into two repos before Milestone 7
- Pro: separate release cycles from now on.
- Con: each cross-cutting change becomes two PRs, a published engine build and a pin bump, during the milestone that changes the most; the transcript and pack contracts get cut in two.

### B. A package boundary inside the repo first
- Pro: rehearses the split.
- Con: the boundary it rehearses isn't the one the Telegram milestone needs.

### C. Keep one repo through Milestone 7; then put a contract on the loop-to-client line
- Pro: no churn while M7 changes engine and game together; the next contract is the one a real client needs.
- Con: the engine's release cycle stays tied to the game's until then.

## Decision

C. No repo split during Milestone 7. The Telegram milestone puts a contract on the line between the game loop and its clients, first as a package, then as its own repo when the bot ships.

## Consequences

- Milestone 7 PRs may change Rust and `game/` together, as before, under Rule 1.
- The no-human table of Milestone 7 (AGT-40) leaves the `Seat` interface unchanged, so the line the Telegram milestone contracts stays as it is.

## Revisit when

The Telegram milestone is planned, or a second consumer of the engine wire appears (anything besides our game loop).

## Sources

- `docs/milestones/milestone-7-demo-acceptance.md` §0.
- Decision 0016 (client contract deferred); the North Star research's option C (project folder `demo/north-star-q3-mcp-options.md`).
