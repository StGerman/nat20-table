# 0043. Demo acceptance is one unattended all-AI run and one run by Stas, with a narration check and latency reported

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas, in the Milestone 7 design thread: the three runs dropped in his message of 19:59Z, D1 to D3 on the spec at 20:04Z, the narration check's inventory scope at 20:12Z

## Context

Scope §6.1 asked for three internal playthroughs of Scene 1 to Scene 6 in 120 minutes or less without manual intervention, and §6.4 for latency at p95 (10 s per AI player turn, 6 s per DM narration). By Milestone 7 the facts were:
- No agent had played Scenes 2, 4, 5 or 6. The longest live run was 21 minutes over Scenes 1 and 3; a projection for all six scenes is 50 to 60 minutes.
- Live runs happen only on Stas's Mac under his subscription (decision 0036), so every run costs his plan usage and, for a run with a human, his time.
- Latency work (streaming, pipelined narration) had already been moved to its own optimisation milestone (Stas, 2026-10-27 14:01Z).
- §6.3 (narration against engine state) had a prompt rule and no checker, and two real contradictions in the Milestone 6 runs.

Stas: "I don't think we need this three runs. I will test them myself and give to friends and family. So main ideas just to validate that whole thing is working. I propose to have one autonomous run and one run from my side."

## Options

### A. Three unattended timed runs in a row (the scope as written)
- Pro: some evidence of repeatability.
- Con: three times the plan usage per attempt, and any one failure restarts the count; three samples still say little statistically.

### B. One unattended run and one run by Stas on the same build
- Pro: covers both paths (no human, and the human's seat) at the least cost; Stas judges the game as a player.
- Con: proves it works, not that it works every time; friends-and-family testing is the next filter.

### C. B with a model typing on the human's seat in the unattended run
- Pro: the human's path runs unattended too.
- Con: it tests the DM's word-mapping path with a stand-in, not a person; Stas's own run covers the human's path better.

## Decision

B. Milestone 7 passes on one unattended run in which every party member is an AI player (D2; no stand-in on the human's seat) and one run with Stas at the terminal as the character he picks, on the same commit, each playing Scene 1 to Scene 6 within 120 minutes and passing the audit, the leak scan, a narration check and the retry rule. A total party kill fails a run. Latency is measured and reported, not gated (D1). Narration is checked by a deterministic state digest and Opus 5.5 at low effort as the judge, built as a command that later runs reuse; it covers inventory and character identity too, and Stas confirms each flag (D3).

## Consequences

- Scope §6.1 and CLAUDE.md's acceptance list change; §6.4 stays a goal gated by the optimisation milestone; §6.6 (first-time player) is checked in friends-and-family testing after Milestone 7.
- New rows AGT-39 (full-adventure fixture), AGT-40 (a table with no human), AGT-41 (runs upload themselves); AGT-9, AGT-14, AGT-35, MON-10 and API-35 are in Milestone 7; AGT-10's gate and AGT-25 move to the optimisation milestone.
- A failed run makes a fix and a new commit; the unattended run is repeated on it, and Stas's run only if it was the one that failed. A run cut off by the plan limit, sleep or the network is void.
- Design: `docs/milestones/milestone-7-demo-acceptance.md` §3, §4; `docs/design/demo-acceptance-system.md`.

## Revisit when

Before anyone outside friends and family plays: a beta needs a repeatability bar (a number of passes, a crash rate) and the latency gate back.

## Sources

- `docs/milestones/milestone-7-demo-acceptance.md` §1, §3, §6.
- Scope `docs/scope/demo-run-scope.md` §6; decision 0036.
