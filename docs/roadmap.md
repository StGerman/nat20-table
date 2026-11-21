# Roadmap

As of 2026-11-21, main 6c5e205 (table #459 merged 08:31Z). Kept by Yan (decision 0065); numbers from `git log origin/main`, `gh api`, nat20-runs and Yan's Glass Table plan of 2026-11-21 (scope `docs/scope/glass-table-scope.md` §7). The page of 2026-11-11 (main 4c57c7e) is in `git log -- docs/roadmap.md`.

## Order

| # | Milestone | Gate (one line) | Status |
|---|---|---|---|
| — | Tech talk demo (2026-12-02) | three rehearsals and one recorded full run on the stage SHA; dress rehearsal 12-01 | open: CON-19, AGT-135, AGT-136 done; rows 4 to 6 are Stas's at his Mac; core pin stays a17ac1f until after the talk |
| — | Glass Table (the Mac app) | one pair on one signed DMG: the all-AI half from its bundled binaries, then Stas in the app (scope §4, 8 rows) | open: scope, design, 0090 merged (table #459); rows 2026-11-21; first after the talk (Stas 2026-11-21 07:29Z); no code before 12-03; spike CON-20 first. Plan: exit 12-07 to 12-12 |
| — | Sign in with ChatGPT (a second model backend) | no spec on main; its design is Proposed in that thread, not accepted | right after Glass Table (Stas 2026-11-21 08:34Z: «Давай запланируем сразу после Glass Table»; "before «Камень A»" is my reading of «сразу после»). Waits on Stas accepting its design. That thread's estimate: 8 to 10 days, uncalibrated. Row AGT-147 (lobby part) |
| — | «Камень A» (the post on the flats) | scope and design in table #417, not merged | after Sign in with ChatGPT (reading above); after Glass Table (Stas 2026-11-21 07:29Z). Shift against the plan's bid 2: 4 to 9 days for Glass Table plus 8 to 10 for ChatGPT, 12 to 19 days, uncalibrated; its `escort_dismissed` PR is built for two seats, +5 USD and 10 min of Stas |
| — | Arachas plus glue | no spec yet; inputs shelved by the M13 scope §3 | after «Камень A»; moves 12 to 19 days later than under bid 2, as «Камень A» does |
| — | The Silent Mill plus glue | no spec yet | after Arachas (Stas 2026-11-07 19:34Z); same 12 to 19 day shift |
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

- Apple Developer enrolment (99 USD a year, about 15 min, then Apple's review): gates the spike CON-20. Enrolled before 12-02, Apple's wait runs during talk prep.
- The spike evening at the Mac, 60 to 90 min, from 12-03 (CON-20).
- Developer ID and notary key as repository secrets for the `release` workflow (CON-21; signing place answered 2026-11-21 07:46Z).
- The "Sign in with ChatGPT" design (Proposed, in its thread, not on main): accept it, and its scope with exit rows, before its rows are written; it is next after Glass Table.
- Tech talk rows 4 to 6: the traced run, three rehearsals and the recorded run, the dress rehearsal on 12-01.
- table #417 («Камень A» scope, design, 0087, 0088): open since 2026-11-15, last update 2026-11-20; 14 days untouched on 2026-12-04. It waits behind Glass Table by your order; keep it open or close it until then.
- nat20-runs #3 (flag answers for the Mill run 20-38-39): untouched since 2026-11-03, 18 days. Merge or close.
- UPS-1 (P0, since 2026-10-19): squash merge still on in the fork; Dependabot alerts not readable from a session.

## Delivery

| Milestone | Days scope→exit | PRs | Exit pairs played/passed | Run cost USD | Stas at the table, h |
|---|---|---|---|---|---|
| 11 Word on the road (baseline) | 2.1 | 27 | 3/1 | 35.45 | 1.09 |
| 12 Not a passenger (in progress, 2026-11-11) | 2.98 so far | 4 of 17 planned | 0/0 | 0.00 | 0.00 |
| 13 Dramaturg mechanism | 3.2 | not counted | 1/1 | 18.17 | 0.40 |
| Allies in fights | 6.5 to 7.1 | not counted | 1/0 | 22.13 | 0.66 |
| Glass Table (plan, 2026-11-21) | 4 to 9 (own work, from 12-03) | 10 planned | target 1/1 | 21 to 26 | 0.40 to 0.67 |

- M12, note added 2026-11-21: closed 2026-11-14 not done (0082), 5.5 days from table #336; no exit pair passed. The row above stays as written on 2026-11-11.
- M13: scope table #348 merged 2026-11-13 15:16Z to run 2 on 2026-11-16 (~20:50Z): 3.2 days. Pair on b7e737d: 11.08 AI + 7.09 Stas USD; Stas 23.7 min.
- Allies: scope table #365 merged 2026-11-13 20:48Z to the close on 2026-11-20 (time of day not in the record): 6.5 to 7.1 days. Pair: 13.99 AI (PASS) + 8.14 Stas USD; row 10 failed in Stas's half; Stas 39.6 min.
- PRs for M13 and Allies are not counted in this pass: the stacks share a window (table #411 to #441) and need `GET commits/<sha>/pulls` per row to split; owed at the next `roadmap`.
- Glass Table, plan: Stas 6.3 to 7.9 h in total (review 4.1 to 5.1, at the Mac 2.2 to 4.2); build 148 to 205 USD; runs 39 to 48 USD with one failed pair.

Against the baseline: M13 days 1.5, runs 0.51, Stas 0.37, pairs passed first time. Allies days 3.1 to 3.4, runs 0.62, Stas 0.61, its human half failed. Glass Table plan: days 1.9 to 4.3 (misses the 0.5 target), PRs 0.37, runs 0.59 to 0.73, Stas at the table 0.37 to 0.61.

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
