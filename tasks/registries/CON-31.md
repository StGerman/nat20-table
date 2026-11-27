---
type: Task
id: CON-31
title: "The shell wears the page's colours, and the Mac's right page follows the reading"
pri: P1
dest: Ours
size: M
state: todo
area: "8. Agents, game loop, interface (all new)"
---

Design §6.3 and §6.6, PR 7.

Done means:
- `.tint` takes the page's accent from the chrome state (`#b0440f` light, `#ff9a57` dark), not the system blue.
- The HP gauge takes the page's HP colours, not the system green.
- The story's background is the page's flat paper; no ambient wash.
- Glass on dark one step more opaque, so the dock reads.
- The Mac's right page shows the place of the beat at the top of the story (the page posts it in the chrome state), with the name lettered on the picture in the system serif (Stas 2026-11-28: no font in the shell), a drift of at most 8%, and the title page for an unpainted place.

Check: the shell's tours on the phone and the Mac, light and dark (tint, gauge, background, the right page turning with the reading): test, no model (`shell/ci/`). How it looks on his phone and Mac: a person (Stas).

## Status

todo. Written 2026-11-28 from `docs/design/registries-and-picture-book-design.md` §11, after Stas accepted its §9 recommendations (card in the thread, 2026-11-28).
