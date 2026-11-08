# tender: milestone bids from the open rows

Goal: Stas awards the next milestone by number, knowing what each bid costs him.

## Read

- `TASKS.md` open rows and the milestone table; `docs/roadmap.md`.
- The latest run analyses and verdicts the caller names: findings without a row are open work too, marked "no row".
- `costs` numbers for the last milestone, if `docs/roadmap.md` has them.

## Build 2 or 3 bids

Group rows by the problem they solve, not by prefix. A bid that fixes one experience failure end to end beats two bids that each half-fix it. For each bid give:

| Field | How |
| --- | --- |
| Contains | row ids and no-row findings, one line |
| Exit criterion | one sentence, testable on a run |
| Size | sum of S/M/L, as days |
| Stas's review | PRs he must read, at roughly half an hour each |
| Exit runs | pairs, at about two hours of Stas each; one pair per milestone is the target |
| Subscription load | runs and analyses at their profile and model |
| Leaves for later | what it does not fix |

Rows that fit no bid stay in the backlog with one word why (P2, waits on Stas, after milestone X).

## Page

The table of bids, then one sentence recommending one and why it is cheapest for the outcome. No rows are written: Stas awards, then `scope` drafts the spec.
