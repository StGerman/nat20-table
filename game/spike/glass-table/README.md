# Glass Table spike (CON-20)

Checks, before the Mac app is built to start the table (CON-21), what decisions 0093 and 0100
assume of it: a Swift Mac app starts the Bun-compiled host and `nat20-api-server` from inside its
own bundle; the host signs in with ChatGPT itself (it opens the system browser and takes the
callback on 127.0.0.1) and makes one streamed call on the plan, under the hardened runtime; the
app's own socket reaches the host with a per-launch token; and closing the window leaves the app
and the host running, while quitting the app ends both. Signed, launched as Finder launches it. It
merges no game code. This is the sign-in design's biggest risk (§6), checked before the table
server (CON-32) is built.

| File | What |
|---|---|
| `host.ts` | the stand-in for the table host: the six checks and the report |
| `app/` | the Swift Mac app: a window that starts the host, connects its socket and lists the items (`project.yml` for `xcodegen`) |
| `run.sh` | build, sign, notarise, launch as Finder does, print the report |
| `entitlements.plist` | the entitlements Bun's docs give for a compiled Bun file under the hardened runtime (the plist takes no comments: AMFI refuses them) |

The app has no App Sandbox, as the Mac app will not: a sandboxed app's children inherit the
sandbox. The app itself needs no entitlement. Its
socket names no origin, as the shell's does not; the host refuses one that does (a page in a browser).

## On Stas's Mac

Needs what the shell needs (Xcode, `brew install xcodegen`, Node 22), Rust, and your ChatGPT Plus
account. From the table checkout:

1. `git log -1 --oneline` shows the commit you mean to check.
2. `game/spike/glass-table/run.sh`

It builds for a few minutes, then opens the spike's window twice: round A with the host signed with
its entitlements, round B with none, which says whether they are needed. `open` is called with an
empty environment, so the app gets no shell `PATH`.

In round A your browser opens on ChatGPT's sign-in page: sign in and allow "Fine Print". The tab
then says you can close it. Rounds B and C use the saved sign-in and open no browser. The sign-in
is kept, mode 0600, under `~/Library/Application Support/glass-table-spike/siwc/`; delete that
folder afterwards if you like.

Each round, the window closes by itself after the checks and the app stays in the Dock: that is
item 6. The script then quits the app (round A and C as Cmd-Q does, round B with a kill it cannot
answer) and looks for anything left running.

3. Round C: the script shows the app in a Finder window and waits. Double-click it there. The
   window lists the items, closes itself, and the script quits the app when the report is in.
4. Paste the log the script names in its last line (`spike-<time>.log` under
   `~/Library/Application Support/glass-table-spike/`; the host's own `host-<time>.log` and the
   reports are beside it).

Each round makes one tiny call on your ChatGPT plan (well under 1% of the five-hour window), on
gpt-6.1-terra unless `SPIKE_MODEL` names another.

With the Developer ID, once the account is active (CON-21's half):
`xcrun notarytool store-credentials glass-table --apple-id <id> --team-id <team>` once, then
`game/spike/glass-table/run.sh --sign "Developer ID Application: <name> (<team>)" --notary-profile glass-table`.

The `spike-glass-table` workflow runs step 2 on a hosted Apple Silicon machine with no model call.
