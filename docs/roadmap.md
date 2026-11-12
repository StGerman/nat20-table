# Roadmap

As of 2026-11-11, main 4c57c7e (table #341 merged 22:00Z). Kept by Yan (decision 0065); numbers from `git log origin/main`, `gh api` and nat20-runs `master` 2e65a5d.

## Order

| # | Milestone | Gate (one line) | Status |
|---|---|---|---|
| 12 | Not a passenger: phase 1 MAP-15, MAP-17; phase 2 Own move, the readable table (AGT-97, AGT-98, AGT-94 with AGT-76, AGT-13 partial, MAP-14), ENG-21, ENG-40..42, a Plain or Fireside voice flag and one language at the seat (0067) (Stas 2026-11-08) | Vera (fallback) asks about no engine line in a DM narration sample; one own move decides a card in each run; no card before its narration; the Russian seat shows no English line; Stas plays only after the all-AI half on the same build has passed (0065); the voice comparison reported, not gated | open: scope accepted (table #336); phase 1 done (table #338); design accepted (table #339); rows on main (table #341); phase 2: 0 of 13 PRs merged, 0 open |
| — | Dramaturg mechanism: the engine carries the story from one quest to the next. Its other half, the role, is done: Zoya, table #328 | no spec yet; input: the dramaturg design of 2026-11-07, carriers A (a scene's `remember`) and B (`if`/`unless` with a `problem` block), quests as `kind: errand`, fronts and clocks | after 12 (Stas 2026-11-07 19:34Z, "the dramaturg whole"; 0066 in table #336) |
| — | Arachas plus glue | no spec yet | after the Dramaturg mechanism (same) |
| — | The Silent Mill plus glue | no spec yet | after Arachas (same) |
| 11 | Word on the road | — | done 2026-11-08: pair 3 on 2294ef6 PASS and PASS; table #299 to #325 merged 21:00Z; record 0066 in table #336 |
| 10 | Speed and polish | — | done 2026-11-01 (0056) |
| 9 | Living world | — | done 2026-11-06 (0060) |
| 7 | Demo acceptance | — | done 2026-11-05 (0059) |
| 6 | Agents at the table | — | done 2026-10-27 (Stas 2026-11-08, table #334) |
| 5 | Monsters | — | done 2026-10-23 |
| 4 | The party | — | done 2026-10-21 |
| 3 | Exploration and checks | — | done 2026-10-18 |
| 2 | Repo split and contract v1 | — | done 2026-10-17 (Stas 2026-11-08, table #334); UPS-1 still open |
| 1 | Fighter vs Goblin Warrior | — | done 2026-10-16 |
| 8 | Upstream proposal | — | dropped 2026-10-18 (0023) |

## Backlog milestones

Not ordered, no spec, no number (Stas, review of table #337, 2026-11-08).

- The player as a merchant (maybe the shop that `docs/scope/living-world-scope.md` §4 and decision 0057 number M17)
- Telegram
- A smarter table

## Waiting on Stas

- nat20-runs #3: your flag answers for the Mill run 20-38-39, open since 2026-11-03, no activity since; dead stock on 2026-11-17. Merge or close.
- UPS-1 (P0, open since 2026-10-19): the fork still allows squash merge (repos API, 2026-11-11; rebase is off). One setting.
- UPS-24 (geometry stack, core): the Rule 9 30-day clock from core #26 and #27 (2026-10-20) runs out on 2026-11-19; adopt it or give the row a hold reason (sweep 2026-11-11, question 2).
- Allies in fights, option A (ENG-44, MAP-20) and the judge check (AGT-104), after the M12 exit pair: place them inside the Dramaturg mechanism (table #348) or after it (each is its own PR either way); and confirm the judge check is counted, not gated.

## Delivery

| Milestone | Days scope→exit | PRs | Exit pairs played/passed | Run cost USD | Stas at the table, h |
|---|---|---|---|---|---|
| 11 Word on the road (baseline) | 2.1 | 27 | 3/1 | 35.45 | 1.09 |
| 12 Not a passenger (in progress, 2026-11-11) | 2.98 so far | 4 of 17 planned | 0/0 | 0.00 | 0.00 |

- Days: table #298 (scope §8, design, 0063) merged 2026-11-06 18:08Z; the last M11 merge, table #325, was 2026-11-08 21:00Z: 2.12 days. Stas accepted the pair at 20:51Z (TASKS row 11).
- PRs: #298 plus the 26 stack PRs #299 to #325 (#301 never existed). #329 and #330 are post-M11 by their rows. No core PRs; nat20-runs #6.
- Commits mapped to M11 with `GET commits/<sha>/pulls`: be5e650 is in #321 (pair 1); 238c99b and 2294ef6 are in #325 (pairs 2 and 3).
- Runs, `api_equivalent_usd` summed over `usage.jsonl`: pair 1 7.74 + 5.87, both FAIL; pair 2 8.82, AI FAIL, human half not played; pair 3 7.85 + 5.17, both PASS.
- Stas, `started_at` to `ended_at` where `seats.human` is set: 39.1 min (14-55-35, started 1 min after its AI half's FAIL was uploaded) + 26.5 min (20-11-16).
- Not counted: `usage.jsonl` covers in-game agents only. It leaves out the Claude Code threads (coordinator, the stack's builders, reviews, run analyses, Vera and Zoya), CI minutes, and Stas's review hours on 27 PRs and the flag verdicts. API-equivalent, paid from the subscription (0036).
- M12, in progress: from table #336 (scope) merged 2026-11-08 22:35Z to table #341 (rows) merged 2026-11-11 22:00Z, 2.98 days, 1.40 of the baseline's whole 2.12, before any phase 2 PR. Target 1.06 days is already spent.
- PRs merged: 4 of the plan's 17: docs table #336, #339, #341 (3, against scope §9 answer 4's 1), phase 1 table #338. Left: 13 phase-2 PRs of design §9 (11 table, core PR 9, its pin PR 10). 17 is 0.63 of the baseline's 27; target 13.5.
- Review wait, last commit to merge: table #338 2.88 days (a91448c 2026-11-09 00:45Z), #339 2.80 days (7966d61 02:39Z), #341 0.001 days. From the last M12 commit (7966d61, 2026-11-09 02:39Z) to the first merge (#338, 2026-11-11 21:55Z), 2.80 of the 2.98 days had no commit: the constraint is Stas's review hours, not the threads.
- Runs: none on an M12 build in nat20-runs (`master` 2e65a5d, last commit 2026-11-08). Exit pair, run cost and Stas's hours start at 0.

Milestone 11 against the baseline: 1.0 on each column (it is the baseline). Target for M12 (0065, half of each): at most 1.06 days, 1/1, 17.73 USD and 0.55 h.

Cheapest saving for M12: Stas plays only after the all-AI half on the same build has passed (0065, into the M12 scope). Applied to M11 it saves 0.65 h of Stas and 5.87 USD (pair 1's human half), at 0 PRs. A pair that passes the first time costs about 13.02 USD, 0.37 of the baseline.

## Amendments (proposed; rules silent, followed here)

- A milestone gets a number only when TASKS.md § Milestones has its row; later work is listed unnumbered, in Stas's order, with its source. Why: numbers in accepted records (the shop as M17, scope §4 and 0057) have drifted from the order.
- "PRs" counts merged table and core PRs that carry the milestone's rows, its scope PR included; fixes stacked on top after the exit pair count to the next milestone. Why: one rule for every row, so ratios compare like with like.
- "Run cost" counts every run whose `build.table_commit` is in a milestone PR (`GET commits/<sha>/pulls`), failed runs and lone halves included. Why: stack builds are squashed away and never reach main.
- "Days scope→exit" ends at the exit record; with none, at the last merge of the milestone's PRs. Why: M11 had no exit record until 0066 (table #336), which keeps the last merge as its end.
- A pair counts as played once its all-AI half has run. Why: pair 2 cost 8.82 USD with no human half.

## Amendments (proposed; not applied, wait on Stas)

- "Waiting on Stas" lists only asks with no open PR of ours: decision cards, settings, runs to play, PRs in other repos (nat20-runs); our open table and core PRs live in GitHub's open-PR list. Why: the section went stale on three merges in a row (table #336, #337, #341), each a merge that edits nothing else here. Not applied: `references/roadmap.md` lists "PR to review" among the section's items. Today 0 table and core PRs are open, so this edit lists none either way.
- A sweep re-asks an open row outside every milestone as dead stock only when a milestone closes, once Stas has kept it at a sweep. Why: 22 such rows were kept on 2026-11-08 ("ок по всем"); asking again 3 days later costs his review minutes for no new fact. Not applied: `references/sweep.md` says ask; the 2026-11-11 sweep asks once, as one question.
