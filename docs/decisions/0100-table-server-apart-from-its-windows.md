# 0100. The table is a local server that owns the player's records, apart from its windows

- **Status:** Proposed; its token half (the server owns sign-in, "The phone never signs in") is superseded in part by [0105](0105-the-device-carries-the-model-call.md) once that is accepted; the rest stands
- **Date:** 2026-11-28
- **Decided by:** Stas picked B with Bonjour discovery and an application to OpenAI for hosted SIWC, card in the thread, 2026-11-28 («Mac + Bonjour, заявка в OpenAI»), after asking whether a hosted web service makes sense; he asked for the choice inside the Sign in with ChatGPT design (2026-11-27 23:22Z, «можно разнести клиент и сервер но это решение должно уйти в Sign-In system-design»); Claude proposed option B in `docs/design/sign-in-with-chatgpt-system-design.md` §3; accepted on merge

## Context

The windows (the Mac shell, the iPhone shell, a browser) already reach the table only over the seat wire (decisions 0090, 0093). What is not split is ownership: the table is one process per run, started by hand in a Terminal, and the Mac window ends it with `quit` when it closes. The Sign in with ChatGPT milestone adds three things that need an owner outside any one run or window: the player's ChatGPT token, refreshed hourly; the lobby, which exists before and after a game; and a phone link that survives a restart.

Facts checked: the open-source SIWC flow returns the browser to `127.0.0.1` on the machine that listens, so only a browser on the server's own machine can sign in; hosted SIWC needs OpenAI's partner approval (scope §3 rules it out); CON-20's harness shows the Swift Mac app starting the compiled loop and the engine from its bundle on a hosted Mac; iOS runs no second process and no JIT for a Bun binary.

## Options

### A. The table stays a child of the Mac app (CON-21 as written)
- Pro: nothing new: one app, one process tree.
- Con: the phone plays only while the Mac window is open; the lobby lives in a process that dies with each game; the token's owner is a window.

### B. A local table server inside the app, a child of it, owning sign-in, lobby, party and runs
- Pro: one install; the token, the party and the lobby have one owner; every window sees the same lobby; closing a window never ends a game.
- Pro: the compiled host and `WebSeat` exist.
- Con: a second program to sign; seat wire v2; a game driver that returns instead of exiting (`driver.ts` runs once today), and the narration judge moved out of the run's end.
- Con: the phone plays only while the Mac app runs (not its window).

### B′. The same server, outliving the app
- Pro: the phone could play with the app quit.
- Con: a hidden process holding a ChatGPT token, a lock file and an idle timer, a Mac kept awake, and a server that outlives an app update with an old wire. Not now.

### C. A hosted server
- Pro: a phone with no Mac; one place to update.
- Con: hosted SIWC needs partner approval; players' plan tokens on our machine; TLS, accounts and a bill.

### D. The table on the iPhone
- Con: the loop and the engine rewritten into the app; iOS allows neither the engine process nor the Bun binary.

### E. A server installed apart (npm, Homebrew)
- Con: Terminal, where Vera quits.

## Decision

B. Sign-in forces the server onto the player's own computer, and B is the smallest change that gives the token, the lobby and the party one owner. B′ adds a lifetime nobody needs yet; C and D are different products. The riskiest part, a signed server that opens the browser and takes the callback, is tested first, in CON-20's harness, before any server code.

## Consequences

- The seat wire goes to version 2: lobby, stop and seat messages, and `hello` without a run in the lobby; the run messages are unchanged. The wire never carries a token, an address, a plan name or a usage figure.
- Closing the Mac window no longer sends `quit` or ends the app; Cmd-Q does, through the page, after which the server ends.
- The server listens on loopback only; «Play on a phone» in the Mac menu opens a home-network listener, announced over Bonjour, so the phone finds the table with no address; a phone is let in once by a code confirmed on the Mac, and its token and port are kept until the toggle is turned off.
- An application for hosted SIWC goes to OpenAI now (Stas, 2026-11-28); C is its own milestone after the answer.
- The phone never signs in; account messages are taken from loopback only.
- `npm run table` starts the same server in a checkout, so benches, CI and the terminal seat keep working.
- Rows (after acceptance): CON-20 first and rewritten; a new CON row for the server; AGT-144 merges into AGT-147; CON-21 rewritten; AGT-151 runs from the DMG (design §9).
- Decision 0016's rejection of a client on the engine contract stands; the engine stays private to the server.

## Revisit when

- OpenAI approves the hosted SIWC application: then C, as its own milestone.
- The phone should start a game while the Mac app is closed: then B′, as a launchd agent.
- A second human at one table, or a seat outside the home network: then pairing and TLS, and the wire of 0016 and 0090 reopens.

## Sources

- `docs/design/sign-in-with-chatgpt-system-design.md` §2 to §4.
- Decisions 0016, 0090, 0091, 0093.
- https://developers.openai.com/siwc (open-source flow, read 2026-11-21); spike project file `engine/siwc/spike.mjs`.
- `game/spike/glass-table/` (CON-20's harness).
