# 0005. The engine decides and resolves every roll, never the LLM

- **Status:** Accepted
- **Date:** 2026-10-16 (hidden AC/DC kept in the log and audit added 2026-10-17)
- **Decided by:** Claude proposed from the prior-art findings; accepted with the Demo Run scope by Stas 2026-10-16; Stas required the hidden AC/DC in the log and audit 2026-10-17

## Context

Research found LLM game masters wrongly grant success on required rolls about 10% of the time, and up to 43% under persuasive pressure. Every serious AI GM product has code roll the dice. Acceptance criterion 2 is that every roll in a transcript appears in the engine log.

## Options

### A. The DM agent rolls or rules outcomes, with prompt rules against cheating
- Pro: flexible, no engine work for edge cases.
- Con: unauditable; drift under pressure is measured, not hypothetical.

### B. The engine decides when a roll happens and resolves it; the DM only narrates and picks which defined check applies
- Pro: auditable by construction; the DM has no tool that sets an outcome.
- Con: every rule the table needs must exist in the engine; an improvised check needs the SRD DC ladder.

## Decision

B. No command, tool or agent sets a roll result, check outcome, damage or HP. Every roll gets a session-unique id (`rN`) that is never reused or rewritten. The DM picks checks from the scenario or the SRD DC ladder (10/15/20) and never rules success. The full roll, including the hidden AC or DC (`against`), stays in the DM log and the audit, even though players never see it ([0006](0006-strict-player-roll-view.md)).

## Consequences

- CLAUDE.md Rule 4. Transcripts cite roll ids; the audit fails on any uncited, edited or invented roll (AGT-15 for the game loop's audit).
- Monster turns run on a scripted policy in the engine ([0015](0015-scripted-monster-turns.md)).
- Deterministic replay needs seedable dice (upstream U2, API-11).

## Revisit when

Never for outcomes. The DC ladder choice may be revisited if the DM agent misjudges difficulty often in playtests.

## Sources

- `/mnt/project-files/research/prior-art.md`; `docs/scope/demo-run-scope.md` §4.1, §6, §7.
- Thread "Engine API contract review" (AC/DC in log, verified on nat20-table PR #3).
