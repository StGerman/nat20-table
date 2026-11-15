# 0085. One file per task, a folder per milestone

- **Status:** Proposed (Accepted on merge)
- **Date:** 2026-11-15
- **Decided by:** Stas (decision card, 2026-11-15 21:56Z: "Файл на задачу (OKF)"), after he asked to stop the TASKS.md merge conflicts (07:14Z)

## Context

Almost every PR edits `TASKS.md`, and two open PRs nearly always conflict there. table #400 and #401 conflicted only on that file. Before this change, the last 25 commits to touch the file on main showed three hot spots:

1. All 25 appended a line to the end of the `## Change log`, so any two open PRs touched the same last line.
2. 15 of the 25 also appended the closed row to the end of a section of `docs/tasks-done.md` (AGT-121 and AGT-122 landed next to each other).
3. About 6 edited the one-line Milestone 12 row of the milestone table, about 2 KB long.

No rule asked for the change log. It repeated the PR titles and `git log`. No CI job read either file.

## Options

### A. Delete the change log only
- Pro: one XS PR, nothing else changes.
- Con: hot spots 2 and 3 stay.

### B. One file per milestone
- Pro: smaller files.
- Con: work in flight belongs to one milestone, so the conflicts move to that milestone's file. The change log and the done file stay shared.

### C. One file per task in OKF, a folder per milestone (chosen)
- Pro: a PR edits only the files of the tasks it touches, so two PRs conflict only when both touch the same task. A task changes milestone by a `git mv`. The format is plain Markdown with front matter: it greps, it diffs, and Yan reads and writes it as before.
- Con: about 50 files instead of one table, a small script for the overview, and a new CI job.

### D. GitHub issues
- Pro: no file conflicts at all.
- Con: Rule 8 and 0017 forbid it. A row no longer closes in the PR that lands it. Yan and the agents would read the plan over the API instead of with grep. About 70 documents cite row ids that would need mapping to issue numbers. The hardest of the four to undo.

## Decision

C. Each open task is `tasks/<folder>/<ID>.md`, an OKF v0.2 concept (`type: Task`) with flat front matter: `id`, `title`, `pri`, `dest`, `size`, `state` (`todo`, `partial`, `done`, `wont-do`; OKF's own `status` means lifecycle, so the task's state has its own key), `area` (its old TASKS.md section). The body holds the gap, and a `## Status` note when it has one. A folder is a milestone, with its `milestone.md` (`type: Milestone`: exit criterion, tasks, status), or `backlog/`.

Three rules keep the shared files out of PRs:

- A closed task stays in its file with `state: done` or `wont-do`. Nothing moves to `docs/tasks-done.md`, which is frozen with the rows and change log it held on 2026-11-15, plus the table of Milestones 1 to 11.
- No change log. The PR title and `git log -- tasks/` are the history.
- No committed index. `npm run tasks` prints the open tasks per folder (`-- --all` for closed ones too, `-- <folder>` for one), and `npm run tasks -- next AGT` gives the next free id.

## Consequences

- `TASKS.md` keeps only the legend and these rules, so PRs stop editing it.
- `tools/tasks/tasks.mjs check` runs in the new CI job `tasks`, which is part of `ci-ok`. It checks the front matter, that the file name matches the id, the enums, that no id is used twice, that no id reuses a closed row's id, and that each milestone folder has its `milestone.md`.
- Two PRs that both create the next id (`AGT-126.md`) conflict on purpose: the second one takes `next`.
- Rule 8 in CLAUDE.md, Yan's agent and skill references, and the Copilot instructions now name `tasks/`. 0017 holds in spirit (one task list in the repo, no issues) and is superseded in its form. 0065 §1, which moves closed rows into `docs/tasks-done.md`, is superseded.
- The ids stay the same, so every PR, decision and memory that cites `AGT-99` still finds it: in `tasks/` or in the frozen file.

## Revisit when

Two PRs conflict in `tasks/` on something other than the same task, or a real client for the plan (a board, Telegram) needs a different store.

## Sources

- Thread "Stop TASKS.md merge conflicts" (2026-11-15), the history count above.
- OKF v0.2: https://github.com/GoogleCloudPlatform/open-knowledge-format (SPEC.md §3 bundle, §4 concepts, §5.4 `status`, §8 index files are optional).
