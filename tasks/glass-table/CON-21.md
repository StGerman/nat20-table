---
type: Task
id: CON-21
title: "The Swift Mac app starts the table: one signed, notarised DMG"
pri: P1
dest: Ours
size: M
state: todo
---

Glass Table design §8, §7 (§11 PR 9), as amended by the SwiftUI shell design §4 PR 7 and decision 0093; scope In 5. `Glass Table.app` in one DMG: the CON-23 Swift shell for the Mac, the compiled loop, `nat20-api-server` and the audit binaries (bundled since CON-19, table #450), the content as resources. One read-only data root for content and one writable folder for rosters and runs (defaults under `REPO` in `game/src/play/settings.ts` today; `REPO` in `game/src/paths.ts` comes from `import.meta.url`); the app starts the table itself and restarts a dead host; a closed window sends `quit` so the party is saved. Each nested binary signed under the hardened runtime, the app notarised, the DMG built from a tag in the `release` workflow on a hosted macOS arm64 runner with the Developer ID and notary key as repository secrets (Stas, 2026-11-21 07:46Z, scope §9 question 2).

The Mac shell itself (window, menu bar commands and keys) is CON-23, its own row: it needs no signing and no account, so it lands before this row's wait on them.

Depends on: CON-20 (the report), CON-23, AGT-143, AGT-144.

Check (exit row 6): the DMG builds signed and notarised and starts the bundled loop and server with no checkout, Rust or Node, in CI on macOS arm64: test, no model; then Stas installs it and starts a scripted scene, 10 to 15 min: a person.

## Status

todo. Nothing on main. Stas said go for the milestone 2026-11-21 09:26Z; the Tauri shell this row named is dropped (decision 0093, table #482). Waits on Stas: the paid Apple Developer account (99 USD a year; the SwiftUI shell design §8 question 3 keeps it for the signed Mac app) and the signing secrets in the repository.
