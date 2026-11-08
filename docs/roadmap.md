# Roadmap

As of 2026-11-08, main 3472982. Kept by Yan (decision 0065); numbers from `git log origin/main`, `gh api` and nat20-runs `master` 2e65a5d.

## Order

| # | Milestone | Gate (one line) | Status |
|---|---|---|---|
| 12 | Not a passenger: phase 1 MAP-15, MAP-17; phase 2 Own move, the readable table (AGT-97, AGT-98, AGT-94 with AGT-76, AGT-13 partial, MAP-14), ENG-21, ENG-40..42 and a Plain or Fireside voice flag (Stas 2026-11-08) | Proposed: Vera (fallback) asks about no engine line in a DM narration sample; one own move decides a card in the played run; Stas plays only after the all-AI half on the same build has passed (0065); the voice comparison reported, not gated | next; scope PR being written; phase 1 rows can start now |
| — | Dramaturg mechanism: the engine carries the story from one quest to the next. Its other half, the role, is done: Zoya, table #328 | no spec yet; input: the dramaturg design of 2026-11-07, carriers A (a scene's `remember`) and B (`if`/`unless` with a `problem` block), quests as `kind: errand`, fronts and clocks | after 12 (Stas in chat 2026-11-07 19:34Z, "the dramaturg whole"; no record) |
| — | Arachas plus glue | no spec yet | after the Dramaturg mechanism (same) |
| — | The Silent Mill plus glue | no spec yet | after Arachas (same) |
| — | Later, unordered: the player as merchant; Telegram; a smarter table | no spec yet | not ordered |
| 11 | Word on the road | — | done 2026-11-08: pair 3 on 2294ef6 PASS and PASS; table #299 to #325 merged 21:00Z; no exit record |
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

## Waiting on Stas

- M12 scope PR (being written): award the gate above, the pre-flight rule and the phase order.
- This PR: the roadmap itself, with the M11 baseline and five amendments.
- nat20-runs #3: your flag answers for the Mill run 20-38-39, open since 2026-11-03. Merge or close.
- Decisions 0061, 0062, 0064 still say "Proposed (accepted when Stas merges ...)", and table #295, #296 and #326 merged. A status-only edit in the M12 scope PR, unless something is missing.
- UPS-1 (P0, open since 2026-10-19): the fork still allows squash merge (repos API, 2026-11-08; rebase is off). One setting.
- Milestone 11 has no exit record (M7, M9 and M10 have 0059, 0060 and 0056). Question 1 in the thread.

## Delivery

| Milestone | Days scope→exit | PRs | Exit pairs played/passed | Run cost USD | Stas at the table, h |
|---|---|---|---|---|---|
| 11 Word on the road (baseline) | 2.1 | 27 | 3/1 | 35.45 | 1.09 |

- Days: table #298 (scope §8, design, 0063) merged 2026-11-06 18:08Z; the last M11 merge, table #325, was 2026-11-08 21:00Z: 2.12 days. Stas accepted the pair at 20:51Z (TASKS row 11).
- PRs: #298 plus the 26 stack PRs #299 to #325 (#301 never existed). #329 and #330 are post-M11 by their rows. No core PRs; nat20-runs #6.
- Commits mapped to M11 with `GET commits/<sha>/pulls`: be5e650 is in #321 (pair 1); 238c99b and 2294ef6 are in #325 (pairs 2 and 3).
- Runs, `api_equivalent_usd` summed over `usage.jsonl`: pair 1 7.74 + 5.87, both FAIL; pair 2 8.82, AI FAIL, human half not played; pair 3 7.85 + 5.17, both PASS.
- Stas, `started_at` to `ended_at` where `seats.human` is set: 39.1 min (14-55-35, started 1 min after its AI half's FAIL was uploaded) + 26.5 min (20-11-16).
- Not counted: `usage.jsonl` covers in-game agents only. It leaves out the Claude Code threads (coordinator, the stack's builders, reviews, run analyses, Vera and Zoya), CI minutes, and Stas's review hours on 27 PRs and the flag verdicts. API-equivalent, paid from the subscription (0036).

Milestone 11 against the baseline: 1.0 on each column (it is the baseline). Target for M12 (0065, half of each): at most 1.06 days, 1/1, 17.73 USD and 0.55 h.

Cheapest saving for M12: Stas plays only after the all-AI half on the same build has passed (0065, into the M12 scope). Applied to M11 it saves 0.65 h of Stas and 5.87 USD (pair 1's human half), at 0 PRs. A pair that passes the first time costs about 13.02 USD, 0.37 of the baseline.

## Amendments (proposed; rules silent, followed here)

- A milestone gets a number only when TASKS.md § Milestones has its row; later work is listed unnumbered, in Stas's order, with its source. Why: numbers in accepted records (the shop as M17, scope §4 and 0057) have drifted from the order.
- "PRs" counts merged table and core PRs that carry the milestone's rows, its scope PR included; fixes stacked on top after the exit pair count to the next milestone. Why: one rule for every row, so ratios compare like with like.
- "Run cost" counts every run whose `build.table_commit` is in a milestone PR (`GET commits/<sha>/pulls`), failed runs and lone halves included. Why: stack builds are squashed away and never reach main.
- "Days scope→exit" ends at the exit record; with none, at the last merge of the milestone's PRs. Why: M11 has no exit record.
- A pair counts as played once its all-AI half has run. Why: pair 2 cost 8.82 USD with no human half.
