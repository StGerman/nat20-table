# Glass Table spike (CON-20)

Checks, before any app code, what decision 0090 assumes (design §8): a Tauri window starts the
Bun-compiled host and `nat20-api-server` from inside the app bundle, the host finds the player's own
Claude Code with no shell `PATH`, makes one live model call under the hardened runtime, and the page
talks to the host over a WebSocket on 127.0.0.1 with a per-launch token. Signed, notarised, launched
from Finder. It merges no game code.

| File | What |
|---|---|
| `host.ts` | the stand-in for the table host: the five checks and the report |
| `shell/` | the Tauri shell (its own Cargo workspace) and the page |
| `run.sh` | build, sign, notarise, launch as Finder does, print the report |

## On Stas's Mac

Needs Rust, Node 22, Xcode command line tools, Bun (`brew install oven-sh/bun/bun`) and Claude Code
signed in. From the table checkout, on this branch:

1. Ad-hoc, no Apple account: `game/spike/glass-table/run.sh`
2. Is JIT needed: `game/spike/glass-table/run.sh --entitlements none`
3. With the Developer ID, once the account is active:
   `xcrun notarytool store-credentials glass-table --apple-id <id> --team-id <team>` once, then
   `game/spike/glass-table/run.sh --sign "Developer ID Application: <name> (<team>)" --notary-profile glass-table`
4. Double-click `game/spike/glass-table/shell/target/release/bundle/macos/Glass Table Spike.app` in Finder once.

Each run writes `spike-<time>.log` in the folder it was started from and a report under
`~/Library/Application Support/glass-table-spike/`. Paste the logs.

The `spike-glass-table` workflow runs step 1 on a hosted Apple Silicon runner with no model call.
