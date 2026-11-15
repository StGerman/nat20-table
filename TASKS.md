# Task list (TASKS.md)

The tasks live one per file under [`tasks/`](tasks/), an OKF bundle with a folder per milestone (decision 0085). This file holds the legend and the rules only, so a PR has no reason to edit it.

## Where things are

| What | Where |
|---|---|
| An open or closed task | `tasks/<folder>/<ID>.md`; the folder is a milestone or `backlog` |
| A milestone: exit criterion, tasks, status | `tasks/<folder>/milestone.md` |
| Milestones 1 to 11, rows closed before 2026-11-15, the old change log | [`docs/tasks-done.md`](docs/tasks-done.md), frozen |
| Order, gates and cost per milestone | [`docs/roadmap.md`](docs/roadmap.md) |

```bash
npm run tasks                    # open tasks, per folder
npm run tasks -- --all           # closed ones too
npm run tasks -- backlog         # one folder
npm run tasks -- next AGT        # the next free id for a prefix
npm run check:tasks              # what CI job `tasks` runs
```

## A task file

```markdown
---
type: Task
id: AGT-126
title: "A short name for the task"
pri: P1
dest: Ours
size: S
state: todo
area: "8. Agents, game loop, interface (all new)"
---

The gap: what is missing and what done means.

## Status

What is left, which PR did what, what it waits on.
```

| Key | Values |
|---|---|
| `id` | Prefix = area (API, ENG, MON, CHR, ITM, CHK, MAP, AGT, UPS, DAT, CON) and the next free number (`npm run tasks -- next <PREFIX>`); the file is named `<id>.md` |
| `pri` | **P0** a demo run cannot finish without it · **P1** needed to pass an acceptance criterion, a workaround exists · **P2** optional |
| `dest` | **Fork** = fork branch `demo` (our engine) · **Ours** = nat20-table. Rows that said **Up** or **Up?** carry it in `dest_was` |
| `size` | **XS** a few hours · **S** under 1 day · **M** 1 to 3 days · **L** over 3 days |
| `state` | `todo` · `partial` · `done` · `wont-do` (closed; the Status note says why) |
| `area` | The TASKS.md section the row came from; optional for new tasks |
| `gate_was` | The retired Gate value (Milestone 8, decision 0023): history only |

## Rules

- A PR that lands, opens or changes a task edits that task's file in the same PR (Rule 8).
- A closed task stays where it is with `state: done` or `wont-do`. It never moves to `docs/tasks-done.md`.
- A task changes milestone by `git mv tasks/<old>/<ID>.md tasks/<new>/`.
- A new milestone is a new folder with its `milestone.md` (`type: Milestone`, `title`, `description`, `state`: `open`, `done`, `closed` or `dropped`). When its exit criterion holds, its `state` becomes `done` and its Status gives the date.
- No change log and no committed index. The PR title and `git log -- tasks/` are the history; `npm run tasks` is the index.
