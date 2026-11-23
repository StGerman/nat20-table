---
type: Task
id: CON-20
title: "Spike: the Tauri shell starts the compiled loop and the engine, signed, notarised, launched from Finder"
pri: P1
dest: Ours
size: S
state: partial
---

Before any app code (scope §6; design §8 "Unverified, and checked first by a spike", §11 PR 3): a Tauri window starts the Bun-compiled loop (`bun build --compile`) and `nat20-api-server` as bundled binaries, makes one live model call under the hardened runtime (with the JIT entitlement if it needs one), is signed and notarised, and is launched from Finder on Stas's Mac, where the app gets no shell `PATH` and still has to find Claude Code. Done means: a report, item by item, works or not, from Stas's Mac. It merges no game code. If Tauri fails with the compiled loop, decision 0090 falls back to Electron before anything is built on it.

Depends on: nothing; every other row of this milestone waits on it.

## Status

partial. Stas said go 2026-11-21 09:26Z. The spike's harness is in `game/spike/glass-table/` (`run.sh` builds, signs, launches and prints the report; the `spike-glass-table` workflow builds it ad-hoc on a hosted Apple Silicon runner with no model call). Waits on Stas: one evening at the Mac, 60 to 90 min, ad-hoc first, then with his Developer ID and notary profile once the Apple Developer account is active. Done when his report is in this file.

2026-11-23: on hold. Decision 0093 (Proposed, table #482) replaces the Tauri shell with a SwiftUI one; if it is accepted, this row's question (the compiled loop and the engine started from a signed app launched from Finder) is asked of the Swift Mac app and the row is rewritten for it. Stas need not run the Tauri harness meanwhile.
