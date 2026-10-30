# 0047. The unattended Milestone 7 run's AI players are Sonnet 5.5 at medium effort

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decided by:** Stas, in the Milestone 7 implementation thread (2026-10-30 15:34Z), after the first `play:unattended` run

## Context

Decision 0046 put the unattended run on an Opus 5.5 low DM and kept the AI players on Haiku 5.5 high. In that run (`full-2026-10-30T12-54-03-691Z`), the party wiped in the Scene 5 cellar.

The cellar is 450 XP, between Low (400) and Moderate (600) on the SRD 5.2.1 budget for four level 2 characters. Stas keeps the adventure as written (encounter tuning on hold), because people at a table clear it. The run showed the gap is in how the Haiku players play:
- they spent every limited resource in the first fight;
- nobody asked for the Short Rest before the boss;
- the cleric sent Divine Spark's variant id wrong three times, and so never picked up a fallen ally;
- they spread their attacks and never fell back.

## Options

### A. Keep Haiku players and rely on player guidance alone (AGT-49)
- Pro: cheapest per run.
- Con: the id slips and the tactical misses are about the model, and guidance alone is untested.

### B. Sonnet 5.5 low players, as in `demo`
- Pro: the same players as Stas's run.
- Con: low effort plans the least, and planning is what failed.

### C. Sonnet 5.5 medium players
- Pro: a stronger tactical player for the run where nobody steps in.
- Con: about $2 more per run than Haiku (decision 0045's prices), and slower player turns. Player latency is reported only (D1).

## Decision

C. Profile `unattended` gets players on Sonnet 5.5 at medium effort (`player-model` `claude-sonnet-5-5`, `effort` `medium`). The DM stays Opus 5.5 low. `cheap` and `demo` are unchanged.

## Consequences

- Amends 0046 for the players.
- Rows AGT-48 (this profile) and AGT-49 (player guidance) both work on the same gap.
- Iteration runs on `cheap` still use Haiku players, so they are no longer a stand-in for the unattended run's players.

## Revisit when

The unattended run on this profile still loses the cellar, or the optimisation milestone looks at player cost and latency.

## Sources

- Decisions 0043, 0045, 0046.
- `/mnt/project-files/engine/m7/runs/full-2026-10-30T12-54-03-691Z-analysis.md` (project folder; run records stay out of the repo).
