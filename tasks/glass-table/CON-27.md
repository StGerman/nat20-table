---
type: Task
id: CON-27
title: "A new place opens the story with its picture, and a person's card with their face: the phone and every window that has no right page"
pri: P2
dest: Ours
size: S
state: partial
---

Stas at a live table of *The Silent Mill* on the iPhone simulator, 2026-11-25 22:15Z: «На мобилке все еще нет илюстраций и портретов». CON-26 put the picture of the place on the right page of the Mac's open book only; a phone has no right page, and neither has a Mac window narrower than a book or a browser. Of three ways on (the picture in the story and a face on the person's card now; the picture only; after Sign in with ChatGPT, with the picture book) he picked the first (card in the thread, 2026-11-25 22:17Z). The form is his decision of 2026-11-24 in the picture-book design: a new place opens with its picture, as a chapter does.

The story draws it (the page, so every window has it). When the seat tells the window a place it has not opened yet (`place` on the `situation` event, CON-26), a row goes into the story above the narration that told the place: the picture, from edge to edge of a phone's page, and the place's name under it. The seat names a place only once its opening is told, so the picture never comes before the words. The page stops at the picture when it comes, and the place is read from there down. A picture the page's files do not hold is a dashed frame that says «Картина места не нарисована» over the file's name, the words of CON-26's placeholder. The same place opens once: a fight in it, or a second scene with the same picture, adds no row.

In the Mac's open book the picture is on the right page, so the story there keeps the place's name and draws no picture (`window.__nat20Shell.book`, told by the shell when the window becomes a book or stops being one, and again to a page loaded again).

A person's card, opened from a name in the story, opens with their face where the page has one: the page hands the face to the shell with the card's lines, as the data it draws the face from itself, so the shell holds no portraits. In a browser the page's own card and the «Люди» list draw the same face.

Not in this row: a picture that comes with a meeting or a road card inside a place, the drop cap and the picture moving at half speed (all in the picture-book design), the map as a second page of the story, larger portraits (the card's face is the 128 px one of «Где все»), the human's own face in the dock, and the pictures of the road and the yard, which are CON-26's open items. The placeholder is for us, while pictures are being made: it goes behind a switch or goes away with CON-26's corner line before a stranger plays.

Depends on: CON-26 (table #501, merged).

Check: the row is added once per place, above the narration that told it, and a wire with no places has none: test, no model (`game/test/page-reduce.test.ts`). The picture from edge to edge of a phone's page and over the place's words, the placeholder with the file's name inside the page, the name alone in an open book, and the card handed to the shell with a face: test, no model (`game/e2e/shell.spec.ts`). The phone's own pictures of it, light and dark: read by eye (`shell/ci/shots.sh`, shots 20 to 22). The face on the shell's card, on the phone and the Mac: a person (no test opens a person's card in the shell). How it reads at a live table on his phone: a person (Stas).

## Status

partial. Built: all of the above. Open: Stas's look at it on his phone; the face on the shell's own card has been compiled and never looked at; a campaign's scene held behind a road card (AGT-100) is already the place the seat names while the card is played, so its picture would come before its opening is told, here and on the Mac's right page (no pack with pictures is a campaign yet: to mend in the seat before one is).
