---
type: Task
id: UPS-1
title: "Stas's settings on the fork"
pri: P0
dest: Fork
size: S
state: partial
area: "9. Fork upkeep (was: upstream process; upstream closed 2026-10-18, decision 0023)"
gate_was: Y
---

Stas's settings on the fork: enable GitHub Actions; make `demo` the default branch (Dependabot reads its config from there); enable Dependabot alerts and security updates on the fork and on nat20-table; allow only merge commits on the fork (CLAUDE.md Rule 6: squash or rebase-merge orphans pinned heads). Blocks UPS-13 and UPS-14. 2026-10-19 05:30Z (repos API): Actions on, `demo` is the default branch; squash and rebase merging still allowed on the fork; Dependabot alerts and security updates not readable from a session (403), so still to confirm

## Status

(Stas): left: squash merge off on the fork (repos API 2026-11-11: `allow_squash_merge` true, `allow_rebase_merge` false, default branch `demo`); Dependabot alerts and security updates on both repos, not readable from a session
