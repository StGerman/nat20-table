---
type: Task
id: CON-20
title: "Spike: the Swift Mac app starts the compiled loop and the engine, signed, launched from Finder, one live model call"
pri: P1
dest: Ours
size: S
state: todo
---

Re-pointed from Tauri to the Swift Mac app by decision 0093 (accepted with table #482, merged by Stas 2026-11-23T19:14:50Z): the question this row asked of a Tauri window is asked of the CON-23 shell built for the Mac (SwiftUI shell design §4 PR 7). The Mac app starts the Bun-compiled loop (`bun build --compile`) and `nat20-api-server` as bundled binaries, makes one live model call under the hardened runtime (with the JIT entitlement if it needs one), and is launched from Finder on Stas's Mac, where the app gets no shell `PATH` and still has to find Claude Code. Done means: a report, item by item, works or not, from Stas's Mac, ad-hoc signed first; the Developer ID and notarised half is CON-21's DMG. If the Swift Mac app cannot start the loop from a signed app, decision 0093 falls back to its option D (Tauri on the Mac) before CON-21 is built.

The Tauri harness on main, `game/spike/glass-table/` and the `spike-glass-table` workflow (table #462, merged 2026-11-21T17:02:33Z), was never run on Stas's Mac and its shell is not built further. Proposed move: the PR that answers this row reuses its Tauri-free parts (`host.ts`, the five checks and the report; `shell/entitlements.plist`; the sign, notarise and launch-as-Finder steps of `run.sh`) for the Swift app, and deletes `game/spike/glass-table/shell/` (its own Cargo workspace) and `.github/workflows/spike-glass-table.yml` in the same PR. Until then it costs nothing: the workflow runs only on changes to its own paths.

Depends on: CON-23.

## Status

todo. The Tauri half of 2026-11-21 (harness merged in table #462; Stas said go 2026-11-21 09:26Z) answers nothing for the Swift app, so nothing of this question is done on main. Waits on: CON-23 merged, then one evening at Stas's Mac, 60 to 90 min. Done when his report is in this file.
