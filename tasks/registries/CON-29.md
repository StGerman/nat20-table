---
type: Task
id: CON-29
title: "A new place or picture opens a chapter; a person met sits in the line"
pri: P1
dest: Ours
size: M
state: todo
area: "8. Agents, game loop, interface (all new)"
---

Design §6.1 and §6.2, PR 5. Starts from `/mnt/project-files/engine/picture-book/chapter-opener-2026-11-27.patch`, rebased onto CON-27's `plate` beat, not merged as it is.

Done means:
- A chapter opens when the place or its picked picture changes: the picture full width, 3:4 around `focus`, at most 70% of the screen's height, a soft shadow; the place name lettered on it in Literata with a text shadow; a parallax at 0.85 of the scroll, at most 8%, none under Reduce Motion.
- A drop cap on the first narration paragraph after the opener, the text's face, the accent colour, three lines on the phone, four on the Mac.
- A title page for an unpainted place: the name, the place's `look` in italics, then the drop cap.
- A person's first naming in a chapter puts their 44 px face at the start of that line, on the phone and on the Mac.

Check: opener once per place and again on a changed picture, the title page, the drop cap, Reduce Motion, a meeting in the line: test, no model (Playwright WebKit, `game/e2e/`). The shell tour's pictures, light and dark, next to the prototype's: a person (Stas). Vera on a title page and a meeting: a person.

Takes over CON-27's open items on the drop cap and meetings.

## Status

todo. Written 2026-11-28 from `docs/design/registries-and-picture-book-design.md` §11, after Stas accepted its §9 recommendations (card in the thread, 2026-11-28).
