# Glass Table spike (CON-20)

Checks, before the Mac app is built to start the table (CON-21), what decision 0093 assumes of it: a
Swift Mac app starts the Bun-compiled host and `nat20-api-server` from inside its own bundle, the
host finds the player's own Claude Code with no shell `PATH`, makes one live model call under the
hardened runtime, and the app's own socket reaches the host on 127.0.0.1 with a per-launch token.
Signed, launched as Finder launches it. It merges no game code.

| File | What |
|---|---|
| `host.ts` | the stand-in for the table host: the five checks and the report |
| `app/` | the Swift Mac app: a window that starts the host, connects its socket and lists the items (`project.yml` for `xcodegen`) |
| `run.sh` | build, sign, notarise, launch as Finder does, print the report |
| `entitlements.plist` | the entitlements Bun's docs give for a compiled Bun file under the hardened runtime (the plist takes no comments: AMFI refuses them) |

The app has no App Sandbox: a sandboxed app's children inherit the sandbox, and Claude Code could
then read neither its own login nor the player's folders. The app itself needs no entitlement. Its
socket names no origin, as the shell's does not; the host refuses one that does (a page in a browser).

## On Stas's Mac

Needs what the shell needs (Xcode, `brew install xcodegen`, Node 22), Rust, and Claude Code signed
in. From the table checkout:

1. `git log -1 --oneline` shows the commit you mean to check.
2. `game/spike/glass-table/run.sh`

It builds for a few minutes, then opens the spike's window twice, for a few seconds each, and closes
it itself: round A with the host signed with its entitlements, round B with none, which says whether
they are needed. `open` is called with an empty environment, so the app gets no shell `PATH`.

3. Round C: the script shows the app in a Finder window and waits. Double-click it there. The
   window lists the five items, and the script closes it when the report is in.
4. Paste the log the script names in its last line (`spike-<time>.log` under
   `~/Library/Application Support/glass-table-spike/`; the host's own `host-<time>.log` and the
   reports are beside it).

Each round makes one small model call on your Claude login. After each round the script kills the
app and looks for a host left running.

With the Developer ID, once the account is active (CON-21's half):
`xcrun notarytool store-credentials glass-table --apple-id <id> --team-id <team>` once, then
`game/spike/glass-table/run.sh --sign "Developer ID Application: <name> (<team>)" --notary-profile glass-table`.

The `spike-glass-table` workflow runs step 2 on a hosted Apple Silicon machine with no model call.
