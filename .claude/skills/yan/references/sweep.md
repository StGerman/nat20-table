# sweep: the task list against main

Goal: every task state in `tasks/` is true on main today, and nothing dead sits in stock.

## Read

- `tasks/` (decision 0085): `npm run tasks` lists the open tasks per folder; each file is `tasks/<folder>/<ID>.md`, and the legend is `TASKS.md`.
- `git log origin/main --format='%h %ad %s' --date=short`: our squash-merged PR titles end in `(#N)`, so a row's PR is merged when its number appears here.
- Open PRs: `gh api -X GET --paginate repos/StGerman/nat20-table/pulls -f state=open --jq '.[]|[.number,.title,.updated_at]'`, and the same for `StGerman/nat20` when a row's Dest is Fork.
- A PR a row cites: `gh api -X GET repos/StGerman/<repo>/pulls/<n> --jq '[.state,.merged_at]'`.

## Classify every open row (todo, partial)

| Finding | Move |
| --- | --- |
| Its PR merged and the row's own "left:" list is empty or already merged | done (`done (table #N, merged YYYY-MM-DD)`), apply |
| Its PR merged but something named is still left | partial, rewrite the status to say only what is left and who owes it, apply |
| No commit and no PR activity in 14 days | dead stock: ask (close as won't do with a reason, or name the owner) |
| It belongs to a closed milestone and nobody needs it now | ask: won't do with the reason, or move to a later milestone |
| Waits on Stas (his settings, his Mac) | keep, status says so |

Unused stock: from the last milestone's runs in nat20-runs (`runs/<id>/`, chosen by `run.json` `build.table_commit`), count the event kinds in `session-log.jsonl` and the tools in `usage.jsonl`. A command, tool, card or deed that shipped and appears in none of them is unused stock: list it with what it costs to keep (files, tests) and the move (cut it, or a row that gets it played).

Also list: open PRs with no row (Dependabot excepted), and milestones whose last row closed and whose exit criterion holds (propose marking them done with the date; never mark a milestone done that has no exit evidence).

## Closed tasks

A task that closes keeps its file: set `state: done` (with the PR in its Status note) or `state: wont-do` (with the reason). Nothing moves to `docs/tasks-done.md`, which is frozen, and there is no change log (decision 0085). Run `npm run check:tasks` before you report.

## Page

1. One line: open tasks before → after.
2. The table: id · status now · status proven · evidence · move (applied or asked).
3. Numbered questions, each with a recommended answer.
