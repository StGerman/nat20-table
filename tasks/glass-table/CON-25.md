---
type: Task
id: CON-25
title: "The Mac's wide window is an open book: the story on the left page, «Где все» or «Лист» on the right"
pri: P2
dest: Ours
size: S
state: done
---

Stas on his own Mac, 2026-11-25: full screen "looks odd", and the layout should follow the window's width. Of three layouts shown to him (one page, an open book, three strips; mock-ups in the thread) he picked the open book, «Разворот» (card in the thread, 2026-11-25 07:13Z): the story on the left, the map and the sheet on the right, later the pictures and the portraits; a narrow window keeps its tabs.

A window 860 points wide or more is an open book: the story on the left page with an ask's answers, the chips and the dock under it, and on the right page, 46% of the window, «Где все» or «Лист», turned by a switch over it. Under 860 points the window holds the three pages as tabs, as CON-23 built it. The tab that was being read when the window grew goes to the right page. The menu bar's commands and keys are the same in both.

The page's half: the right page is taller than it is wide and not a phone, so «Где все» takes the wide window's scale (a foot between 10 and 18 px, the whole yard where it fits) on any page 500 px wide or more, not only on one wider than tall. A narrower page keeps the phone's 185% of its width.

Not in this row, and not built before the picture-book milestone (Stas's order of 2026-11-24): the picture of the place and a person's portrait on the right page, the painted plan in place of the yard's lens, and the right page turning by itself (to the map when a fight starts, to a portrait when a name is pressed). Until then the human turns it.

Depends on: CON-23 (table #498 for the yard's scale and the dock's width; this row's PR is stacked on it).

Check: a UI test on the hosted macOS runner opens the window wide and finds the right page, and finds none in the window as it opens: test, no model (`shell/MacTour/MacTour.swift` `testPictures`). The yard's scale on a page shaped like the right page: test, no model (`game/e2e/shell.spec.ts`).

## Status

done (table #499). `shell/Mac/MacRoot.swift` draws the book or the tabs by the window's width; `-wide 1` opens the window at least 1000 points wide for the test, whose runner's screen is 1024 by 768, so the pictures show the book near its narrowest. Not checked: a window dragged across 860 points with a table open (the three web views move between the tabs and the pages; no test resizes a window), the sheet on the right page while a fight goes on (it is asked for when the page is turned to it, as a tab is, and not again when something happens, so it can show an older sheet until turned back), full screen on a large display, VoiceOver on the switch (CON-24), and Stas's own Mac.
