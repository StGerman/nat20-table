---
type: Task
id: CON-33
title: "The phone finds the table"
pri: P1
dest: Ours
size: S
state: todo
---

`docs/design/sign-in-with-chatgpt-system-design.md` §5.2; scope In 8; Stas's pick, 2026-11-28 (card «Где живёт сервер стола в этом milestone?»: «Mac + Bonjour, заявка в OpenAI»). «Play on a phone» in the Mac menu turns on a home-network listener and announces it over Bonjour (`_fineprint._tcp`); the phone lists the table by the Mac's name, with no address or link typed. The first time, the phone and the Mac show the same four-digit code and the player confirms it on the Mac; the phone then keeps its token. Token and port kept in the data folder, so a known phone reconnects after an app restart; turning the toggle off makes a new token and forgets the phones. The link screen stays for a browser in a checkout. The phone's connect screen changes, so its lines go to Vera.

Depends on: CON-32.

Check: scope §4 row 12: token and port across a restart, Bonjour only while the toggle is on, no seat without a confirmed code (test, no model); the iPhone finds Stas's Mac at home (a person).

## Status

todo. Written 2026-11-28. Beside it, outside the repo: Stas sends OpenAI's interest form for hosted SIWC; a hosted server is its own milestone after the answer (decision 0100).
