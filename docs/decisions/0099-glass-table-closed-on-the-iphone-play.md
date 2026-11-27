# 0099. Glass Table closes on Stas's iPhone play, without the DMG and the pair

- **Status:** Proposed
- **Date:** 2026-11-28
- **Decided by:** Stas, in the "Build the iPhone app in SwiftUI" thread, 2026-11-27 23:22Z, after a card that put three options: «Я уже играл в Мельницу на iPhone, закрываем сейчас и пошли делать Sign-in + лобби» ("I have already played the Mill on the iPhone, we close now and go do Sign-in and the lobby"); accepted on merge

## Context

Glass Table's exit is nine rows (scope `docs/scope/glass-table-scope.md` §4, as amended by decision 0093). On main bddb234 they stand like this, by the state of their tasks:

| Row | What | State |
|---|---|---|
| 1 | Structured events beside the Ink lines | met: AGT-140, a test |
| 2, 3 | The scene over the socket, resume by `seq`, no DM-view value on the wire | met: AGT-141, tests |
| 4 | Replay on WebKit, every roll face equal to the engine log | in part: the scripted fixture replays in CI; the bench fight fixture was never recorded |
| 5 | The living-world stretch, every kind of ask, the language scan | in part: AGT-142 done, AGT-143 partial |
| 6 | One signed, notarised DMG that starts the table | not met: no DMG; CON-20's report from Stas's Mac is owed, CON-21 waits on the paid Apple Developer account |
| 7 | Vera reads the app's new lines | in part: the level-up lines (AGT-146) and the shell's lines (CON-22) were read; there is no lobby or stop card to read (AGT-144) |
| 8 | One pair on one DMG (decision 0043) | not met: no pair |
| 9 | Stas plays *The Silent Mill*, Scene 1 to 6, on his iPhone over Wi-Fi | on Stas's word; no run id, build commit or minutes were recorded |

Three facts made the remaining rows poor value:

- Decision 0091 moves the table to ChatGPT in a full switch right after this milestone. The lobby AGT-144 would build has Claude's sign-in states, which AGT-147 then replaces.
- The exit pair of row 8 would be played on Claude. Sign in with ChatGPT ends on its own pair, on terra (AGT-151), so the pair would be played twice within weeks.
- Rows 6 and 8 wait on things only Stas can do: the Apple account, an evening at his Mac for CON-20, an evening for the pair.

Yan's sweep of the milestone (2026-11-27, main bddb234): 18 tasks, 9 open, none stale by 14 days; "it can close on Stas's word if the decision record is in the same PR"; the close moves the DMG, signing, the Apple enrolment, the Mac report, the lobby and one exit pair into Sign in with ChatGPT, about CON-21 (M) plus CON-20 (S) and about 2 hours of Stas at the Mac.

## Options

### A. Close now on the iPhone play; the DMG, the pair and the lobby go to Sign in with ChatGPT
- Pro: nothing is built on Claude that the next milestone throws away; the lobby and the pair are done once.
- Pro: the player-facing goal Stas set for the weekend, the Mill on his iPhone, is reached.
- Con: the milestone closes with rows 6 and 8 not met and row 9 unrecorded, so nothing proves the app starts the table by itself on another Mac.
- Con: it is the first close with no pair at all (0043), and Sign in with ChatGPT grows by the DMG and the Mac report.

### B. The exit as written
- Pro: the app is proven as a package before the model under it changes, so a later failure has one cause, not two.
- Con: needs the Apple account, the DMG, the lobby on Claude and two evenings of Stas, for a lobby and a pair that are replaced within weeks.

### C. Keep Glass Table open and start Sign in with ChatGPT beside it
- Pro: no exit row is waived.
- Con: two open milestones, against the one-at-a-time rule, and the Claude lobby and pair are still owed.

## Decision

A (Stas). Glass Table is done on 2026-11-28 without passing its exit. Decision 0043's pair is waived for this milestone: there was no build to pair on. The next pair is AGT-151's, and it covers what row 8 would have.

## Consequences

- `tasks/glass-table/milestone.md` is `done`. AGT-155 is done on Stas's word, and its file says what was not recorded. AGT-145 is `wont-do`.
- Moved to `tasks/sign-in-with-chatgpt/`: AGT-144 (the lobby), AGT-141 (its two open items), CON-20 (the report from Stas's Mac) and CON-21 (the signed DMG). The sign-in scope as accepted names no DMG, so taking these in needs a scope amendment Stas accepts; the sign-in thread drafts it with its system design and rewrites the rows after his yes.
- Moved to `tasks/registries/`: CON-26 and CON-27 (pictures and faces, P2). Moved to `tasks/backlog/`: AGT-143 (the moments, the road lens).
- Not proven by any run or test: the app starting the bundled table with no checkout; a real phone locked and unlocked in a fight; the faces on the shell's own card.
- `docs/roadmap.md` carries the close in the Glass Table row only; its dates and its cost lines for Glass Table and Sign in with ChatGPT are stale and wait for Yan's `roadmap`.
- Whether the client and the server are split apart (Stas, same message) is decided in the Sign in with ChatGPT system design, not here.

## Revisit when

The signed app fails to start the table on a Mac that has no checkout, or a friend's first evening with it fails on something the pair would have caught. Then the next milestone does not close without its pair.

## Sources

- Thread "Build the iPhone app in SwiftUI", 2026-11-27 23:16Z to 23:22Z: the open rows, the card, Stas's answer.
- `tasks/glass-table/milestone.md`; SwiftUI shell design `docs/design/swiftui-shell-design.md`; decisions [0043](0043-demo-acceptance-two-runs.md), [0091](0091-table-moves-to-chatgpt.md), [0093](0093-swiftui-shell-over-the-page.md).
- Earlier closes that did not pass the exit as written: [0056](0056-m10-closed-on-cheap-run.md), [0082](0082-m12-merged-without-a-passed-exit-pair.md).
