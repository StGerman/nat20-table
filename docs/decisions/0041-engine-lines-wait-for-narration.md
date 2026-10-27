# 0041. On the table screen, engine lines wait for the DM's narration of them

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas, on a decision card in the "Make the transcript read like a chat" thread (option A)

## Context

The terminal seat printed each engine line (turn, attack, `[rN]` roll, damage, death) as it arrived, above the DM's narration of it. In Scene 3 of the exit run of 2026-10-27 the lines of an AI player's turn sat alone on screen for 7 to 21 s while the DM was thinking (p90 14 s), and even when line and narration arrived together the human read the outcome first. 45 of the 58 narrations followed another one with only engine lines between them, so the screen read like a log, not a conversation. Rule 4 and the audit need every roll in the engine log and the run transcript; neither needs it on screen.

## Options

### A. The seat holds the lines and folds them under the narration
- Pro: fixes both the wait and the reading order; screen-only, so the transcript, the audit and the loop are untouched.
- Con: the narration is the only account on screen by default, so a wrong narration has no engine line beside it.

### B. Hide the lines behind a flag, without holding them
- Pro: the smallest change.
- Con: with the flag on, the outcome still shows first.

### C. Stream the narration
- Pro: a shorter wait.
- Con: doesn't fix the reading order alone; belongs to the optimisation milestone.

### D. The DM narrates a whole round in one wake
- Pro: fewer, longer narrations.
- Con: monster turns wait for the round's end, the human waits longer, and the loop and prompt change.

## Decision

A. Other characters' engine lines wait in the seat for the narration that covers them. By default they stay out of the scrollback (`/log` prints them); with `--verbose` they fold under it. The human's own lines, and any lines still held when a decision comes up (options, a reaction, a DM question, the run's end, a prompt), show at once in full, so a DM fallback still reaches the human. Each message carries one speaker label.

## Consequences

- `game/src/ui/ink-seat.ts` and `lines.ts` hold, fold and label; the panel frame waits for the next narration or decision too. `TableEvent` `engine` gains an optional `own`, and the seat an optional `unnarrated()` that `TableState` calls after a DM fallback, so those lines show alone.
- The DM prompt asks for narration that stands alone and names no turns.
- `transcript.jsonl`, the engine and session logs, and `nat20-audit` are unchanged; `inputs.jsonl` gains `own`.
- Row AGT-37 in `TASKS.md`.

## Revisit when

- A run shows narration that contradicts the engine (scope acceptance 3) more often with the lines hidden: then show a one-line roll summary under each narration by default.
- Streaming narration arrives with the optimisation milestone.

## Sources

- Project note `engine/m6/chat-transcript-design.md`.
- Stas's exit-run transcript, 2026-10-27; `transcript.jsonl` of the Scene 3 run of 2026-10-27.
