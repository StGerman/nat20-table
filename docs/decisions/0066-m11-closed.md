# 0066. Milestone 11 closes on exit pair 3; the order after Milestone 12

- **Status:** Proposed (accepted when Stas merges table #336)
- **Date:** 2026-11-08
- **Decided by:** Stas. He accepted the pair at 20:51Z, dismissed flag n22-1 at 20:58Z (nat20-runs #6), and merged the stack at 21:00Z. The order was set in chat in the dramaturg design thread, 2026-11-07 19:34Z ("M11, then the dramaturg whole, then Arachas plus glue, then the Mill plus glue"). M12 went in after M11 on 2026-11-08 21:15Z. The backlog was named on table #337, 2026-11-08 22:20Z. Stas asked for this record in the planning thread on 2026-11-08 at 22:24Z, answers 5 and 6.

## Context

Milestone 7, 9 and 10 each closed on a record (0059, 0060, 0056). Milestone 11, Word on the road (scope `docs/scope/living-world-scope.md` §8, decision [0063](0063-m11-the-road-remembers.md)), closed on 2026-11-08 with no record. Its done status rested on the merge times and two PASS verdicts.

The exit runs, all in StGerman/nat20-runs:

| Pair | Build | All-AI half (*Fair in Wend*) | Stas's half (*The Way Back*) |
|---|---|---|---|
| 1 | be5e650 (table #321) | `full-2026-11-07T14-41-01-898Z`: FAIL (m9-fight, m11-deck: 0 arrivals) | `full-2026-11-07T14-55-35-005Z`: FAIL. Played for 39.1 min after the AI half had failed |
| 2 | 238c99b (table #325) | `full-2026-11-07T17-47-26-685Z`: FAIL (no deed read later in the run) | not played |
| 3 | 2294ef6 (table #325) | `full-2026-11-07T20-54-27-518Z`: PASS | `full-2026-11-08T20-11-16-308Z`: PASS once flag n22-1 was dismissed |

In pair 3 the rule gates of §8.3 pass. The player experience does not: on the bridge card Stas typed his own move, the card showed itself again silently, and he felt like a passenger. Table #329 (AGT-96) and #330 fix that path, and they landed on top of the stack after the pair. So the shipped build differs from 2294ef6, which decision [0043](0043-demo-acceptance-two-runs.md) does not allow.

## Options

### A. Close on pair 3 and accept the two fixes on top
- Pro: every gating row of §8.3 passes on one build, and Stas judged both halves.
- Pro: the fixes are small and touch only the path that failed the experience. Own move, which Milestone 12 carries, is the real fix.
- Con: the shipped build is not the exit build, against 0043's "nothing lands after the pair".

### B. Play pair 4 on the build with #329 and #330
- Pro: meets 0043 to the letter.
- Con: another evening of Stas and about 13 USD, for a path that Milestone 12 replaces.

## Decision

A. Milestone 11 is done on 2026-11-08, closed on exit pair 3 on 2294ef6. Table #329 and #330 are accepted on top. The cost goes into `docs/roadmap.md` as the baseline: 3 pairs played, 1 passed, 35.45 USD in runs, and 1.09 h of Stas at the table.

The order of work after Milestone 11:

1. Milestone 12, Not a passenger (scope `docs/scope/not-a-passenger-scope.md`).
2. The dramaturg mechanism: the engine carries the story from one quest to the next. The role half is done (Zoya, table #328).
3. Arachas, plus the glue to the road.
4. The Silent Mill, plus the glue to the road.

Backlog milestones, not ordered: the player as a merchant, Telegram, a smarter table. Each gets a number only when it gets a row in TASKS.md § Milestones.

## Consequences

- **`TASKS.md`:** row 11 stays done and can cite this record.
- **Flag n22-1** (Odda's thanks cost nothing) moved to MAP-17, which is now in Milestone 12, phase 1.
- **The `m11-thread` gate passes trivially,** because `crossed_millbeck` is true in every run. The gate stays as written. A real reader for it goes to the dramaturg mechanism.
- **Decision 0043** stays as written. This record waives its "nothing lands after the pair" clause for table #329 and #330 only.
- **From Milestone 12 on, an exit pair plays its all-AI half first.** Stas plays only after that half has passed on the same build (scope `not-a-passenger-scope.md` §4 and amendment 1). Pair 1 above is the reason.

## Revisit when

Friends-and-family testing plays *The Way Back* and the bridge path fails on the shipped build. A same-build pair then comes back.

## Sources

- StGerman/nat20-runs `master` 2e65a5d: the five runs above (`run.json`, `verdict.json`, `usage.jsonl`), and nat20-runs #6.
- The exit pair 3 analyses in the project files, under `engine/m11/runs/<run>/analysis.md`.
- Table #298 (scope §8, design, 0063); table #299 to #325, merged 2026-11-08 21:00Z; table #329 and #330.
- Decisions 0043, 0056, 0059, 0060, 0063, 0065.
