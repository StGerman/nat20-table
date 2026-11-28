---
type: Task
id: CON-38
title: "Remove the old shell, the glass-table harness and server-side sign-in"
pri: P2
dest: Ours
size: S
state: todo
---

Decision 0105 and the 4a brief §5 (step 8). Stas, 2026-11-28: new code kept apart from old, with the legacy cleaned up. One PR removes:

- `shell/` and `.github/workflows/shell.yml`, the old SwiftUI shell;
- `game/spike/glass-table/` and `.github/workflows/spike-glass-table.yml`, CON-20's harness;
- server-side sign-in from the shipped table, kept only as `DirectTransport`.

It lands after CON-37 passes, so the phone is never without a client. Decision 0093's "one SwiftUI shell over the page" then holds for the nat20-app client, and the CLAUDE.md lines about the shell are shortened to point at nat20-app.

Depends on: CON-37.

Check: CI green without them, and nothing left that imports or builds them.

## Status

todo. Written 2026-11-28 from decision 0105.
