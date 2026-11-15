---
type: Task
id: UPS-2
title: "Sync with upstream"
pri: P1
dest: Fork
size: S
state: todo
area: "9. Fork upkeep (was: upstream process; upstream closed 2026-10-18, decision 0023)"
---

Sync with upstream: fast-forward fork `main` to upstream `main`, then merge it into `demo` in a `core/sync-upstream` PR (never rebase `demo`: table pins its commits), then bump the table pin. Repeat whenever upstream `main` moves (9aaca2f on 2026-10-18)

## Status

(nothing to sync yet: `demo` already contains 9aaca2f)
