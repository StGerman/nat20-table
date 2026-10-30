# 0046. The unattended Milestone 7 run's DM is Opus 5.5 at low effort

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decided by:** Stas, in the Milestone 7 implementation thread (2026-10-30 11:56Z), after the first full run on main

## Context

Decision 0045 put the unattended run on the `cheap` profile (DM Sonnet 5.5 medium, players Haiku 5.5 high), to go back to an Opus DM if the Sonnet DM did clearly worse. In the first full run on main (`full-2026-10-29T21-48-17-288Z`, build 6803202), the narration judge flagged 8 lines and 7 were real contradictions of engine state, mostly about positions and the Prone condition. Acceptance row 3 (no narration contradicts engine state) fails with that DM. The audit rows held: 163 of 163 rolls were cited, and nothing leaked.

## Options

### A. Keep the Sonnet DM and add prompt guidance on positions and Prone
- Pro: cheapest per run.
- Con: untested; the unattended run would carry the riskiest role on the weaker model.

### B. Opus 5.5 low for the unattended run's DM, in a profile of its own
- Pro: the stronger model where row 3 is judged; low effort holds the latency and the cost down; `cheap` stays for iteration runs.
- Con: a third profile; the DM costs more per unattended run.

### C. Move `cheap`'s DM to Opus, as 0045 foresaw
- Pro: no new profile.
- Con: every iteration run pays the Opus DM.

## Decision

B. Profile `unattended` (DM Opus 5.5 low, players Haiku 5.5 high, Russian, every seat AI), run by `npm run play:unattended`. `cheap` keeps the Sonnet DM for discovery and iteration runs; `demo` is unchanged.

## Consequences

- Amends 0045 for the unattended run only.
- Row AGT-45. The runbook, the Milestone 7 spec step 7 and the system design name the new command.
- An Opus DM is slower than a Sonnet one, so the per-wake DM timeouts of row AGT-44 matter more here.

## Revisit when

The unattended run still fails row 3 on Opus low, or the optimisation milestone changes the DM's model or effort.

## Sources

- Decisions 0032, 0043, 0045.
- `docs/milestones/milestone-7-demo-acceptance.md` §5 step 7, §6 D4.
