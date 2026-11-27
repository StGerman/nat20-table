---
type: Task
id: CON-20
title: "Spike: the signed Swift Mac app starts the table server, which signs in with ChatGPT and makes one call"
pri: P1
dest: Ours
size: S
state: partial
---

Re-pointed from Tauri to the Swift Mac app by decision 0093 (accepted with table #482, merged by Stas 2026-11-23T19:14:50Z): the question this row asked of a Tauri window is asked of the CON-23 shell built for the Mac (SwiftUI shell design §4 PR 7). The Mac app starts the Bun-compiled loop (`bun build --compile`) and `nat20-api-server` as bundled binaries, makes one live ChatGPT call under the hardened runtime (with the JIT entitlement if it needs one) after signing in through SIWC from inside the bundle, and is launched from Finder on Stas's Mac, where the app gets no shell `PATH`. Done means: a report, item by item, works or not, from Stas's Mac, ad-hoc signed first; the Developer ID and notarised half is CON-21's DMG. If the Swift Mac app cannot start the loop from a signed app, decision 0093 falls back to its option D (Tauri on the Mac) before CON-21 is built.

The harness is `game/spike/glass-table/`: a Swift Mac app (`app/`) that starts the compiled stand-in host (`host.ts`: the five checks and the report) and the engine from inside its own bundle and connects its own socket to the host, as the shell's `Wire` does; `run.sh` builds it, signs the three programs under the hardened runtime, launches it as Finder does, twice (the host with the entitlements Bun's docs give, then with none), and after each launch kills the app and looks for anything it started that outlived it; a last round is started by a double-click in Finder. It keeps the Tauri-free parts of the harness of table #462 (merged 2026-11-21T17:02:33Z, never run on Stas's Mac) and drops its Tauri shell, `game/spike/glass-table/shell/`. The `spike-glass-table` workflow is kept under its name and rewritten for the Swift app: it runs `run.sh` on a hosted Apple Silicon machine with no model call, and only on changes to the harness.

Depends on: CON-23.

**As of 2026-11-28** (`docs/design/sign-in-with-chatgpt-system-design.md` §6, the design's biggest risk, so this row goes first): the stand-in host lives as long as the app, not one run (decision 0100), and adds the sign-in: from inside the signed bundle it opens the system browser with `open`, takes the SIWC callback on loopback (the spike's flow, project files `engine/siwc/spike.mjs`), and makes one streamed `/v1/responses` call on terra. The item "find Claude Code with no shell `PATH`" is dropped: no Claude at the table (decision 0091). If the signed server cannot open the browser or take the callback, the design returns to Stas before CON-32 is built.

## Status

partial. The harness for the Swift app is on main and runs on a hosted Apple Silicon machine (Xcode 27 image, ad-hoc signature, hardened runtime, no model call): there the app starts the host from its bundle, the bundled engine answers `hello`, the app's socket connects with the token, the app is given no shell `PATH`, and the host and the engine it keeps running end when the app is killed. Open: what a hosted machine cannot check, the SIWC sign-in from the signed bundle and one live ChatGPT call, and the whole report from Stas's Mac. Waits on: one evening at Stas's Mac (`game/spike/glass-table/README.md`; the script is one command, the sitting about 30 min). Done when his report is in this file.

Moved from Glass Table to Sign in with ChatGPT on 2026-11-28 (decision 0099: Glass Table closed without this row). Its open items, Claude Code found with no shell `PATH` and one live Claude call, lose their point after the full switch (decision 0091); the report from Stas's Mac is still owed, and the sign-in design says what it has to show on ChatGPT.

2026-11-28: rewritten from the sign-in design (table #515). Stas's evening at the Mac now answers the old items and the sign-in in one sitting.
