# Roadmap

As of 2026-11-21, main d63e333 (table #461 merged). Kept by Yan (decision 0065); numbers from `git log origin/main`, `gh api`, nat20-runs and Yan's Glass Table plan of 2026-11-21 (scope `docs/scope/glass-table-scope.md` §7). The page of 2026-11-11 (main 4c57c7e) is in `git log -- docs/roadmap.md`.

## Order

| # | Milestone | Gate (one line) | Status |
|---|---|---|---|
| — | Tech talk demo (December, date not set) | three rehearsals and one recorded full run on the stage SHA; a dress rehearsal the day before the talk | open: CON-19, AGT-135, AGT-136 done; rows 4 to 6 are Stas's at his Mac. The talk moved off 2026-12-02 with no date; Stas picks it (2026-11-21 08:36Z). It no longer gates Glass Table |
| — | Glass Table (the Mac app) | one pair on one signed DMG: the all-AI half from its bundled binaries, then Stas in the app (scope §4, 8 rows) | open: scope, design, 0090 merged (table #459); rows merged (table #461); first (Stas 2026-11-21 07:29Z); code starts on Stas's go, earliest 2026-11-22, with the Apple account active; spike CON-20 first. Exit pair 11-25 to 11-29 from a go on 11-22 (calendar below) |
| — | Sign in with ChatGPT (a second model backend) | one pair on one build, both halves on terra through SIWC, the all-AI half within 50% of a Plus five-hour window (scope §4, 7 rows) | design accepted by Stas 2026-11-21 10:59Z, Narrator on terra; scope, 0091 and rows AGT-147 to AGT-152 in table #467; AGT-147 moved in from the backlog at P1. Right after Glass Table (Stas 2026-11-21 08:34Z; "before «Камень A»" is my reading of «сразу после»). Cost (scope §5): 9 to 12 thread-days, uncalibrated; Stas about 1.5 h review, 15 min sign-in, one evening at his Mac for the bench and Langfuse runs, one exit half; runs on his ChatGPT Plus, judge about 0.40 USD a run |
| — | «Камень A» (the post on the flats) | scope and design in table #417, not merged | after Sign in with ChatGPT (reading above); after Glass Table (Stas 2026-11-21 07:29Z). Exit 12-07 to 12-17 from a go on 11-22 (calendar below); its `escort_dismissed` PR is built for two seats, +5 USD and 10 min of Stas |
| — | Arachas plus glue | no spec yet; inputs shelved by the M13 scope §3 | after «Камень A»: starts 12-07 to 12-17; not priced, no spec |
| — | The Silent Mill plus glue | no spec yet | after Arachas (Stas 2026-11-07 19:34Z); not priced, no spec |
| — | Allies in fights («Свои в бою») | — | closed 2026-11-20, rows 10 and 11 not passed (Stas); row 10 moved to AGT-133 |
| 13 | Dramaturg mechanism | — | done 2026-11-16, pair passed first time on b7e737d |
| 12 | Not a passenger | — | closed 2026-11-14, not done (0082) |
| 11 | Word on the road | — | done 2026-11-08 (0066) |
| 10 | Speed and polish | — | done 2026-11-01 (0056) |
| 9 | Living world | — | done 2026-11-06 (0060) |
| 7 | Demo acceptance | — | done 2026-11-05 (0059) |
| 6 | Agents at the table | — | done 2026-10-27 |
| 1–5 | Fighter vs Goblin, repo split, exploration, the party, monsters | — | done 2026-10-16 to 2026-10-23; UPS-1 still open |
| 8 | Upstream proposal | — | dropped 2026-10-18 (0023) |

Order source: Stas, 2026-11-21 07:29Z, on the plan's card (scope header), and 08:34Z in the "Sign in with ChatGPT" thread; the plan recommended «Камень A» first (bid 2); the cost of the chosen order is in the «Камень A» row. No accepted decision record carries this order; the Glass Table scope carries the first part, and nothing on main carries the second.

## Backlog milestones

Not ordered, no spec, no number unless its bullet gives one (Stas, review of table #337, 2026-11-08).

- The player as a merchant (maybe the shop that `docs/scope/living-world-scope.md` §4 and decision 0057 number M17)
- Telegram
- A smarter table
- Stake before the roll, working number M20: design `docs/design/stake-before-the-roll.md` (Proposed), decision 0083; no rows until Stas takes it out of the backlog (2026-11-15 22:06Z)

## Waiting on Stas

- Your go for Glass Table code: the start of every date below. The 12-03 start in scope §7 lost its reason when the talk moved (2026-11-21 08:36Z).
- Apple Developer enrolment (99 USD a year, about 15 min, then Apple's review, which is not ours): gates the spike CON-20. Every day it is late moves every date below by a day.
- The spike evening at the Mac, 60 to 90 min, on the go day (CON-20).
- The talk's date, and whether it shows the app (answer under Calendar).
- The core pin freeze at a17ac1f "until after the talk" (tech-talk milestone): keep it until a December date, or lift it now.
- Developer ID and notary key as repository secrets for the `release` workflow (CON-21; signing place answered 2026-11-21 07:46Z).
- The "Sign in with ChatGPT" PR, table #467 (scope, 0091, rows AGT-147 to AGT-152): review and merge, part of its 1.5 h; design accepted 2026-11-21 10:59Z. Later: 15 min to sign in on your Mac, one exit half after the all-AI half passes.
- Tech talk rows 4 to 6: the traced run, three rehearsals and the recorded run, the dress rehearsal the day before the talk.
- table #417 («Камень A» scope, design, 0087, 0088): open since 2026-11-15, last update 2026-11-20; 14 days untouched on 2026-12-04. It waits behind Glass Table and Sign in with ChatGPT by your order; its review can run beside them so its rows are ready by about 12-03 to 12-10.
- nat20-runs #3 (flag answers for the Mill run 20-38-39): untouched since 2026-11-03, 18 days. Merge or close.
- UPS-1 (P0, since 2026-10-19): squash merge still on in the fork; Dependabot alerts not readable from a session.

## Calendar from your go

Start G = the day you say go, the Apple account is active and table #461 is merged; earliest 2026-11-22. Calibration as in the plan (scope §7); scope acceptance (1 to 3 of the plan's 4 to 9 days) is already spent, so the rest is 4 to 7 days.

| Step | Low (G = 11-22) | High |
|---|---|---|
| Spike CON-20 on your Mac, one evening | 11-22 | 11-23 |
| Stack AGT-140 to AGT-146, CON-21 built; one review session, two evenings; DMG installed by you | 11-24 | 11-27 |
| Exit pair on one DMG, AI half first | 11-25 | 11-29 (11-30 with one failed pair) |
| Sign in with ChatGPT, 9 to 12 thread-days after (scope §5, uncalibrated), its scope PR merged meanwhile | 12-04 | 12-12 |
| «Камень A», 3 to 5 days after its rows (its scope §7), #417 reviewed meanwhile | 12-07 | 12-17 |
| Arachas, then the Mill | start 12-07 | start 12-17 |

Not priced: a spike that fails (Electron fallback, decision 0090), and Apple's review time.

**The talk date, if it shows the app.**
- Low, 11-28: the pair passed on 11-25, with three rehearsals and the dress rehearsal on that DMG in 2 to 3 evenings.
- High, 12-03: the pair passed by 11-30, plus the same margin.
- Both depend on: the go and an active Apple account on 11-22; the spike passing at the first try; one review session; the pair passing first time.
- Without a passed pair, the DMG exists from 11-24 to 11-27. It can show a scripted scene played live in the app (CON-21's check) and the recorded bench fight replayed in the page (AGT-143). A live `play:card` fight started from the app is in no row.
- On any date, independent of Glass Table: the merged demo. The `night_wolves` fight is played live with `play:card` at the Ink seat in Russian on the release tagged `play-2026-12-02`, with the full run prerecorded. It needs only your rows 4 to 6, about 4 h.

## Delivery

| Milestone | Days scope→exit | PRs | Exit pairs played/passed | Run cost USD | Stas at the table, h |
|---|---|---|---|---|---|
| 11 Word on the road (baseline) | 2.1 | 27 | 3/1 | 35.45 | 1.09 |
| 12 Not a passenger (in progress, 2026-11-11) | 2.98 so far | 4 of 17 planned | 0/0 | 0.00 | 0.00 |
| 13 Dramaturg mechanism | 3.2 | not counted | 1/1 | 18.17 | 0.40 |
| Allies in fights | 6.5 to 7.1 | not counted | 1/0 | 22.13 | 0.66 |
| Glass Table (plan, 2026-11-21) | 4 to 7 (8 with a failed pair) from your go | 10 planned | target 1/1 | 21 to 26 | 0.40 to 0.67 |

- M12, note added 2026-11-21: closed 2026-11-14 not done (0082), 5.5 days from table #336; no exit pair passed. The row above stays as written on 2026-11-11.
- M13: scope table #348 merged 2026-11-13 15:16Z to run 2 on 2026-11-16 (~20:50Z): 3.2 days. Pair on b7e737d: 11.08 AI + 7.09 Stas USD; Stas 23.7 min.
- Allies: scope table #365 merged 2026-11-13 20:48Z to the close on 2026-11-20 (time of day not in the record): 6.5 to 7.1 days. Pair: 13.99 AI (PASS) + 8.14 Stas USD; row 10 failed in Stas's half; Stas 39.6 min.
- PRs for M13 and Allies are not counted in this pass: the stacks share a window (table #411 to #441) and need `GET commits/<sha>/pulls` per row to split; owed at the next `roadmap`.
- Glass Table, plan: Stas 6.3 to 7.9 h in total (review 4.1 to 5.1, at the Mac 2.2 to 4.2); build 148 to 205 USD; runs 39 to 48 USD with one failed pair.

Against the baseline: M13 days 1.5, runs 0.51, Stas 0.37, pairs passed first time. Allies days 3.1 to 3.4, runs 0.62, Stas 0.61, its human half failed. Glass Table from your go: days 1.9 to 3.3, 3.8 with a failed pair (misses the 0.5 target), PRs 0.37, runs 0.59 to 0.73, Stas at the table 0.37 to 0.61.

Cheapest saving for Glass Table: the spike CON-20 first. It finds a shell that does not hold on day 1 for S (11 USD) and one evening; found in CON-21 it costs an evening (1 to 1.5 h of Stas), a redo (21 to 40 USD) and 1 to 3 days per try.

## Amendments (proposed; rules silent, followed here)

- A milestone gets a number only when its `milestone.md` in `tasks/` carries a `number` (decision 0085); later work is listed unnumbered, in Stas's order, with its source. Why: numbers in accepted records (the shop as M17) have drifted from the order.
- "PRs" counts merged table and core PRs that carry the milestone's rows, its scope PR included; fixes stacked on top after the exit pair count to the next milestone. Why: one rule for every row.
- "Run cost" counts every run whose `build.table_commit` is in a milestone PR, failed runs and lone halves included. Why: stack builds are squashed away and never reach main.
- "Days scope→exit" ends at the exit record; with none, at the last merge of the milestone's PRs, or at the close by Stas. Why: Allies and M12 closed without a passed exit.
- A pair counts as played once its all-AI half has run. Why: M11 pair 2 cost 8.82 USD with no human half.
- For a milestone that ships a packaged app, "the same build" (0043) means the same signed package, and the AI half runs from its bundled binaries. Why: a checkout run does not test the host the human plays on. Answered yes by Stas for Glass Table (scope §9 question 6); not yet a general rule.
- A spike that merges no code may run beside the open milestone when Stas names its row independent. Why: it retires risk before the build is priced as firm. Not used: Stas chose Glass Table first, so CON-20 runs in its own milestone.

## Amendments (proposed; not applied, wait on Stas)

- "Waiting on Stas" lists only asks with no open PR of ours. Why: the section goes stale on every merge. Not applied: `references/roadmap.md` lists "PR to review"; this page lists table #417.
- A sweep re-asks an open row outside every milestone as dead stock only when a milestone closes, once Stas has kept it at a sweep. Why: asking again costs his review minutes for no new fact.
