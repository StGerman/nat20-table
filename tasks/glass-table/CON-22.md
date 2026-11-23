---
type: Task
id: CON-22
title: "The SwiftUI shell on the iPhone, its macOS CI job and its UI test"
pri: P1
dest: Ours
size: M
state: done
---

SwiftUI shell design §4 PR 5, §2 (shell), §3, decision 0093. The shell is a new top-level part of this repo: a SwiftUI program that draws the tab bar, the dock, the chips, the sheets and the menu from the page's chrome state in the system's material, holds the WebSocket, and holds no game logic (no rule, no intent built in Swift; the one message it writes itself is `resume`, besides a ping). The Xcode project is generated from a small file (`xcodegen`), never committed. Its own CI job on a hosted macOS runner builds it for the simulator and runs the UI test; the job stays off `ci-ok` until it has been stable for a milestone (decision 0093). Floor iOS 26. The spike's `game/spike/hybrid-shell/` and `spike-hybrid-shell.yml` (table #480) are the start, reviewed; the dock line that opens over the keyboard (fixed on the spike branch) comes with them.

Owns from design §5 ("What the spike skipped"):
- **A press can vanish.** The shell pings; a socket found dead comes back and the open ask is offered again; a press that never reached the host is not shown as answered.
- **The story can vanish.** Resume asks from the page's own `seq`; a page whose web view process was ended is fed the run from 0.
- **«Лист» asks the seat for a fresh sheet on every touch of its tab.** It stops, and no ask opens over the tab.
- **The shell words things in Russian whatever the table's language is.** Its own lines follow the table's language.
- **The shell writes one message itself, `resume` (kept).** The UI test fails on any line sent that the page did not post, `resume` and a ping apart.
- **Vera has not passed the shell's own lines.** The connect screen, the wrong-link line, «Встать из-за стола» and «Нет связи со столом» are reworded so a player knows whether what she played is kept, and Vera (fallback) reads them again.
- **Accessibility, the phone half.** VoiceOver and larger type on the shell's controls.

Also from design §3: the phone keeps its screen on at a table; «Встать из-за стола» takes the phone away and sends no `quit`, the table goes on and the same link sits down again (Stas's yes to design §8 question 2, on the merge of table #482).

Depends on: AGT-153, AGT-154.

Check (design §3 rows 1 to 4, and §4 PR 5's gate): the job is green on the simulator, and its UI test answers every kind of ask, drops the socket between a press and its send, reloads a page, and reads that only the page's lines were sent: test, no model. Vera (fallback) on the shell's own lines: a person (exit row 7).

## Status

done (table #490). The shell lives in `shell/`, its job is `.github/workflows/shell.yml` (off `ci-ok`). Checked by the job on the simulator: every kind of ask answered, a socket lost between a press and its send, a page loaded again, a replaced window, and only the page's lines sent (`shell/ci/heard.ts`). Not checked by any test: a real phone, Wi-Fi, a lock and unlock (AGT-155); VoiceOver by ear (the system's audit runs in the job and its findings are listed, a person has not listened). Vera's read of the shell's lines is in the PR: she passes the lines on leaving and on a lost connection, and still stops at the link field, which goes only when the Mac app starts the table (CON-20, CON-21). Under AGT-155 (exit row 9) and CON-23.
