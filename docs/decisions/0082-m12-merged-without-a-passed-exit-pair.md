# 0082. Milestone 12 merges without a passed exit pair

- **Status:** Accepted
- **Date:** 2026-11-14
- **Decided by:** Stas, in the exit-run thread, 2026-11-14 17:52Z: «Короче давай мерджить M12». The record's wording is Claude's; the choice is his.

## Context

Milestone 12 ran eight full runs and none passed its exit rows. The own-move gate (`m12-own-move`) failed in Stas's halves on builds 162de4c and ecd1f9e; decisions 0079 and 0081 reworked the rule twice in one day. On 2026-11-14 Stas started his half on build 1dbebdc before the all-AI half had run on fca490f, typed an own move no written choice fits («отрезать ему язык» at the Millbeck bridge) and got an answer in the scene and no move. That is the rule as scoped: an own move brings only one of the card's own choices (scope §2 item 1, decision 0068). He judged the mechanic not worth more exit pairs.

The stack (stack 347, table #343 to #392) and table #344 hold about 25 pull requests off main, all with a 🟢 review and green checks. Decision 0043 holds a milestone's work off main until its exit pair has passed on one build.

## Options

### A. Keep the stack off main until a pair passes
- Pro: 0043 as written.
- Con: every other thread works against a main that is five days old; each further pair costs about 8.5 USD and an evening of Stas at the table, for a gate whose rule he no longer wants.

### B. Merge the stack; the milestone closes with its exit pair not passed
- Pro: main carries the readable-table work that did hold (Russian cards and seat, card after its narration, the run record, the small engine fixes); the own-move rule is on main as decided in 0068, 0079 and 0081, tested in CI.
- Con: an exception to 0043; `m12-own-move` and `m12-readable` were never ruled PASS on one build.

### C. Drop the own-move pull requests and merge the rest
- Pro: main would carry only what passed a read.
- Con: the stack interleaves them with the rest (contract dev.69 to dev.73); cutting them out is days of work to remove a mechanic that works as specified.

## Decision

B. Stas's hours are the bottleneck, and the gate measured a rule he has stopped wanting, not a defect in what was built.

## Consequences

- An exception to 0043 for Milestone 12 only. 0043 stands for later milestones.
- Milestone 12 is closed, not done: its exit criterion did not hold. TASKS.md says so.
- Decision 0081 is Accepted with this merge. Its questions 2 to 6 stay built on their recommendations.
- The outcome a player's words ask for and no card wrote goes to Milestone 13 (decision 0071, deed from words). AGT-115 is dropped; AGT-117 stays in the backlog.
- Run `full-2026-11-14T17-19-50-900Z` (Stas, 1dbebdc) is not an exit run. Its live notes are in the project files.
- Yan's close sweep and the roadmap's delivery numbers for Milestone 12 follow this merge.

## Revisit when

A later milestone wants to merge before its exit pair: this record is not a precedent for it.
