# roadmap: docs/roadmap.md

Goal: Stas sees the order of work, each gate and what waits on him in three minutes.

## Read

- The milestone table in `TASKS.md`; accepted records in `docs/decisions/README.md`; the scope files in `docs/scope/`.

## The file

```
# Roadmap

As of YYYY-MM-DD.

## Order
| # | Milestone | Gate (one line) | Status |
(done milestones collapse to one line each at the bottom)

## Waiting on Stas
- one line each: PR to review, card to answer, run to play

## Delivery
| Milestone | Days scope→exit | PRs | Review rounds | Exit pairs played/passed | Run cost USD | Note |
(the first row is the baseline)
```

Order comes from Stas's decisions only; when a thread or memory says otherwise, the accepted decision wins and you flag the conflict. A milestone with no spec is one line with "no spec yet".
