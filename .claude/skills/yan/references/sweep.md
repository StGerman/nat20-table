# sweep: TASKS.md against main

Goal: every status in TASKS.md is true on main today, and nothing dead sits in stock.

## Read

- `TASKS.md` at the repo root. If it is not there yet (before CON-1), the caller names the working copy; read that one and write the result at the repo root. Never edit the working copy.
- `git log origin/main --since=<oldest open row's date> --format='%h %ad %s' --date=short`: our PR titles end in `(#N)`.
- Open PRs: `gh api -X GET repos/<owner>/nat20-table/pulls -f state=open --jq '.[]|[.number,.title,.updated_at]'`, and the same for the fork and the runs repo when a row's Dest is Fork.
- A PR a row cites: `gh api -X GET repos/<owner>/<repo>/pulls/<n> --jq '[.state,.merged_at]'`.

## Classify every open row (todo, partial)

| Finding | Move |
| --- | --- |
| Its PR merged and the row's own "left:" list is empty or already merged | done (`done (table #N, merged YYYY-MM-DD)`), apply |
| Its PR merged but something named is still left | partial, rewrite the status to say only what is left and who owes it, apply |
| No commit and no PR activity in 14 days | dead stock: ask (close as won't do with a reason, or name the owner) |
| It belongs to a closed milestone and nobody needs it now | ask: won't do with the reason, or move to a later milestone |
| Waits on Stas (his settings, his Mac) | keep; list in "waiting on Stas" |

Also list: open PRs with no row (Dependabot excepted), and milestones whose last row closed and whose exit criterion holds (propose marking them done with the date; never mark a milestone done that has no exit evidence).

## Move closed rows

Rows with status done or won't do move to `docs/tasks-done.md` unchanged, under the same section headings, so every id cited in a decision, PR or memory stays searchable. The dated change log moves there too. TASKS.md keeps: how to read it, the milestone table, open rows, and one line pointing to `docs/tasks-done.md`.

## Page

1. One line: open rows before → after, file size before → after.
2. The table: id · status now · status proven · evidence · move (applied or asked).
3. Waiting on Stas, one line each.
4. Numbered questions, each with a recommended answer.
