---
type: Task
id: CON-23
title: "The same SwiftUI shell on the Mac: a window, and a menu bar command and key for every dock action"
pri: P1
dest: Ours
size: M
state: done
---

SwiftUI shell design §4 PR 6, decision 0093 (the Mac takes the same shell and Tauri is dropped: Stas, card in the thread, 2026-11-22 23:35Z). The CON-22 shell built for macOS 26: a window around the same page, and a menu bar command with a key for every dock action, drawn from the chrome state. Closing the Mac window sends `quit` so the party is saved (Glass Table design §7); that differs from the phone's «Встать из-за стола». This row connects to a table started from a checkout; starting the table from inside the app is CON-20 and CON-21. Not checked by the spike (decision 0093, "Not checked"): the same shell built for macOS. If it does not hold there, the Mac falls back to decision 0093's option D (Tauri on the Mac) and CON-20 and CON-21 go back to Tauri.

Owns from design §5 ("What the spike skipped"):
- **Accessibility, the Mac half.** VoiceOver and larger type on the window's controls and menu commands.

Depends on: CON-22.

Check (design §4 PR 6's gate): a UI test on the hosted macOS runner answers an ask by each menu command and by its key: test, no model.

## Status

done (table #494). `shell/Mac/` is the Mac's entry, window and menu commands over the shared model and controls (`shell/Shared/`); the scheme is `GlassTableMac`, the job `mac` in `.github/workflows/shell.yml` (off `ci-ok`). Checked by the job (`shell/MacTour/MacTour.swift`, `shell/ci/mac-tour.sh`): every kind of ask answered from the menu bar, an answer by number, the human's own words and the pause each by the command and by its key, with a lost socket, a reloaded page and a replaced window whose seat the menu takes back, and `quit` heard by the host when the window is closed. Not checked: closing the window while the socket is down or the story's page is gone (the wait and the second ask in `Shell.quit`), a reaction with one answer (yes and no; the test wire's reaction offers several), VoiceOver and larger type on the Mac (CON-24), and Stas's own Mac. On the macOS 27 runner the test's pictures show the window with its pages blank (macOS 26 draws them, and the test passes on both): whether that is the runner's screenshot or the system is not known until a real Mac on macOS 27 opens it. Closing the window asks nothing first; whether it should is Stas's to say. On Stas's own Mac (2026-11-25, his macOS version not recorded) the window draws its pages and plays a live table. Full screen showed three defects there: «Где все» drew the yard at the phone's 185% of the page's width, «Лист» lay across the whole window, and the dock was as wide as the screen. Fixed in table #498: a page wider than it is tall draws the yard whole, a foot between 10 and 18 px; «Лист» and the dock keep to the story column's width; checked for the page by `game/e2e/shell.spec.ts`, the dock by eye only. A layout made for a wide window (the story beside the map) is CON-25 (table #499). A table that had ended held the app on Stas's Mac (2026-11-25): the link is kept for the next launch, the socket is asked for without end, and the Mac offered «Встать из-за стола» only for a recorded run, so the one way out was to delete the saved link by hand. Fixed in table #499 at his word: while the socket is down the line that says so has the button on the Mac and the game menu has the command; both lead to the link screen with the link in its field (`MacTour.leave`). Not done there: saying that the table is gone rather than unreachable, which needs words of its own.
