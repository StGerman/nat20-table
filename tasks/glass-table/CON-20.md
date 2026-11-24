---
type: Task
id: CON-20
title: "Spike: the Swift Mac app starts the compiled loop and the engine, signed, launched from Finder, one live model call"
pri: P1
dest: Ours
size: S
state: partial
---

Re-pointed from Tauri to the Swift Mac app by decision 0093 (accepted with table #482, merged by Stas 2026-11-23T19:14:50Z): the question this row asked of a Tauri window is asked of the CON-23 shell built for the Mac (SwiftUI shell design §4 PR 7). The Mac app starts the Bun-compiled loop (`bun build --compile`) and `nat20-api-server` as bundled binaries, makes one live model call under the hardened runtime (with the JIT entitlement if it needs one), and is launched from Finder on Stas's Mac, where the app gets no shell `PATH` and still has to find Claude Code. Done means: a report, item by item, works or not, from Stas's Mac, ad-hoc signed first; the Developer ID and notarised half is CON-21's DMG. If the Swift Mac app cannot start the loop from a signed app, decision 0093 falls back to its option D (Tauri on the Mac) before CON-21 is built.

The harness is `game/spike/glass-table/`: a Swift Mac app (`app/`) that starts the compiled stand-in host (`host.ts`: the five checks and the report) and the engine from inside its own bundle and connects its own socket to the host, as the shell's `Wire` does; `run.sh` builds it, signs the three programs under the hardened runtime, launches it as Finder does, twice (the host with the entitlements Bun's docs give, then with none), and after each launch kills the app and looks for anything it started that outlived it; a last round is started by a double-click in Finder. It keeps the Tauri-free parts of the harness of table #462 (merged 2026-11-21T17:02:33Z, never run on Stas's Mac) and drops its Tauri shell, `game/spike/glass-table/shell/`. The `spike-glass-table` workflow is kept under its name and rewritten for the Swift app: it runs `run.sh` on a hosted Apple Silicon machine with no model call, and only on changes to the harness.

Depends on: CON-23.

## Status

partial. The harness for the Swift app is on main and runs on a hosted Apple Silicon machine (Xcode 27 image, ad-hoc signature, hardened runtime, no model call): there the app starts the host from its bundle, the bundled engine answers `hello`, the app's socket connects with the token, the app is given no shell `PATH`, and the host and the engine it keeps running end when the app is killed. Open: the two items a hosted machine cannot check, Claude Code found with no shell `PATH` and one live model call, and the whole report from Stas's Mac. Waits on: one evening at Stas's Mac (`game/spike/glass-table/README.md`; the script is one command, the sitting about 30 min). Done when his report is in this file.
