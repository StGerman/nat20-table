---
type: Task
id: CON-21
title: "The shell and the package: one signed, notarised DMG"
pri: P1
dest: Ours
size: M
state: todo
---

Design §8, §7 (§11 PR 9), scope In 5. `Glass Table.app` in one DMG: the Tauri shell with a menu bar command and key for every dock action, the compiled loop, `nat20-api-server` and the audit binaries (bundled since CON-19, table #450), the content as resources. One read-only data root for content and one writable folder for rosters and runs (defaults under `REPO` in `game/src/play/settings.ts` today; `REPO` in `game/src/paths.ts` comes from `import.meta.url`); the shell restarts a dead host, and a closed window sends `quit` so the party is saved. Each nested binary signed under the hardened runtime, the app notarised, the DMG built from a tag in the `release` workflow on a hosted macOS arm64 runner with the Developer ID and notary key as repository secrets (Stas, 2026-11-21 07:46Z, scope §9 question 2).

Depends on: CON-20, AGT-143, AGT-144.

Check (exit row 6): the DMG builds signed and notarised and starts the bundled loop and server with no checkout, Rust or Node, in CI on macOS arm64: test, no model; then Stas installs it and starts a scripted scene, 10 to 15 min: a person.

## Status

todo. No code until Stas says go (the talk moved to December with no date, Stas 2026-11-21 08:36Z). Waits on Stas for the signing secrets in the repository.

2026-11-23: on hold. Decision 0092 (Proposed, table #482) replaces the Tauri shell with a SwiftUI one; if it is accepted, this row is rewritten for a Swift Mac app (`docs/design/swiftui-shell-design.md` §4, PRs 6 and 7). Nobody starts the Tauri shell meanwhile.
