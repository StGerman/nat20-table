# 0073. Milestone exit runs are traced

- **Status:** Accepted
- **Date:** 2026-11-13
- **Decided by:** Stas (M12 build thread, 2026-11-13: «выходные прогоны без трейсов - нет давай с трейсами»)
- **Supersedes:** the clause "Off in milestone exit runs" of [0072](0072-langfuse-tracing.md); the rest of 0072 stands.

## Context

Decision 0072 kept tracing off in milestone exit runs. Table #366 merged before the Milestone 12 exit pair, and Stas's Mac has the three `LANGFUSE_*` keys in `.env`, so an exit run is traced unless the shell turns it off.

## Options

### A. Exit runs untraced (0072 as written)
- Pro: the exit run sends nothing outside the machine, and its timings carry no tracing work.
- Con: the run that decides a milestone is the one we cannot look into turn by turn.

### B. Exit runs traced
- Pro: an exit run's failures can be read in Langfuse by turn, as any other run.
- Con: spans are built after each turn, so tracing adds a little work outside the turn's own latency; the run's record still comes from `usage.jsonl`, the transcript and `report.md`, which nothing changes.

## Decision

B. Exit runs are traced when the keys are set, as any other run. The report says tracing was on (0072). The record and the verdict still come from the run's own files, never from traces.

## Revisit when

Tracing shows up in turn latency (acceptance criterion 4), or an exit run is played by someone other than Stas (0072's second consequence).
