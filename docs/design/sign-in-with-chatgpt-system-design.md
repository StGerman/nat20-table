# Sign in with ChatGPT: system design

- **Status:** Proposed; accepted on merge. No task row changes before Stas accepts it.
- **Date:** 2026-11-28, main e83ba40
- **Decision:** `docs/decisions/0100-table-server-apart-from-its-windows.md` (Proposed): the table server owns the player's records, apart from its windows. Decision 0091 (the full switch, terra) stands as it is.
- **Scope:** `docs/scope/sign-in-with-chatgpt-scope.md`, amended by §9 here.
- **Asked by:** Stas, 2026-11-27 23:22Z: «закрываем сейчас и пошли делать Sign-in + лобби. Еще я опять думаю что можно разнести клиент и сервер но это решение должно уйти в Sign-In system-design»
- **Takes in from Glass Table** (decision 0099, table #513): the lobby (AGT-144), AGT-141's two open items, the Mac report (CON-20) and the signed DMG (CON-21). Glass Table's exit pair (AGT-145) closed there as wont-do and points at AGT-151.
- **Inputs:** the accepted design https://claude.ai/artifact/HzwDT2avCY5Bwu2Knri66E and its spike (project files `engine/siwc/spike.mjs`); decisions 0016, 0090, 0091, 0093, 0099; the SwiftUI shell design; table #510 (no call after `narrate`); the Opus reference run `runs/full-2026-11-21T13-39-23-446Z` in nat20-runs.
- **Read by:** Lev and Vera (fallback), 2026-11-28, §11. Lev's ten findings are applied; where one is not, §11 says why.

## 1. Summary

Two changes, and nothing in the engine, the contract crate, the audit or the Rule 3 projection.

1. **The model.** The table talks to ChatGPT only, through the player's own plan (decision 0091). `ResponsesSession` replaces `AgentSession`; the Narrator and the players run on gpt-6.1-terra.
2. **The split.** The table becomes a server that owns the player's records: the ChatGPT sign-in, the lobby, the saved party, the runs and the engine. It is a program of its own inside the Mac app and lives as long as the app, not as long as one game or one window. Every window (the Mac's, the iPhone's, a browser's in a checkout) is a client of it over the seat wire. Closing the Mac window no longer ends the game; quitting the app does, and saves first.

Would Vera get through this alone? Not yet, for a reason this milestone cannot fix: CLAUDE.md gives her a Claude Pro plan, and after decision 0091 she needs ChatGPT Plus or Pro. Her blind read of the lobby (§11) stopped at the first screen for exactly that. Everything else in her way is the design's to fix: one app from a DMG, no Terminal, a closed window loses nothing. The DMG reaches her only once it is notarised (§10, question 2).

## 2. Why split now

Today the server is `npm run play:demo -- --seat web --seat-lan` in a Terminal on Stas's Mac: one process for one run, started by hand, ended by the run's end or by the Mac window, which ends the app and sends `quit` when it closes (`shell/Mac/MacApp.swift`, `applicationShouldTerminateAfterLastWindowClosed`). The windows are already clients at the wire; what is not split is *ownership*. Three things in this milestone force the question:

- **The sign-in token has to live somewhere.** It is the player's ChatGPT plan, refreshed every hour. It belongs with the process that calls the model, never with a window, never on the wire.
- **The lobby comes before a run.** A process born with a run and dying with it cannot show "go on, or a new journey". Something has to exist between games.
- **The phone.** Stas played the Mill on his iPhone (decision 0099). That table lived as long as a Terminal on the Mac.

## 3. Options for the split

| | Where the table runs | Lifetime | Sign-in | Verdict |
|---|---|---|---|---|
| **A. As planned (CON-21 as written)** | Mac, a child of the Mac app | one run; closing the window ends it | in the app | The lobby lives in a process that dies at each game's end; the token's owner is a window. |
| **B. A local table server inside the app** | Mac, its own program, a child of the app | as long as the app; a closed window leaves the app and the game running; Cmd-Q saves and stops | on the Mac, in the server | **Recommended.** One install; the token, the party and the lobby have one owner; the phone and the Mac see the same lobby. |
| **B′. B, outliving the app** | Mac, detached | until «Stop the table» or idle | on the Mac | Not now (Lev, finding 2): a hidden process holding a ChatGPT token, a lock file, an idle timer, a Mac kept awake, and a server that survives an app update with an old wire. Later, as a launchd agent, if the phone should start games with the app closed. |
| **C. A hosted server** | our cloud | ours | hosted SIWC, which needs OpenAI's partner approval | Out. Players' plan tokens on our machine, TLS, accounts, a bill. Scope §3 already rules out hosted SIWC. |
| **D. The table on the iPhone** | the phone | the phone's | the phone | Out. iOS runs neither the engine process nor a Bun binary. |
| **E. A server installed apart** (npm, Homebrew) | Mac | the player's | Terminal | Out. Vera quits at the first Terminal step. |

### Sign-in decides where the server can be

The open-source SIWC flow returns the browser to `http://127.0.0.1:<port>/auth/callback` (developers.openai.com/siwc, read 2026-11-21; the spike signed in this way on Stas's Mac). The browser that signs in must run on the machine where the server listens. On the Mac that is the system browser, opened by the server. On the phone it would be the phone's own `127.0.0.1`, where nothing listens. So the phone never signs in, and a server anywhere but the player's own computer needs the hosted flow (C).

## 4. The records

| Record | Written by | Read by | Where | What the player sees of it |
|---|---|---|---|---|
| ChatGPT tokens (access, refresh), client id, host id | the server's sign-in adapter | the server's `ResponsesSession` | token file, mode 0600, the app's data folder | "Playing on your ChatGPT plan"; never a name, address, plan or figure |
| Phone token and port, Bonjour name | the server, when «Play on a phone» is turned on | the phone, after the code is confirmed on the Mac | the data folder; the phone keeps its token | the Mac's name and the four-digit code, once per phone |
| Saved party | the loop, after every night and on every exit (API-45) | the lobby, `start` | the data folder | the lobby's saved-party line |
| Run folder | the loop | audit, judge on Stas's Mac, `runs:upload` | the data folder | nothing |
| Prompts | `npm run prompts:pull` | the loop | `game/prompts/`, in the app's resources | nothing |

## 5. The parts (option B)

```
 windows (clients)                         the Mac: Fine Print.app (one process tree)
┌──────────────────────┐                  ┌──────────────────────────────────────────────┐
│ Mac window (SwiftUI) │──┐ loopback      │ Swift app: window, menu; starts and stops ▼  │
└──────────────────────┘  │               │ table server (Bun-compiled loop host)        │
┌──────────────────────┐  │ seat wire v2  │  lobby ── sign-in adapter ── token file 0600 │
│ iPhone (SwiftUI)     │──┼──────────────►│    │                                          │
└──────────────────────┘  │ home network, │    ▼  one game at a time                     │
┌──────────────────────┐  │ only while    │  loop ◄─► ResponsesSession ──► /v1/responses │
│ browser (checkout)   │──┘ toggled on    │    │ stdio                     (ChatGPT plan) │
└──────────────────────┘                  │    ▼                                          │
                                          │  nat20-api-server (one per game)              │
                                          └──────────────────────────────────────────────┘
```

### 5.1 The table server

The host of `play:demo --seat web` made to live between games.

- **States:** lobby, then a game, then the lobby again. A game is one run as today, with its own engine process and run folder. The run's end (scene 6, `quit`, a stop) returns the server to the lobby. This is real work: `game/src/play/driver.ts` is written to run once (it exits the process in 19 places, and its after-run pipeline calls the narration judge, which runs on Claude and must not ship). The server needs a driver that returns instead of exiting, and the judge moves to a step only Stas's tools run.
- **Starts and ends with the app.** The Swift app starts it as a child, as CON-20's harness starts its stand-in host, and ends it on Cmd-Q after the page has sent `quit`, so the party is saved. Closing the window leaves the app in the Dock and the game waiting at the human's next ask; AI turns already under way finish. Keep-awake (`caffeinate -w`) is held only while a game is running.
- **In a checkout,** `npm run table` starts the same server, so benches, CI and the terminal seat keep working.
- **Dies:** the app sees the socket close, starts the server again, and the window shows the stop card (§7).

### 5.2 Where it listens

- **Loopback by default.** The Mac window connects with a token the app passes to the server at start; the Mac never shows a link screen.
- **«Play on a phone»** in the Mac menu turns on a second listener on the home network and announces it over Bonjour (`_fineprint._tcp`). The phone finds the table by itself: no address and no link to paste (Stas's pick, 2026-11-28). The first time, the phone shows the Mac's name and a four-digit code that the Mac shows too; once the player confirms it on the Mac, the phone keeps the token. Token and port are kept in the data folder, so a known phone reconnects after a restart; turning the toggle off and on again makes a new token and forgets the phones. The link screen stays for a browser in a checkout. The token still crosses the home network unencrypted (decision 0093); pairing and TLS still come before anyone outside the project plays on a phone.
- **Account actions only from loopback.** `sign_in` and `sign_out` from a network socket are refused; the page words that as "sign in on your Mac".

### 5.3 Seat wire v2

The wire's version goes from 1 to 2 and the hash changes. The run messages stay as they are.

- **Host → window:** `lobby` (adventures and characters on offer, the saved party if any and what it was doing, what "new" would replace, `account`: `signed_out`, `signing_in`, `signed_in`, `ineligible`; the lobby's language); `stopped` (its `StopKind`, what was kept, and whether «Go on» resumes). `hello` loses `run`, `handle` and `title` as required fields: they move to a `game` part that is present only during a game.
- **Window → host:** `start` (adventure, character, go on or new), `sign_in`, `sign_out`, `seat` ("play here").
- **One seat, many lobbies.** In the lobby every connected window gets `lobby` and its updates; nobody holds the seat. A seat is taken only by `start` or `seat`, and only then does `CLOSE_REPLACED` apply. So opening the Mac app to sign in does not take a game off the phone.
- **Menu actions go through the page,** as `quit` does today: the shell asks the page, the page sends the message. The shell still writes only `resume` and pings (decision 0093).
- **A hash mismatch** gets a plain line instead of today's raw "wire 2 ab12…, page 1 cd34…" (`game/src/page/reduce.ts`): "This app and the table on your Mac are from different updates. Update both, then open the table again." It goes to Vera with the lobby's lines.
- The wire never carries a token, an email address, a plan name or a usage figure; the leak scan over `seat-wire.jsonl` checks the new messages too. These are AGT-141's open "lobby requests", now with a home.

### 5.4 The sign-in adapter (AGT-148)

As the row says: `status()`, `signIn()`, `signOut()`, PKCE S256, `dynamic_agent_client` on first sign-in and the issued `oaiapp_…` id after, a stable host id, rotating refresh with `resource=https://api.openai.com/v1`, revocation on sign-out. It runs in the server; `signIn()` opens the system browser with `open` and listens on loopback for the callback. That a signed server started by a signed app under the hardened runtime can do both is **not yet shown** (§6).

### 5.5 `ResponsesSession` (AGT-149)

Replaces `AgentSession` behind `TurnSession` (`game/src/agents/sdk-session.ts`) for the Narrator, the players, the describer and the suggester. Our own loop, no framework:

- `POST /v1/responses`, `stream: true`, `store: false`, the whole history each call; seat tools as function tools from their zod shapes.
- In the Narrator's `narrate` and `combat_over` wakes the settling `narrate` ends the loop with no further call; its tool result stays in the history for the next turn (table #510: the closing call was 40 to 46% of the Narrator's calls, and 119 of 120 were text only). Other wakes call until the model stops.
- A 401 refreshes once and retries. A refused refresh, a 429 `subscription_sharing_usage_limit_exceeded` and a 403 `subscription_sharing_user_not_eligible` become stops; a 503 retries with backoff. `LoginExpired` and `UsageLimitReached` in `game/src/errors.ts` speak of Claude and of running `claude` in a terminal today; their text is rewritten for ChatGPT, and a `PlanNotEligible` is added.
- Usage records keep input, cached and output tokens per call, so a run can be read against the five-hour window.
- The narration judge keeps `AgentSession` on Stas's Mac only. Nothing of Claude ships in the app.

### 5.6 Prompts (AGT-152)

As the row says: tunable text in files under `game/prompts/`, picked by code; `PROMPTS=langfuse:<label>` only in bench runs on Stas's Mac; `npm run prompts:pull` back to the repo. The app reads files only. The accepted design named `game/prompts/<provider>/`; with one provider that folder level adds nothing, so this design drops it.

## 6. The biggest risk, tested first

A Developer ID-signed Swift app starts a signed Bun-compiled server under the hardened runtime; the server opens the system browser and takes the SIWC callback on loopback; then makes one streamed `/v1/responses` call. None of that has run together. CON-20's harness runs a stand-in host that ends with the app, on a hosted Mac, with no model call, and Stas's report is still open.

So CON-20 goes first, not eighth: its harness is extended to this lifetime and this sign-in (the spike's sign-in code inside the stand-in host), and Stas's one evening at the Mac answers both its old items and this one. The Claude Code lookup it also asked about is gone with Claude. If it fails, the server cannot be the app's child, and this design returns to Stas before any server code is written.

## 7. What the player sees

Lines first in English; the Russian table lines with the same meaning go with AGT-147, and to Vera again. Draft, after Vera's read (§11). Fiction first: the saved party or the adventure leads, and the account is one quiet line under it.

| State | Line | Button |
|---|---|---|
| Signed out, on the Mac | The storyteller and your companions are played by ChatGPT, on your own ChatGPT Plus or Pro plan. Sign in once on this Mac; the game itself costs nothing more. | Continue with ChatGPT |
| Signing in | A browser window has opened: finish signing in there, then come back. | Cancel |
| Signed out, on the phone | Sign in on your Mac first: open Fine Print there and press Continue with ChatGPT. | (none) |
| Signed in (one line under the lobby) | Playing on your ChatGPT plan. | Sign out · How much is left (opens chatgpt.com/settings/usage) |
| Start | the adventure's own opening line (not drafted here: a question for Zoya and Stas; `adventure.json` holds only a title today), and how long a game takes | Sit down at the table |
| A saved party | Your party stopped after the second night on the road. | Go on · Start a new journey (and, before it is taken: what the new journey replaces) |
| Stop: plan limit | ChatGPT has reached its limit for the next few hours, so the story stops here. *(what was kept, per §7.1)* | When can I go on · Back to the table |
| Stop: plan not eligible | Your ChatGPT plan doesn't include games like this one. Plus or Pro does. | See ChatGPT plans · Back to the table |
| Stop: signed out | ChatGPT asked you to sign in again. *(what was kept)* | Continue with ChatGPT |
| Stop: the Mac app quit | Fine Print was closed on the Mac. *(what was kept)* | Go on |
| Stop: no connection to ChatGPT, or the table broke | the loop's `offline` and `crash` stops get cards of their own in the same shape | Go on |

### 7.1 What a stop keeps

The words "saved" and «Go on» must match what the save does (Lev, finding 1):

- **On the road** (a saved party in the living world): the party is saved on every exit, and a game goes on from the last night. The card says "Your party is saved as it was this morning on the road; today's road will be played again."
- **The Silent Mill**, a one-shot with no days: a stop inside it keeps nothing a player can return to; «Go on» would be scene 1 again. The card says so plainly ("The Silent Mill can't be paused in the middle; next time it starts from the beginning") and its button is «Start again», not «Go on». A resume inside a scene or a fight is not built here; Glass Table design §7 named that gap and it stays named.
- Cards are keyed on `StopKind`, so a kind with no card fails `tsc`; every stop card has a way back into the app.

## 8. Failure and security

| What fails | The player sees | The system does |
|---|---|---|
| The Mac window closes | nothing; reopened from the Dock, the same screen | the game waits at the next ask; the window resumes by `seq` |
| The phone drops | its no-connection line, then the same screen | the same |
| The server dies | the stop card, then the lobby | the app starts it again |
| The Mac sleeps | the phone shows its no-connection line | keep-awake holds during a game only; on wake the server goes on |
| Plan limit, not eligible, sign-in refused | the cards of §7 | the run folder is kept, the party saved |

Security does not move from decision 0093, except that the network listener is now off unless the player turns it on. The ChatGPT token never leaves the data folder.

## 9. Changes to the scope and the rows (after Stas accepts)

1. **Scope §2** gains: the table server (5.1), where it listens (5.2), seat wire v2 (5.3), the lobby built once on ChatGPT, the DMG with the server inside.
2. **AGT-144 merges into AGT-147:** one lobby, built once, on ChatGPT.
3. **New row, CON-32 "The table server lives between games"**: 5.1 to 5.3, the driver that returns, the Mac shell's half of 5.1 (the window closes, the app stays; Cmd-Q quits through the page), and `shell/MacTour`'s window-close test turned the other way. **New row, CON-33 "The phone finds the table"**: Bonjour announce and browse, the four-digit code, the phone's kept token; the phone's connect screen changes, so its lines go to Vera.
4. **CON-20** first: the harness extended to 5.1's lifetime and 5.4's sign-in; its Claude Code item dropped.
5. **CON-21** builds the DMG with the server as a second signed program in the bundle.
6. **AGT-151** runs from the DMG: one exit pair, on terra.
7. **Exit rows added,** each with its lowest layer:
   - 8. A second game in one server process, after a first that ended by scene 6 and one by a stop: test, no model.
   - 9. In the lobby, two windows both get `lobby`, and neither is replaced until one sends `start`; a network socket's `sign_in` and `sign_out` are refused: test, no model (`game/test/seat-wire.test.ts`).
   - 10. Every lobby state and every `StopKind` puts up its line and button from a fake adapter; «Go on» after a stop puts the party where its card said (scripted scene, injected stop, reload): test, no model.
   - 11. The Mac window closed during an ask sends nothing, and Cmd-Q sends `quit` before the server ends: test on the macOS runner, no model.
   - 12. The phone token and port survive an app restart while the toggle is on; the server announces itself over Bonjour only while the toggle is on, and a phone without a confirmed code gets no seat: test, no model. The iPhone finds Stas's Mac with no address typed: a person (Stas, at home).
   - 13. The DMG starts the server with no checkout, Rust or Node: CI on a hosted macOS arm64 runner (no model); then Stas installs it, signs in and plays a scripted scene (a person).
   Row 5 (Vera reads the lobby's lines) covers §7 and the mismatch line.

## 10. Order, cost and what waits on Stas

In order; 3 to 6 run side by side.

1. This design, decision 0100, the scope amendment and the rewritten rows: one docs PR.
2. CON-20 extended (§6), then Stas's evening at the Mac.
3. AGT-148, the sign-in adapter (no model; fake auth server).
4. AGT-150's first half: two Claude benches on at least 10 cards, on Stas's Mac, before the Claude loop goes.
5. AGT-152, prompts in files.
6. AGT-149, `ResponsesSession`.
7. CON-32, the table server and wire v2, and CON-33; then AGT-147, the lobby.
8. AGT-150's second half: the terra bench, Zoya and Vera on a sample.
9. CON-21, the DMG.
10. AGT-151, the exit pair.

Cost: the scope's 9 to 12 thread-days, plus 3 to 4 for CON-32, 1 to 2 for CON-33 (the run-once driver is most of it) and the lobby moved in, less the Claude lobby no longer built (about 1). Claude's estimate, not calibrated; Yan prices it once the design is accepted.

Waits on Stas:

1. Accept the split (B), or keep A.
2. **The paid Apple Developer account** (99 USD a year). Without it the DMG is ad-hoc signed: it runs on Stas's Mac and Vera's Mac refuses it. Recommendation: the exit pair runs on an ad-hoc DMG on Stas's Mac, and notarisation becomes its own row before Friends and Family, so this milestone is not held by a purchase.
3. **Vera's plan.** CLAUDE.md gives her Claude Pro; after 0091 she needs ChatGPT Plus or Pro. Either the persona changes (she has ChatGPT Plus) or the Friends and Family target says a friend must buy it. Not this milestone's to decide, but her lobby test fails on it until it is.
4. Whether Start says what a game takes from the plan (about 15 to 25% of a five-hour window on terra, a guess until exit row 7 reads it).
5. Evenings at his Mac: CON-20 (step 2), the Claude benches (step 4), the terra bench and Langfuse (step 8), the exit pair.

Stas's pick, 2026-11-28 (card «Где живёт сервер стола в этом milestone?»): the server stays on the Mac, the phone finds it over Bonjour, and an application for hosted SIWC goes to OpenAI now; a hosted server is its own milestone after OpenAI answers. Stas sends the application himself (OpenAI's interest form for hosted SIWC; the facts it needs: an open-source MIT project, a story game for a few friends, the Responses API with function tools, `store: false`).

Later, not in this milestone: the server outliving the app (B′, launchd) so the phone can start a game with the app closed; TLS on the home network; a resume inside a scene; the hosted server (C), once OpenAI approves hosted SIWC.

## 11. Reads

**Lev** (2026-11-28, ten findings, "approve with these fixes"). Applied: the stop cards say what the save keeps, per run kind, and «Go on» is tested (1, §7.1); the server lives with the app, not past it, and the lock file and idle timer are cut (2, §3 B′, §5.1); loopback by default, a phone toggle, port kept with the token, account actions only from loopback (3, §5.2); "new" names what it replaces (4); lobbies for every window, a seat only on `start` (5, §5.3); fiction first, the Start line left to Zoya and Stas (6); exit rows for what B adds (7, §9); every wire message has a sender, `table` dropped, menu actions through the page, a plain mismatch line (8); the claims he found wrong corrected (9); a records table and the biggest risk first (10, §4, §6). Not applied: "the last journey again" (AGT-144's third lobby answer) is cut on purpose, since on the road "go on" already continues the same party and the Mill has no journey to repeat; Stas can put it back.

**Vera** (fallback, 2026-11-28, on the first draft of §7's lines; the verdict is the fallback's, which may still see CLAUDE.md). Verbatim, sections 3 and 4 of her answer:

> 3. Where I became a passenger
> Screen 1. I'd have closed the laptop at "Continue with ChatGPT". I'd stop there. If I'd somehow got further, screen 7 would be the second place: "saved as it was at the start of this day" reads to me as "you lost tonight's work."
>
> 4. Where it got dull
> I read screen 7 twice. "ChatGPT says when it resets on its usage page" means the app is sending me somewhere else to find out when I can come back. The phrase "used up what it allows for now" is limp; "what it allows" just hangs there. On screen 2, "signing in in" trips over itself.
> What made me smile: "Sit down at the table." That's a nice invitation. "Your party stopped after the second night on the road" sounds like a novel, and I'd have pressed "Go on" for that sentence alone.

Her first stop is her plan (§10, question 3). Changed after her read: the first screen names Plus or Pro; "Manage usage" became "How much is left"; the limit card says "the next few hours"; the saved-party words say "this morning on the road"; the Mac-quit card says what closed; "signing in in" is gone. Vera reads the revised lines, the Russian ones and the mismatch line again in AGT-147.

No pack, scene or card changes, so there is no board for Zoya to check.
