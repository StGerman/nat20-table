# 0032. Agent models: Opus 5.5 DM and Sonnet 5.5 players while testing, Sonnet and Haiku for a beta; cost recorded per call

- **Status:** Accepted, amended by [0036](0036-demo-runs-on-stas-subscription.md) (who pays: Stas's subscription for the demo); amended by [0045](0045-run-profiles-and-models.md) (testing runs a Sonnet DM and Haiku players)
- **Date:** 2026-10-23
- **Decided by:** Stas, in the Milestone 6 spec thread (answer to decision card D2, 2026-10-23)

## Context

Acceptance 4 sets p95 latency at 10 s per AI player turn and 6 s per DM narration. Stas asked for token cost recorded from the first Milestone 6 scene (AGT-10, 2026-10-21). List prices per million input/output tokens on 2026-10-23: Haiku 5.5 $0.10/$0.50; Sonnet 5.5 $2/$10; Opus 5.5 $4/$20; cached reads $0.20 on Sonnet and Opus.

## Options

### A. DM on Sonnet 5.5, players on Haiku 5.5
- Pro: fast and cheap; players pick from engine-listed options, which a small model handles.
- Con: weaker play, less of a picture of what the stronger models can do.

### B. Everyone on Sonnet 5.5
- Pro: smarter players.
- Con: player cost about twenty times A's.

### C. DM on Opus 5.5, players on Haiku 5.5
- Pro: the best DM judgement.
- Con: the 6 s narration target is at risk.

### D. DM on Opus 5.5, players on Sonnet 5.5
- Pro: the strongest table, so testing shows what the design can do at its best.
- Con: the most expensive option; the DM's 6 s target is at risk.

## Decision

D for Stas's personal testing now, A later for a beta (Stas: "for now I prefer to use more expensive models for personal testing"). Model and effort are per-agent configuration, so the switch is a settings change. No cost budget is enforced on the testing models; the beta models carry a target of under $5 per full Scene 1 to 6 run.

## Consequences

- Every call writes agent, model, effort, input, cache and output tokens, list-price cost and wall time to `usage.jsonl`; the run summary gives totals and p50/p95 latency per model, so both settings can be compared.
- If step 1 of the spec shows Opus misses the DM's 6 s p95, the timed runs of Milestone 7 use the beta DM model.
- OpenTelemetry replaces the ad-hoc records after Milestone 7 (AGT-16).

## Revisit when

A beta is planned, or measured latency or cost misses the targets.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §7, D2; scope §6.4, §7.4; decision 0013.
