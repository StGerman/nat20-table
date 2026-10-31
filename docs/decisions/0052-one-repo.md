# 0052. nat20-table stays one repo: the Rust engine and the TypeScript game together

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** Stas, in the Milestone 10 spec thread (2026-10-31 08:24Z): "Add the ADR as a task of the M10, just about keeping them in single repo"

## Context

Decision [0044](0044-one-repo-through-m7.md) kept nat20-table one repo through Milestone 7. With Milestone 7 closed for now ([0051](0051-m7-closed-for-now.md)), Stas asked on 2026-10-31 whether to split it now: a TypeScript repo for the game (`nat20-game-cli`) and a Rust-only `nat20-table`. What a split along that line would need, checked against main e510867:

- **An engine release pipeline.** `packages/engine-client` spawns `nat20-api-server` built from the same tree. A separate game repo needs a built, versioned server binary per platform, and a way to fetch it in CI and on Stas's Mac.
- **A published, hash-pinned client.** The client's generated types and the schema hash come from the contract crate. Each contract change would become two PRs in two repos: publish the client, then bump it in the game.
- **Content that straddles the line.** The server reads `scenarios/`, `pregens/` and `maps/`; the game reads the same pack for its prompts, names and checks.
- **Game CI that replays against a live server.** The game fixtures record engine responses, so the game's CI needs the engine at the matching rev on every PR.

## Options

### A. Keep one repo
- Pro: one PR carries a contract change, the server, the client and the fixtures it re-records; CI builds the server once and replays both sides.
- Pro: nothing new to release, publish or pin.
- Con: Rust and TypeScript CI jobs run in one repo; a docs-only PR still pays the full gate (decision 0022 already filters jobs by path).

### B. Split along Rust and TypeScript (`nat20-game-cli` plus a Rust-only `nat20-table`)
- Pro: each repo's CI is one toolchain.
- Con: the release pipeline, the publish-and-pin dance per contract change, and content in two places, all listed above.
- Con: the Rust-to-TypeScript line is internal: only our game loop talks to the engine, and the wire already has a contract, a schema hash and fixtures.

## Decision

A. nat20-table stays one repo, with the Rust engine and the TypeScript game together. The split along Rust and TypeScript was evaluated and rejected on 2026-10-31.

## Consequences

- The line that gets its own contract, and later perhaps its own repo, is the one between the game loop and its clients: today the in-process `Seat` interface (`game/src/table/types.ts`). That work goes with the SwiftUI client milestone, as 0044 already said.
- No TASKS.md row follows beyond CON-15, which this record closes.

## Revisit when

A second client (the SwiftUI app or the Telegram front end) needs the game loop over a network: then the `Seat` line gets its contract, and the repo question is asked again along that line.

## Sources

- Milestone 10 spec, item C1 (`docs/design/m10-spec.md`), and system design §6 order 0 (`docs/design/m10-system-design.md`).
- Decision 0044 (one repo through Milestone 7).
