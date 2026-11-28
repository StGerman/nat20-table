---
type: Task
id: CON-34
title: "The relay wire: the server hands each model call to the player's device"
pri: P1
dest: Ours
size: M
state: todo
---

Decision 0105 and the 4a brief §4 (StGerman/nat20-app `docs/brief.md`, §7 step 3). A second WebSocket at `/relay` on the seat's listener, with its own schema and hash in `game/src/relay-wire/messages.ts`. The messages are `hello`, `signed_out`, `call {id, body}`, `event {id, data}`, `done {id, status, code?}` and `cancel {id}`. `RelayTransport` under `ResponsesSession` sends each call there and streams the device's SSE payloads back unchanged. There is one relay per table, a second one takes the first's place, and calls are told apart by id.

The relay has its own token, apart from the seat's. It goes only into the `--seat-lan` link the Swift app reads, never into a page's URL. `/relay` refuses the seat token and any socket that sends an `Origin` header (Copilot's finding on table #521). The table server also serves the page on the home network, as it serves the browser seat (`servePage()` in `driver.ts`), so the app loads it from the link and no page is pinned across repos. A fake device in TypeScript stands in for the phone in the tests.

Depends on: AGT-149 (the seam).

Check, each a test with no model: AGT-149's rows pass over `RelayTransport` and the fake device; the seat token and a browser origin get no `call`; no `Bearer`, token or refresh token in the run folder, the server's logs or its environment (new scope §4 rows 15 and 16).

## Status

todo. Written 2026-11-28 from decision 0105 (table #521, merged by Stas).
