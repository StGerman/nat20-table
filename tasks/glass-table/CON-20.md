---
type: Task
id: CON-20
title: "Spike: the Tauri shell starts the compiled loop and the engine, signed, notarised, launched from Finder"
pri: P1
dest: Ours
size: S
state: todo
---

Before any app code (scope §6; design §8 "Unverified, and checked first by a spike", §11 PR 3): a Tauri window starts the Bun-compiled loop (`bun build --compile`) and `nat20-api-server` as bundled binaries, makes one live model call under the hardened runtime (with the JIT entitlement if it needs one), is signed and notarised, and is launched from Finder on Stas's Mac, where the app gets no shell `PATH` and still has to find Claude Code. Done means: a report, item by item, works or not, from Stas's Mac. It merges no game code. If Tauri fails with the compiled loop, decision 0090 falls back to Electron before anything is built on it.

Depends on: nothing; every other row of this milestone waits on it.

## Status

todo. No code until Stas says go. Waits on Stas: his go, an Apple Developer account (99 USD a year; Apple's own review time is not ours to shorten) and one evening at the Mac, 60 to 90 min.
