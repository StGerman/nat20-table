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

A. The game writes `transcript.jsonl` and the DM-projected engine log; the Rust audit binary checks them. AGT-15 is reworded.

## Consequences

- CI runs the audit on every game fixture; Milestone 7 runs it on every timed playthrough.

## Revisit when

The game moves to a host where it can't run the engine binary, or the transcript format can no longer be read from Rust.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §8 step 6, D4; protocol §6 (audit rule); decision 0005.
