# plan: how the work runs, and how long it takes

Goal: Stas knows when a milestone or task lands on main, what can run at once, and what will stop it.

## Read

- The rows, spec or design §PR list the ask names, and the open PRs with their stack (`base.ref`).
- History for calibration, from GitHub only: for the last milestone's PRs, `created_at` to `merged_at`, commits per PR, and Claude review comments (🟠 then 🟢) as review rounds. Thread time from first commit to PR open. Never from a thread's own estimate.

## Default assumptions (Stas, 2026-11-14)

1. One Claude review round per PR; the second round fixes correctness only.
2. Fold PRs that change the same files into one; scope is frozen once rows merge.
3. One Vera read, on the final player-facing lines.
4. Code by Sonnet medium; independent PRs run as parallel agents in worktrees, checks in the background.
5. Stas reviews and merges; his runs are evenings at the Mac.

Where an assumption breaks a rule in CLAUDE.md (1 and 2 against Rule 8 today), estimate with the rule as written, list the assumption as an amendment (rulebook §2), and give its saving in hours beside it until Stas accepts it.

## Build

| Field | How |
| --- | --- |
| Lanes | units that can run at once (thread, worktree agent, Stas), each a list of PRs |
| Critical path | the chain of PR → review → merge → build → run that sets the date |
| Hours | per step, low–high, from the history medians; Stas's hours separate |
| Waits | Stas's review queue and his run evenings, as calendar time, not work time |
| Risks | subscription limit stops (≈1.5 h each), review loops (rounds above 1), scope growth (PRs above the plan), a failed run; each with its cost in hours |

## Page

The lanes, the critical path as one line, the total as a range (work hours, Stas's hours, calendar days), the three biggest risks, and one sentence on what to cut if the range is too long. No rows are written.
