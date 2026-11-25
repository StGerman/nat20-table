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

done (table #490). The shell lives in `shell/`, its job is `.github/workflows/shell.yml` (off `ci-ok`). Checked by the job on the simulator: every kind of ask answered, a socket lost between a press and its send, a page loaded again, a replaced window, and only the page's lines sent (`shell/ci/heard.ts`). Not checked by any test: a real phone, Wi-Fi, a lock and unlock (AGT-155); VoiceOver by ear and the largest type sizes (the system's audit runs in the job and lists its findings; what it still lists is CON-24). On the iOS 27 simulator the keyboard does not always come at the first touch of the dock's line, and the line closes by itself: seen in one of two jobs on one commit, with errors of the keyboard's service only in that job. The tour touches the line a second time and the job warns when it had to; whether a real iPhone on iOS 27 does the same is for AGT-155 to see. There too the first typed key can hold the app for a minute: the simulator asks the system for the keyboard's language data, a runner has none, and the app stands until the request fails (`com.apple.linguisticdata` in the system's log, 7 s in one round and 67 s in another); the tour waits for the line and the job warns. On the same image WebKit once ended every page's process in the middle of the tour (its drawing process stopped answering three times in half a minute): the shell loaded the pages again and every ask was answered; the job warns, and `heard.ts` takes the resumes from 0 that follow for what they are. Vera's read of the shell's lines is in the PR: she passes the lines on leaving and on a lost connection, and still stops at the link field, which goes only when the Mac app starts the table (CON-20, CON-21). Under AGT-155 (exit row 9) and CON-23. On Stas's simulator (iPhone 14 Pro Max, 2026-11-25) the line over the keyboard stood on the story's last line, and with no keyboard on the screen the dock's line under it read as a second line to type in. Fixed in table #505: the story is shown from its end again when the line comes up (`Content.toEnd`), and the dock's line says nothing while the other is open. Checked by the job's picture `07-the-keyboard` by eye only; no test reads where the story's last line stands. That picture in table #506's round showed the fix was half of one: the story ended at the keyboard's top, under the moves and the typing line, because the web view counts the bars and the keyboard as its inset and not what the shell lays over its foot. Second fix on this row: the shell measures its moves and typing line and tells the page (`Content.covered`), and the page ends its story that much higher (`--covered`), keeping a reader at the end at the end and one who scrolled back where they read. The page's half is tested in a browser (`game/e2e/shell.spec.ts`); the shell's half is still the picture `07-the-keyboard` by eye.
