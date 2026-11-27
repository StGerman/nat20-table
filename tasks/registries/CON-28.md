---
type: Task
id: CON-28
title: "The story in Literata, the page's marks, \"Roll no. 11\""
pri: P1
dest: Ours
size: S
state: todo
area: "8. Agents, game loop, interface (all new)"
---

Design §6.5, PR 4; decision 0098.

Done means:
- Literata roman and italic, `woff2`, Latin and Cyrillic, in `game/src/page/fonts/` with its `OFL.txt`; `shell/Shared/PageScheme.swift` serves `font/woff2`; CLAUDE.md Rule 7 gains one line for OFL fonts.
- Everything the Narrator says in Literata, the table's controls in the system font; the story at 18/28 on the phone and 18/29 on the Mac (Stas 2026-11-28), checked on his iPhone.
- The 15 Lucide marks inlined as SVG symbols, 1.5 px stroke, always beside a word.
- The page names a roll "Roll no. 11", «Бросок № 11»; the transcript, log and audit keep `r11`.

Check: the fonts load and the licence ships beside them, the build's size check: test, no model. "Roll no. 11" on the page and `r11` in the transcript: test, no model (replay). Vera on the roll's name and the marks: a person.

## Status

todo. Written 2026-11-28 from `docs/design/registries-and-picture-book-design.md` §11, after Stas accepted its §9 recommendations (card in the thread, 2026-11-28).
