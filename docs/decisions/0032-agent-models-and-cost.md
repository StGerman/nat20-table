# 0032. Agent models: Sonnet 5.5 for the DM, Haiku 5.5 for AI players; cost recorded per call

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decided by:** Stas, Milestone 6 spec decision card D2 (pending)

## Context

Acceptance 4 sets p95 latency at 10 s per AI player turn and 6 s per DM narration. Stas asked for token cost recorded from the first Milestone 6 scene (AGT-10, 2026-10-21). List prices per million input/output tokens on 2026-10-23: Haiku 5.5 $0.10/$0.50; Sonnet 5.5 $2/$10; Opus 5.5 $4/$20; cached reads $0.20 on Sonnet and Opus.

## Options

### A. DM on Sonnet 5.5, players on Haiku 5.5, low effort
- Pro: players pick from engine-listed options, which a small model handles fast and cheaply; the DM, whose work is harder, gets the stronger model.
- Con: Haiku players may play less cleverly.

### B. Everyone on Sonnet 5.5
- Pro: smarter players.
- Con: roughly twenty times the player cost and slower player turns.

### C. DM on Opus 5.5, players on Haiku 5.5
- Pro: the best DM judgement.
- Con: the 6 s narration target is at risk; DM cost about doubles.

## Decision

A, as configuration: model and effort are per-agent settings, so the choice is cheap to change after the step 1 spike measures it. Budget: a full Scene 1 to 6 run under $5 at list price.

## Consequences

- Every call writes agent, model, effort, input, cache and output tokens, list-price cost and wall time to `usage.jsonl`; the run summary gives totals and p50/p95 latency.
- OpenTelemetry replaces the ad-hoc records after Milestone 7 (AGT-16).

## Revisit when

Measured p95 or cost misses the targets, or playtests find the AI players' choices poor enough to hurt the table.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §7, D2; scope §6.4, §7.4; decision 0013.
