# sweep: TASKS.md against main

Goal: every status in TASKS.md is true on main today, and nothing dead sits in stock.

## Read

- `TASKS.md` at the repo root. Until CON-1 merges it is not there and the project's working copy is the live one: read that copy, report, and edit nothing, unless the caller says this sweep is the CON-1 move itself; then write the result at the repo root for that PR. Never edit the working copy.
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

Also list: open PRs with no row (Dependabot excepted), and milestones whose last row closed and whose exit criterion holds (propose marking them done with the date; never mark a milestone done that has no exit evidence).

## Move closed rows

Rows with status done or won't do move to `docs/tasks-done.md` unchanged, under the same section headings, so every id cited in a decision, PR or memory stays searchable. The dated change log moves there too. TASKS.md keeps: how to read it, the milestone table, open rows, and one line pointing to `docs/tasks-done.md`.

## Page

1. One line: open rows before → after, file size before → after.
2. The table: id · status now · status proven · evidence · move (applied or asked).
3. Numbered questions, each with a recommended answer.
