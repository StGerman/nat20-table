# 0105. The player's device carries the model call; the table server holds no ChatGPT token

- **Status:** Proposed
- **Date:** 2026-11-28
- **Decided by:** Stas picked "4a: table server, device relays" on a card in the Sign in with ChatGPT thread, 2026-11-28, after the iPhone sign-in spike passed. Claude laid out the variants on the page "Где живёт стол" (https://claude.ai/artifact/CkzNe7mDgJvx8wektSNP3z) and recommended 4a. Accepted on merge.

## Context

Decision 0100 put the player's ChatGPT token on the table server. The fact behind that was: "the open-source SIWC flow returns the browser to `127.0.0.1` on the machine that listens, so only a browser on the server's own machine can sign in", and its consequence was "The phone never signs in".

That fact no longer holds. On 2026-11-28 a throwaway app (StGerman/nat20-app #4, `ios/SignInSpike/`) ran the same open-source flow on Stas's iPhone 14 Pro Max, iOS 27.2.1, with the listener on `127.0.0.1:1455` inside the app:

- The sheet in the app signed in: all six steps ok, 45 s with the login, app in front.
- Safari signed in twice, in 15 s and 10 s, with the app in the background, inside the roughly 30 s iOS allows.
- The Keychain kept the sign-in through a cold start, and a refresh worked.
- Model calls (`gpt-6.1-terra`, `store: false`, streamed) took 2.5 to 3.6 s.

So the phone can sign in and make the call itself. What is still unchecked is OpenAI's terms for calls that a server composes and a player's device sends.

## Options

### 1. Token on the server (0100 B as merged)
- Pro: already designed (`docs/design/sign-in-with-chatgpt-system-design.md`). Benches and the terminal seat need no device.
- Con: the phone plays only while the Mac app runs. A cloud server would hold players' tokens, which needs OpenAI's partner approval.

### 2. The whole table in one app on the device
- Pro: no server at all.
- Con: the loop, the agents and the engine are ported off Node (engine as a library, TypeScript in JavaScriptCore). That makes a second table to keep in step with this one, and an oracle to write before porting.

### 4a. Table server composes, device carries the call
- Pro: `game/` stays as it is. Only the transport under `ResponsesSession` (AGT-149) changes. The token never leaves the device. A cloud server later holds no tokens.
- Con: a relay wire, and pause-and-resend when the device drops. A locked phone pauses the table. The Narrator's prompts, which carry hidden scene data, pass through the human's device. That device is the only human's today, and the page never reads them.

### 4b. Server serves tools only, the agent loop runs on each device
- Pro: a thin server, and each device could pick its own model.
- Con: the loop, the prompts, the guards and the retry rules move into Swift on every device. That is a second copy of the table's behaviour, which is option 2's cost without option 2's gain.

## Decision

4a. The spike removed the one fact that made 1 necessary. 4a is the smallest change that lets the phone play without the Mac app, and it keeps the table in one place (this repo, on Node, with its tests). 2 and 4b both copy the table.

## Consequences

- `ResponsesSession` (AGT-149) takes a `ResponsesTransport`.
  - `RelayTransport` sends each call over a new relay wire to the human's device, which adds its token, POSTs to `/v1/responses`, and streams every SSE payload back verbatim.
  - `FakeTransport` serves the tests.
  - `DirectTransport` holds Stas's token on his Mac for benches and unattended all-AI runs. It is a developer tool and never shipped.
- The relay wire is a second WebSocket at `/relay` on the seat's listener, with its own schema and hash. It carries no ChatGPT token, plan name or usage figure.
- The page can never open `/relay` (Rule 3, structural): the relay has its own credential, a relay token apart from the seat's. It goes only into the link the Swift app reads (`--seat-lan`), and the Swift app never passes it to the page; a browser page's URL never has it. `/relay` refuses the seat token and any socket that sends an `Origin` header, which every browser WebSocket does and the Swift app's does not. A test shows that the seat token and a browser origin get no `call`.
- A relay that drops in the middle of a call holds the turn. The call is resent once, with the same id and body, when a relay is back. A second drop, or no relay within the wait (proposed: 15 minutes), stops the run as `offline`.
- From 0100, this replaces "The phone never signs in; account messages are taken from loopback only" and the token half of "owning sign-in". The rest of 0100 stands: the server lives apart from its windows; it owns lobby, party and runs; closing a window never ends a game; Bonjour and the phone toggle; B′ later.
- Sign-in moves from the server to the Swift client. AGT-148 is rewritten for the client, from the spike's code. CON-20's harness, which signs in on the server, becomes the `DirectTransport` path.
- Rows follow only after Stas accepts this record and the brief (StGerman/nat20-app `docs/brief.md`, nat20-app #1). Expected: AGT-148 and AGT-149 rewritten, a new CON row for the relay wire, CON-20 and CON-21 rewritten.
- Decision 0016's rejection of a client on the engine contract stands. The device never sees the engine.

## Revisit when

- OpenAI's terms rule out server-composed calls on a player's token: then option 1 on the player's own Mac.
- Locked phones make games unplayable in practice (the pause fires more than once a scene in friends-and-family play): then the Mac as the relay, or option 1.
- A second human sits at one table: then decide whose device carries the Narrator's calls.

## Sources

- StGerman/nat20-app #4: the iPhone sign-in spike, its review with the results table, and `ios/SignInSpike/README.md`.
- StGerman/nat20-app #1, `docs/brief.md`: the 4a brief, with the relay wire (§4) and the steps (§7).
- The page "Где живёт стол", variants 1 to 4 with sequence diagrams and failure cases: https://claude.ai/artifact/CkzNe7mDgJvx8wektSNP3z
- Decisions 0016, 0090, 0091, 0093, 0100; tasks AGT-148, AGT-149, CON-20.
