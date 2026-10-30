# 0051. Milestone 7 closes for now on two runs one build apart

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decided by:** Stas, in the Milestone 7 implementation thread (21:50Z): "I had enough sessions M7 can be closed for now"

## Context

Decision [0043](0043-demo-acceptance-two-runs.md) made acceptance one unattended all-AI run and one run by Stas, both on the same build, each playing Scenes 1 to 6 and passing the record checks. By 2026-10-30 21:50Z:
- **The all-AI run:** `full-2026-10-30T18-45-48-638Z`, on table 7e7c0a5, passed every row. Stas accepted it at 19:27Z, as the judge passed it.
- **Stas's runs:** he played the table himself several times. His `play:demo` on 7e7c0a5 first froze at the pick list (`full-2026-10-30T19-38-15-230Z`), which AGT-54 (table #171) fixed. His recorded run is `full-2026-10-30T20-40-59-111Z`: `play:demo` with him as Bren, on table 0608849 (7e7c0a5 plus #171, clean).
  - It played Scenes 1 to 6 in 36.6 min, and nobody died.
  - The audit cited 151 of 151 rolls, the leak scan found nothing, and the one fallback was a timeout (row 5 passes).
  - Row 3 was still pending at the close on three judge flags. The thread's read is that two are real: n27-1 (a goblin "backing away" in Bren's reach, though it was 6.4 ft off and didn't move) and n49-1 (Bren and Torva "almost recovered" at full HP after the short rest). n88-1 is not, because the engine doesn't track coin. Stas's ruling goes in the run's `confirmations.json`.
  - His other uploads played no full adventure: an aborted start, a usage-limit stop and two sessions that played nothing.
- **The build moved after the accepted run:** AGT-54 to AGT-58 merged (table #171 to #176), so main is now fda2454. A fresh `play:unattended` on fda2454 was planned, so that both runs would share one build, and was never run.

## Options

### A. Close the milestone now
- Pro: Stas has judged the game as a player, which is what the run by Stas was for in 0043 ("to validate that whole thing is working").
- Pro: no more of his plan usage or time goes on acceptance runs.
- Con: the two runs don't share a build (7e7c0a5 and 0608849, which differ only by the pick-list fix), and Stas's run has two narration lines that contradict the engine by the thread's read.
- Con: the changes made after the accepted run (every hand speaks, the DM sees who waits, the fallen-allies report, the party voices) haven't been through a full recorded run.

### B. Finish 0043 as written
Run `play:unattended` on fda2454, then a recorded `play:demo` on the same commit.
- Pro: full acceptance evidence on one build.
- Con: two more long runs on Stas's Mac, for a milestone whose question he has already answered.

## Decision

A, "for now". Milestone 7 is done. The accepted record is the all-AI run 18-45-48 on 7e7c0a5. The record of the run by Stas is 20-40-59 on 0608849, with row 3 as he rules its flags, and his other sessions as a player stand behind it.

## Consequences

- **`TASKS.md`:** Milestone 7 is done (2026-10-30). Rows still partial carry forward with their status: AGT-9 (the judge smoke test on Stas's Mac) and MON-10 (the tuning card).
- **The first recorded full run on fda2454 or later** is the first evidence for AGT-55 to AGT-58. Its analysis checks:
  - `hands lapsed` is 0;
  - scene exits with someone waiting;
  - fallen allies who could have been lifted and weren't;
  - the voices (no «мои дорогие» or «добрый человек» from Maren, no "Right then" from Bren, no numbered question lists from Ilsa).
- **Unchanged:** the acceptance in 0043 and scope §6 stays the bar for any later re-acceptance.

## Revisit when

- Before friends-and-family testing (scope §6, criterion 6): run B then, on the build they will play.
- When a run on a later build fails a row that the accepted run passed.

## Sources

- `/mnt/project-files/engine/m7/runs/full-2026-10-30T18-45-48-638Z-analysis.md` (the accepted run, and the ruling).
- Runs `full-2026-10-30T18-45-48-638Z` and `full-2026-10-30T20-40-59-111Z` in StGerman/nat20-runs (`verdict.json`, `report.md`, `narration-check.jsonl`, `narration-digest.jsonl`).
- `/mnt/project-files/engine/m7/hands-and-check-spec.md` (AGT-55 to AGT-57); `/mnt/project-files/engine/m7/maren-voice-proposal.md` (AGT-58).
