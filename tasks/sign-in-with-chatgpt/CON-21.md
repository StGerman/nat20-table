---
type: Task
id: CON-21
title: "The Swift Mac app starts the table: one signed, notarised DMG"
pri: P1
dest: Ours
size: M
state: todo
---

Glass Table design §8, §7 (§11 PR 9), as amended by the SwiftUI shell design §4 PR 7 and decision 0093 and decision 0100; sign-in scope In 9. `Glass Table.app` in one DMG: the CON-23 Swift shell for the Mac, the compiled loop, `nat20-api-server` and the audit binaries (bundled since CON-19, table #450), the content as resources. One read-only data root for content and one writable folder for rosters and runs (defaults under `REPO` in `game/src/play/settings.ts` today; `REPO` in `game/src/paths.ts` comes from `import.meta.url`); the app starts the table server (CON-32) as its child and restarts it when it dies; a closed window leaves the game running and Cmd-Q quits through the page, so the party is saved (decision 0100). Each nested binary signed under the hardened runtime, the app notarised, the DMG built from a tag in the `release` workflow on a hosted macOS arm64 runner with the Developer ID and notary key as repository secrets (Stas, 2026-11-21 07:46Z, scope §9 question 2).

The Mac shell itself (window, menu bar commands and keys) is CON-23, its own row: it needs no signing and no account, so it lands before this row's wait on them.

Depends on: CON-20 (the report), CON-23, CON-32, AGT-147.

Check (sign-in scope exit row 13): the DMG builds signed and notarised and starts the bundled loop and server with no checkout, Rust or Node, in CI on macOS arm64: test, no model; then Stas installs it and starts a scripted scene, 10 to 15 min: a person.

## Status

todo. Nothing on main. Stas said go for the milestone 2026-11-21 09:26Z; the Tauri shell this row named is dropped (decision 0093, table #482). Waits on Stas: the paid Apple Developer account (99 USD a year; the SwiftUI shell design §8 question 3 keeps it for the signed Mac app) and the signing secrets in the repository.

Moved from Glass Table to Sign in with ChatGPT on 2026-11-28 (decision 0099: Glass Table closed without this row). The sign-in scope as accepted ends on one pair on one build and names no DMG: taking the signed app in needs an amendment to `docs/scope/sign-in-with-chatgpt-scope.md` that Stas accepts. Still waits on the paid Apple Developer account.

2026-11-28, from the sign-in design (table #515): the server is a second signed program in the bundle, beside the shell and `nat20-api-server`; the check is scope §4 row 13. Open with Stas (design §10 question 2): buy the Apple Developer account now, or build this row ad-hoc signed for the exit pair on his Mac and give notarisation its own row before Friends and Family (Claude's recommendation).
