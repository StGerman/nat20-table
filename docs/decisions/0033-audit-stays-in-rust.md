# 0033. The transcript audit stays in Rust and runs as a CLI over game transcripts

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decided by:** Stas, Milestone 6 spec decision card D4 (pending)

## Context

Acceptance 2 needs every roll in a transcript to appear in the engine log. `crates/nat20-duel/src/audit.rs` already checks that: each `[rN]` line must match the logged roll as the server's `render::roll_summary` renders it, nothing uncited may look like a roll, and every logged roll must be cited. TASKS.md AGT-15 said to port it into `game/`.

## Options

### A. Keep it in Rust and run it as a CLI on a game transcript and its engine log
- Pro: one renderer; the audit can't drift from what the engine prints.
- Con: the game's CI step calls a Rust binary.

### B. Port it to TypeScript in `game/`
- Pro: one language on the game side.
- Con: the roll renderer is duplicated in TS and needs a parity test against Rust forever.

## Decision

A. The game writes `transcript.jsonl` and the engine log; the Rust audit binary checks them. The audit is **view-aware**: each transcript channel is checked against the log projected for its viewer, so the human's table transcript is compared with the player roll view (`1d20 (14) = 19, hit`, no AC) and the DM transcript with the full view. Nothing hidden is added to the visible transcript to satisfy the audit. `render::roll_summary` already renders either view. Every roll in the full log must still be cited in at least one channel. AGT-15 is reworded.

## Consequences

- CI runs the audit on every game fixture, with a regression test for a player-view line; Milestone 7 runs it on every timed playthrough.

## Revisit when

The game moves to a host where it can't run the engine binary, or the transcript format can no longer be read from Rust.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §8 step 6, D4; protocol §6 (audit rule); decision 0005.
