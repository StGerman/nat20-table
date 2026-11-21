# Glass Table: system design of the Mac app

- **Status:** Proposed; accepted on merge
- **Date:** 2026-11-21, main c1746be
- **Decision:** `docs/decisions/0090-local-web-client-in-a-shell.md` (Proposed)
- **Scope:** `docs/scope/glass-table-scope.md`
- **Asked by:** Stas, 2026-11-20 22:05Z (a prototype on Apple's interface guidelines and Liquid Glass), 22:50Z (he picked the Glass Table look and feel), 2026-11-21 01:01Z (this design), 01:11Z (one package of the JS and Rust parts: «Звучит отлично запланируй с Яном пожалуйста»), 07:29Z (card: Glass Table goes first in the milestone order)
- **Prototype it describes:** [Glass Table](https://claude.ai/artifact/MSgifgUKiLPXCmq4XxQf1L), version 4, with Lev's gap list and Vera's three reads
- **Plan:** Yan, 2026-11-21, quoted in the scope §7
- **Read by:** Lev, 2026-11-21, at Stas's ask («Лев читает»); his findings are applied here and listed in the scope §5

## 1. Summary

Glass Table becomes a Mac app in three layers: a typed seat wire out of the game loop, a web page that draws the prototype's structure, and a thin shell that gives it a window, a menu bar and a place on disk. The engine, the contract crate, the audit and the Rule 3 projection do not change. The terminal seat stays.

- **The expensive part is the wire, not the glass.** Today `Seat.show` receives lines already formatted for a terminal. Every Glass Table element that is not plain text (roll tokens, the roll stage, the yard lens, the sheet inspector, card votes) needs the same fact as data.
- **The limit.** Liquid Glass as Apple ships it exists only in SwiftUI and AppKit. In a web view it is CSS `backdrop-filter`: close to the look, not the system material. This design accepts that for the first build and keeps a native client possible as a second client on the same wire.
- **Sign-in is a screen of the app.** The lobby shows the model provider's sign-in state. The first build has one provider, Claude.

## 2. Requirements

### 2.1 What it does

1. One window for one human at one table: the story as the content layer, a floating control layer (toolbar, portrait rail, dock), two lenses («Где все», «Дорога») and two inspectors («Лист», «Люди»).
2. Every state the terminal seat has today: combat turn, follow-up pick, reaction, the Narrator's question, surrender, road card with votes, road step, level-up, pause, suggestions, narration preview, refusal and notice lines. `HumanPrompt` has 10 kinds.
3. A lobby before the table: adventure and character, the saved party (go on with it, start a new one, or play the last journey again: the start screen's three answers, API-51), sign-in state, start.
4. The same run folder as today, so the audit, the judge and `runs:upload` work unchanged.

### 2.2 What it must hold

| Requirement | Target | Lowest layer that tests it (0080) |
|---|---|---|
| Rule 3: the page never receives hidden data | the wire module imports player-view and owner-view types only; `seat-wire.jsonl` holds no DM-view field or value | test, no model |
| Rule 4: the die shows only the engine's number | the roll stage takes a roll by id and has no random source | test, no model: replay, faces against the engine log |
| Nothing lost on reload or a dropped socket | the page's state is rebuilt from the host's log from `seq` 0 | test, no model |
| Install without Terminal, for the parts that are ours | one signed and notarised DMG | a person |
| Accessibility | VoiceOver reads story and dock; Reduce Transparency and Increase Contrast swap glass for solid; every dock action has a key | Playwright with the media features set; a person |
| One language at the seat (0067) | all words stay in `game/src/table/words.ts` | existing tests |

### 2.3 Constraints

- Apple Silicon, one human, local play. No server and no accounts of our own.
- Claude Code is not bundled: each player installs the unmodified program and signs in through Anthropic (Stas, 2026-11-20). Would Vera get through this alone? No: that install needs Terminal today. Until Anthropic answers (Friends and Family D1) the app serves Stas and engineers.
- The loop's runtime in the app is Bun (Stas, 2026-11-20). CI and the terminal seat stay on Node.
- Decision 0016: no client talks to the engine. It deferred the client wire until a client was planned; 0090 settles it for a local client.
- Decision 0043, read for a packaged app: the exit pair runs on one signed package, the all-AI half from its bundled binaries.

## 3. Architecture

```
            Glass Table.app
 ┌──────────────────────────────────────────────────────────────┐
 │  Shell (Tauri) ──opens──►  Page in the web view              │
 │   window, menu bar,         one reducer over seat events;    │
 │   starts the host           story, dock, lenses, inspectors  │
 │        │ starts                       ▲                      │
 │        ▼                              │ seat wire: JSON over │
 │  Table host (Bun-compiled game loop)  │ WebSocket, 127.0.0.1 │
 │   agents ◄──► game loop ◄──► WebSeat ─┘                      │
 │     │             │ stdio      │ appends                     │
 │     │             ▼            ▼                             │
 │     │      nat20-api-server   run folder (seat-wire.jsonl, …)     │
 └─────┼────────────────────────────────────────────────────────┘
       ▼
  Claude Code (the player's own, through TurnSession)
```

Two parts are new: the page and `WebSeat`. The page talks to nothing but the seat wire: not to the engine, not to a model, not to the disk. Dependencies still point down only, and nothing depends on the page.

- **Shell.** Owns the window, the menu bar and the app's place on disk. Starts the host, waits for its port, opens the page with a per-launch token. No game logic.
- **Table host.** The game loop as `npm run play` runs it, compiled with `bun build --compile`, with `WebSeat` in the seat's place. One host per window, one engine per host.
- **Page.** Draws what the seat is sent and sends back intents. It opens in a plain browser against a host or a recorded log, which is how it is tested.

## 4. The seat wire

The boundary exists: `Seat` in `game/src/table/types.ts`, `TableEvent` out, `PlayerIntent` in. `WebSeat` is a third implementation beside `InkSeat` and `ScriptedSeat`. The loop does not learn that a window exists.

### 4.1 Transport and types

JSON messages over one WebSocket on `127.0.0.1`, a random port, a per-launch token; one client per token. zod schemas in one module, `game/src/seat-wire/`, exported as JSON Schema with a hash that the page checks at `hello`, as the engine client does. Why this and not the shell's own bridge, AG-UI or protobuf: decision 0090.

### 4.2 Messages

| Direction | Message | Carries | Today |
|---|---|---|---|
| host to page | `hello` | wire hash, run id, language, the human's handle, pack title | new |
| host to page | `event` | `seq` and one `TableEvent` | exists; needs data beside the text (§4.3) |
| host to page | `ask` | `HumanPrompt` and an ask id | `Seat.ask` |
| host to page | `busy`, `preview`, `suggest`, `unnarrated`, `answering` | as the optional `Seat` methods | exists |
| page to host | `intent` | ask id and one `PlayerIntent` | exists |
| page to host | `resume` | last `seq` seen | new |
| page to host | `command` | a command with no ask id (`pause`, `quit`), read between wakes | new: today a command is taken only inside an open ask |
| page to host | lobby requests | list packs, pick, the saved party's three answers, sign-in state, start | new |

Every `event` is appended to `seat-wire.jsonl` in the run folder before it is sent. That file gives reload and reconnect (replay from `seq`) and the fixtures for the page's tests.

It is a new file, apart from `seat.jsonl`. That one exists since Milestone 12: `{at, kind, text}` for each thing the seat drew, read by the language scan in `game/src/play/exit.ts` and by Vera's reads. `WebSeat` keeps writing it, with the text the page shows, so the scan and the run tooling read an app run as they read a terminal run.

### 4.3 What is missing at the seat today

The engine already returns all of this to the loop in player or owner view. The seat gets it as formatted text. None of it changes the engine contract, so Rule 1's order does not apply; the PR that adds these fields says so. One exception, outside this table: the one-line record of a people (the Corrins' line, scope §5) needs a place in the world's data and a field in the player's view of it, which is an engine contract change under Rule 1 and gets its own row.

| Glass Table element | Needs | Seat has today | Gap |
|---|---|---|---|
| Roll token and its popover | the player-view roll: id, kind, die, total, outcome, who, on whom | `engine` event: text and a roll id | the roll beside `text` |
| Roll stage for the human's own roll | the same, flagged `own`, before the narration | the `own` flag | same field |
| Which sentence a token sits in | the roll ids a narration tells | lines held for their narration (AGT-37), unlinked | `rolls` on `narration` |
| Dock chips and «Все ходы» | options with cost, summary, targets, and why one is unavailable | `options.choices` with `about`; `budget` | the engine's `unavailable` options with their message |
| Explaining popover | the rule's summary and uses left | `about.summary` | uses left, from the owner's sheet |
| Yard lens with reach ring | positions and anchors in feet | `situation`: distances only | `position_ft` and anchors from player state |
| Road lens | trip legs, where the caravan is, discovered places | `situation.road`: a text sketch | the legs as data from the player world view |
| «Лист» | the sheet as data | `info`: formatted text | the owner's sheet beside `text` |
| «Люди», name tokens, «Помнит» | people with state and what they remember | `situation.people` (AGT-107) | none |
| A road card | one `card` object from the player's card view: text, who decides, choices, who said what in order, the own-move row, a move that fell, what was decided | an `info` text for the card and who decides, numbered lines, the own-move row as a bare line, its endings as `info` texts (`game/src/table/loop.ts`) | the `card` object beside those texts |
| The player's own words | an echo of every intent, so a reload keeps it | the terminal seat echoes it locally | an event from the host |
| Contract terms | the escort contract from the player world view | not shown as data | the terms beside the road data |
| Death saves | the two counts; each save shown on the roll stage as the player's own roll | `life_state` | the counts from the contract's `death_saves`. The engine rolls the save and no prompt kind asks for it, so the page reveals a roll already made and never draws it as a choice |
| Level-up | each choice with a player-facing line | numbered lines | content, not wire: the Russian lines do not exist |

**Words come from the host.** Russian names and lines are resolved on the host today (`game/src/ui/people.ts`, `game/src/table/situation.ts`). Every structured field carries the name the seat shows, and the page composes no sentence of its own: a line such as «На кости 18, всего 23» arrives as text. Otherwise the page could show English that the language scan, which reads `seat.jsonl`, never sees.

**The own move.** The wire carries the own move as the loop has it today. Decision 0083's roll by the player's own hand has no code and no task yet; the wire does not wait for it.

**Rule 3.** Each added field is copied from a view the projection already produced; the wire module never builds a view. A leak scan over `seat-wire.jsonl` runs beside the one over agent inputs. Narration is still model text behind the existing guard; the app neither adds to that risk nor removes it.

## 5. The page

### 5.1 State

One pure function, `reduce(view, message) -> view`: no DOM, no clock, no network. It is the app's `SeatView` (`game/src/ui/ink-seat.ts`) and holds the rules of the screen:

- which dock form is up follows from the open `ask` and the last `options`;
- engine lines are held until their narration arrives and become tokens inside it; `unnarrated` releases them as they are;
- an `own` roll opens the roll stage first; its token appears after;
- spent moves leave the dock, and one line says why (Stas, 2026-11-20 and 2026-11-21);
- nobody is shown as dead before the story has told it: the rule the terminal seat keeps (`ink-seat.ts`, `people.ts` `asTold`) moves into the reducer with a test;
- every roll sent to the seat is a token the player can reach by the next ask, cited by the narration or not.

A recorded `seat-wire.jsonl` replayed through it gives the exact screen at any `seq`. That is the main test surface.

### 5.2 Parts

| Layer | Parts |
|---|---|
| Content | story column, place headings, speech rows, name tokens, roll tokens |
| Control, top | title, turn pill, «Рассказ / Где все» switch, «Лист», «Люди» |
| Control, side | portrait rail, «Рядом» medallion |
| Control, bottom | the dock: input capsule, chips, sheet of moves, waiting pill, card, moment |
| Over | roll stage, popovers, inspectors, lenses |
| Shell | menu bar with a command and a key for every dock action |

React 19, already a dependency of `game/` through Ink. Plain CSS on one token set with a light and a dark value each (Stas, 2026-11-20); no component library. Glass only on the control layer, one solid fallback. The die is the WebGL d20 prototyped on 2026-11-20 (`rollTo(value)`): blank until the engine's number arrives, and with no way to produce one. The yard is SVG from positions and anchors; no terrain is invented. The road is the Wend relief with the authors' layer cut and only discovered places drawn.

### 5.3 Debts to Apple's guidelines, kept on purpose

1. The bottom dock. The guidelines say to keep critical actions out of a bottom bar on a Mac. The story reads downward and the action belongs at its last line; the menu bar commands pay for it.
2. Pause while an AI player acts: `/pause` exists in the loop, but a command is consumed only inside an open ask, so the control needs the `command` message of §4.2.
3. No undo: the engine has none and Rule 4 forbids faking one. The app confirms only what cannot be taken back.

## 6. Sign-in and model provider

The Narrator and every player reach a model only through `TurnSession` (`game/src/agents/sdk-session.ts`). A provider is one implementation of it plus a sign-in adapter with `status()` and `signIn()`. The first build has one, Claude: `status()` says whether Claude Code is installed and signed in, `signIn()` opens Anthropic's own flow through the unmodified program, and its secrets stay in Claude Code's own store. A second provider (the "Sign in with ChatGPT" design, Proposed, not part of this milestone) would be a second pair behind the same two interfaces and a `provider` key in the run profile.

Tokens never cross the seat wire and the page never shows a password field. `LoginExpired` and `UsageLimitReached`, which the loop already types, stop the table on a card that says what happened and what to do, and keep the run folder.

## 7. Failure

| What fails | What the player sees | What the system does |
|---|---|---|
| The page reloads or the socket drops | the same screen, a moment later | `resume` from the last `seq`; an open `ask` is sent again with its id |
| The host dies | a card: the table stopped, and what was kept | the shell restarts the host. With a saved party the loop saves after every night and on every exit (API-45), so the player loses at most the day; the lobby offers to go on |
| The window is closed | nothing | the page sends `quit` and the host saves the party before it stops |
| The engine dies | the same card | as today: a typed error |
| The model is slow | the waiting pill names who is thinking; the preview streams | `busy`, `preview` |
| Narration of engine lines fails | the lines as they are | `unnarrated` |
| The engine refuses a move | one line above the dock, never "you typed it wrong" | `refusal` |

The app always plays with a saved party, so a crash costs at most a day of the road. What it cannot do is continue inside a day or a fight: the loop has no such restart and this design adds none. Losing progress is on Vera's quit list, so the remaining gap is named, not hidden.

## 8. The package

One `Glass Table.app` in one DMG holds every part that is ours.

| Inside | Language | Size |
|---|---|---|
| Shell | Rust (Tauri) | about 10 MB, estimated |
| Table host | JS, one file from `bun build --compile` | 92 MB, measured 2026-11-20 |
| `nat20-api-server` and the audit binaries | Rust | about 16 MB for the server; bundled binaries exist since CON-19 (table #450) |
| Content | JSON and images | about 3 MB |

What changes for it: one read-only data root for content and one writable folder for rosters and runs, whose defaults sit under `REPO` today (`game/src/play/settings.ts`), and `REPO` in `game/src/paths.ts` comes from `import.meta.url`, which does not point into an app bundle; each nested binary signed under the hardened runtime and the app notarised; the DMG built from a tag. Signing runs in the release workflow on a hosted macOS runner (Stas, 2026-11-21, scope §9 question 2).

**Unverified, and checked first by a spike (scope §6):** Tauri starting the compiled loop and the server as bundled binaries; one live model call under Bun on a Mac under the hardened runtime, with the JIT entitlement if it needs one; how the compiled loop finds Claude Code when the app is launched from Finder, which gets no shell `PATH`.

## 9. Tests

| What | Layer |
|---|---|
| The wire carries only player-view and owner-view types; the hash matches; leak scan over `seat-wire.jsonl` | test, no model |
| The scripted scene shows the same lines at the Ink seat with structured events added | test, no model |
| The scripted scene over the socket equals the in-process run; resume at every `seq` gives the same final screen | test, no model |
| Reducer: every `HumanPrompt` kind puts up its dock form | test, no model |
| A scripted living-world fixture on a recorded saved party: a card with votes, a name token, a person's «Помнит» | test, no model |
| Parity: the page's drawn text at each `seq` contains each `seat.jsonl` line, and the language scan runs on the drawn text | test, no model |
| Replay of recorded fixtures at three widths, light, dark, reduced transparency; roll faces equal the engine log | Playwright on its WebKit project in CI, no model |
| A fight in the app; event to paint under 100 ms | a live run smaller than the exit run (`play:card`) |
| Install, sign-in state, first turn | a person |

The fixtures are recorded after `WebSeat` exists: the scripted scene, a scripted stretch of the living world (the scripted seat already plays cards), and one bench fight. The default scripted pack is *The Silent Mill*, which has no world, so it alone would let a build with dead name tokens pass. The runs of 2026-11-19 and 2026-11-20 that the prototype quotes have no `seat-wire.jsonl`. WebKit and not Chromium, because the app renders in WKWebView.

## 10. Trade-offs

The shell and the wire are decision 0090. Others made here:

| Choice | Taken | Rejected, and why |
|---|---|---|
| Where the loop runs | a Bun process beside the shell | inside the page: the loop spawns the engine and the model program |
| Page state | one pure reducer over recorded events | state spread across components: untestable without a browser |
| Framework | React 19, already in `game/` | Svelte, Solid: a new dependency line under Rule 9 for nothing we need |
| Terminal seat | stays | deleting it: CI, benches and unattended runs use it or its scripted sibling |
| Structured events | added beside the text | replacing the text: the terminal seat and the transcript read it |

**The standing cost:** two seats. Every later seat line is built twice until Stas names one seat the default.

**What I would revisit:** the shell after the first played run (if it still reads as an imitation, the native client is the answer and the page becomes its test harness); the wire when a second human or a remote client appears; a way to continue a stopped run when Friends and Family starts.

## 11. PRs

Order by dependency. Sizes and the calendar are Yan's (scope §7).

| # | PR | Gate |
|---|---|---|
| 1 | This design, decision 0090, the scope | Stas accepts |
| 2 | Rows | the scope and design are on main |
| 3 | Spike: Tauri, the compiled loop and the server, signed, notarised, one live call, launched from Finder. Merges no game code | a report, item by item, from Stas's Mac |
| 4 | Structured seat events beside the text | the scripted scene is identical at the Ink seat |
| 5 | Seat wire, `WebSeat`, `seat-wire.jsonl`, resume, leak scan; records the fixtures | the scripted scene over the socket equals the in-process run |
| 6 | Page 1: reducer, story, dock, turn, roll stage | WebKit replay of the scripted fixture |
| 7 | Page 2: lenses, inspectors, cards with votes, the other moments | replay of the bench fight; Vera on the changed lines |
| 8 | Lobby and Claude sign-in states (beside 6 and 7) | states drawn from a fake provider |
| 9 | Shell and package, on top of 7 and 8 | the DMG builds signed; Stas installs it and starts a scene |
| 10 | Exit run record | the pair on one DMG |

## 12. Sources

- Code at main c1746be: `game/src/table/types.ts` (`Seat`, `TableEvent`, `PlayerIntent`, `HumanPrompt`), `game/src/table/situation.ts`, `game/src/ui/ink-seat.ts`, `game/src/agents/sdk-session.ts` (`TurnSession`), `game/src/paths.ts`.
- Decisions 0016, 0029, 0043, 0054, 0067, 0080.
- Project files: the Bun check `demo/bun-check-2026-11-20.md`; Lev's gap list `demo/gui-glass-table-gaps-lev-2026-11-20.md`; Vera's reads `demo/gui-glass-table-vera2-2026-11-20.md`, `demo/gui-glass-table-vera3-2026-11-21.md`; Yan's plan `demo/glass-table-plan-yan-2026-11-21.md`.
- Apple: [Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass), [design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles), [components](https://developer.apple.com/design/human-interface-guidelines/components).
