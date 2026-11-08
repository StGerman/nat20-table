# costs [<milestone>]: delivery numbers against the baseline

Goal: "twice as cheap and twice as fast" is a measured claim, and the next milestone gets its one cheapest saving.

## Measures and where they come from

| Measure | Source |
| --- | --- |
| Days from scope to exit | the scope PR's `merged_at` → the exit decision's date |
| PRs merged for the milestone | `git log origin/main` titles naming its rows, plus the stack |
| Review rounds | per PR: reviews and review comments (`gh api -X GET repos/<o>/<r>/pulls/<n>/reviews`, `/comments`) |
| Exit pairs played per pass | the milestone's exit decision and the run analyses |
| Run cost | sum of `api_equivalent_usd` in each run's `usage.jsonl` (nat20-runs `runs/<id>/`) |
| Stas's hours | his runs' `started_at` → `ended_at` in `run.json`, plus about half an hour per PR he reviewed |
| Subscription load | runs, analyses and reviews per milestone, by model and effort (`usage.jsonl` `model`, `effort`) |

The baseline is the first milestone measured (Milestone 11). Keep it in the Delivery table of `docs/roadmap.md`; never rewrite a past row, add a note.

## Page

1. The milestone's row, next to the baseline row, with the ratio for each measure.
2. Where the hours and the money went: the top three items.
3. The one cheapest saving for the next milestone, with its expected effect in the same units.
