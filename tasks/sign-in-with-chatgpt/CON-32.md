---
type: Task
id: CON-32
title: "The table server lives between games"
pri: P1
dest: Ours
size: M
state: todo
---

`docs/design/sign-in-with-chatgpt-system-design.md` §5.1 to §5.3, decision 0100; scope In 7. The host of `play:demo --seat web` becomes a server that lives between games: lobby, a game, the lobby again, one engine process and run folder per game. A driver that returns instead of exiting (`game/src/play/driver.ts` exits the process in 19 places today), with the narration judge moved out of the run's end to a step only Stas's tools run. `npm run table` starts it in a checkout. Seat wire v2 in `game/src/seat-wire/messages.ts`: `lobby`, `stopped`, `start`, `sign_in`, `sign_out`, `seat`; `hello` with the run fields in a `game` part only during a game; every window gets `lobby`, a seat is taken only by `start` or `seat`; `sign_in` and `sign_out` only from loopback; the leak scan covers the new messages. AGT-141's open "lobby requests" are these. The Mac shell's half: the Swift app starts the server as its child and passes it the loopback token; closing the window leaves the app and the game running; Cmd-Q asks the page for `quit`, then ends the server; `shell/MacTour`'s window-close test turned the other way; keep-awake only during a game.

Depends on: CON-20 (the report), AGT-149.

Check: scope §4 rows 8, 9 and 11, each a test with no model (row 11 on the macOS runner).

## Status

todo. Written 2026-11-28 from the sign-in design (table #515, accepted by Stas's merge).

2026-11-28, decision 0105: the server still lives between games, but it holds no token. `sign_in` and `sign_out` leave the seat wire, and the account state comes from the relay's `hello` and `signed_out` (CON-34). The Mac shell's half moves to the nat20-app client's Mac target (CON-39), so row 11's test runs there.
