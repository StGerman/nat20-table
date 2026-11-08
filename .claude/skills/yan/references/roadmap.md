# roadmap: docs/roadmap.md

Goal: Stas sees the order of work, each gate, what waits on him and what each milestone cost, in three minutes.

## Read

- The milestone table in `TASKS.md`; accepted records in `docs/decisions/README.md`; the scope files in `docs/scope/`.
- Open PRs and open decision cards the caller names, for "Waiting on Stas".
- For the Delivery row of a closed milestone: its scope PR's and exit decision's dates, `git log origin/main` for its PRs, and in nat20-runs `runs/<id>/` the runs whose `run.json` `build.table_commit` is a commit of that milestone: `api_equivalent_usd` summed over `usage.jsonl`, and `started_at` to `ended_at` for runs whose `seats.human` is set.

## The file

```
# Roadmap

As of YYYY-MM-DD.

## Order
| # | Milestone | Gate (one line) | Status |

## Waiting on Stas
- one line each: PR to review, card to answer, run to play

## Delivery
| Milestone | Days scope→exit | PRs | Exit pairs played/passed | Run cost USD | Stas at the table, h |
```

Order comes from Stas's decisions only; when a thread or memory says otherwise, the accepted decision wins and you flag the conflict. A milestone with no spec is one line with "no spec yet". Done milestones collapse to one line each at the bottom of Order.

The first Delivery row is the baseline (Milestone 11). Never rewrite a past row; add a note. For a milestone just closed, end the page with its ratio to the baseline on each column and the one cheapest saving for the next milestone, in the same units.
