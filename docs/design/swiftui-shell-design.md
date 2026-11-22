# The SwiftUI shell: design of the build

- **Status:** Proposed; accepted on merge
- **Date:** 2026-11-22, main 958f389
- **Decision:** `docs/decisions/0092-swiftui-shell-over-the-page.md` (Proposed)
- **Amends:** `docs/design/glass-table-system-design.md` §3 (the shell), §8 (the package), §11 (PRs 3 and 9). Everything else there stands: the seat wire, `WebSeat`, the page, the lobby, the tests.
- **Asked by:** Stas, 2026-11-22 21:16Z («let's use SwiftUI for iOS. The goal is to run "Silentl Mill" on an emulator or my iPhone next weekend») and 23:12Z («spike прошел успешно и мы готовы к билду на SwiftUI»)
- **Evidence:** the spike on draft PR table #480, which is not merged. This design says what of it moves to main, in which PRs, and what checks each.

## 1. Summary

The window around the page becomes a small SwiftUI program, the same one on the iPhone and the Mac. The page stays the content and the only game logic. The seat wire does not change. Nothing here touches the engine, the contract crate, the loop or the Rule 3 projection.

Would Vera get through this alone? Not yet, and this design does not claim it: the phone needs a table running on a Mac and a link pasted from it, and the phone build is installed from Xcode. It serves Stas until the Mac app starts the table itself and the phone finds it without a link (§6).

## 2. The parts

```
 iPhone or Mac                                   the Mac that hosts the table
┌────────────────────────────────────────┐      ┌──────────────────────────────┐
│ Shell (SwiftUI)                        │      │ Table host (game loop)       │
│  tab bar, dock, chips, sheets, menu    │      │  agents ◄─► loop ◄─► WebSeat │
│  owns the socket ──────────────────────┼─────►│   seat wire: JSON over       │
│        │ host lines        ▲ chrome    │      │   WebSocket, token in link   │
│        ▼                   │ state     │      │        │ stdio               │
│ Page in web views (native mode)        │      │        ▼                     │
│  reducer; story, «Где все», «Лист»     │      │  nat20-api-server            │
└────────────────────────────────────────┘      └──────────────────────────────┘
```

- **Page, native mode.** Opened with `?shell=native`, the page opens no socket and draws no bar of its own. It takes host lines from the shell, runs the same reducer, and after each one posts the chrome state: what the dock, the chips and the sheets show now, as plain data from `chromeOf(view)`.
- **Shell.** Draws the controls from the chrome state in the system's material and holds the WebSocket. A press goes to the page as "option n", "typed text", "reaction yes or no" or a command; the page builds the intent and hands the message back for the socket. The shell never builds an intent and holds no rule.
- **Seat.** `WebSeat` gains one option, the address it listens on. On the loopback address nothing changes. On the home network it lets in no browser origin, only a client that holds the token.

## 3. What it must hold

| Requirement | Target | Lowest layer that tests it (0080) |
|---|---|---|
| Swift holds no game logic | every intent on the wire is built by the page; the chrome state names only moves the open list holds | test, no model: the chrome tests over the recorded wires |
| Every kind of ask can be answered on the phone | each `HumanPrompt` kind puts up a control that sends a valid intent | test, no model: a UI test on a simulator against a recorded wire served by the real `WebSeat` |
| Nothing lost on a dropped socket | the shell resumes by `seq`, as the page does | test, no model: the same UI test with the host stopped and started |
| A seat on the home network takes no browser | no origin is let in off the loopback address | test, no model (`game/test/seat-wire.test.ts`) |
| Rule 3 | the shell receives only what the page received | nothing new to test: the leak scan over `seat-wire.jsonl` already covers every line sent |
| Rule 4 | the die shows only the engine's number: the roll stage stays in the page | existing replay tests |
| It runs on Stas's iPhone at a real table | *The Silent Mill*, Scene 1 to 6, over Wi-Fi | a person |

## 4. PRs

Order by dependency. Rows and sizes are Yan's, written only after this is accepted.

| # | PR | Gate |
|---|---|---|
| 1 | This design and decision 0092 | Stas accepts |
| 2 | Rows: CON-20 closed, CON-21 rewritten, the rows below; the Glass Table scope amended (Decisions for Stas, 2) | 1 is on main |
| 3 | The page's native mode and the chrome state, with its tests | chrome tests and the WebKit replay pass; the page in a browser is unchanged |
| 4 | The seat's listen address and `--seat-lan`, with its test | the seat-wire tests pass |
| 5 | The shell for the iPhone, its CI job on a hosted macOS runner, and the UI test that presses through every kind of ask | the job is green on the simulator; Vera on the shell's own lines |
| 6 | The same shell for the Mac: a window, a menu bar command and key for every dock action | the job builds and runs it on the runner |
| 7 | The Mac app starts the table: the compiled loop and the engine as bundled binaries, signed (what CON-20 asked of Tauri, and CON-21's package) | a report from Stas's Mac, then the DMG of exit row 6 |
| 8 | Stas plays *The Silent Mill* on his iPhone | a person; recorded in the task |

PRs 3 to 5 are the spike's code, reviewed and with what the spike skipped (§5). PR 8 can happen on the spike branch before 3 to 5 land: it needs nothing from main, and its result decides whether they land at all.

## 5. What the spike skipped

- The shell's own Russian lines were written without Vera. Her read of 2026-11-22 (the fallback; in full in this design's PR) stops on the first screen, at the link field: «Ссылки у меня нет, и откуда она берётся, я не знаю». She read the wrong-link line twice and took it as being told she pasted it wrong, heard «стол» too often, and asked of «Встать из-за стола» and «Нет связи со столом» the same thing: is what I played kept? PR 5 rewords the lines and she reads them again. The link field itself goes only when the phone finds the table without one (§6).
- A reaction's sheet says who may be answered but not with what. The page has the same gap; it is the page's to fix.
- A surrender, a level-up and a road step have no recorded wire behind them on the phone.
- The roll stage on the phone has only its first pictures.
- Nothing has run on a real phone or over Wi-Fi.
- Accessibility (VoiceOver, larger type) is unchecked in the shell.

## 6. Out

- A phone with no Mac. The loop, the engine and the models stay on a Mac.
- Finding the table without a pasted link, pairing and TLS. They come before anyone outside the project plays on a phone, and get rows only when Stas asks for that.
- TestFlight and the App Store.
- An iPad layout, Android, Windows.
- A lobby in the shell. The page's lobby (AGT-144) is drawn by the page here too.

## 7. Trade-offs

| Choice | Taken | Rejected, and why |
|---|---|---|
| Who builds the intent | the page | Swift: two places that know what a move is, and wire types generated for Swift |
| Who holds the socket | the shell | the page: a web view that is off screen is throttled, and a native socket survives a tab switch |
| How many web views | one per tab, each fed every host line | one view moved between tabs: the story would lose its place |
| The Xcode project | generated from a small file | committed: unreadable in review, conflicts on every change |
| The shell's CI | its own job, off `ci-ok` at first | on the gate from day one: 20 minutes on every PR for a part most PRs do not touch |

**The standing cost:** a control exists twice, once in the page for a browser and once in the shell. The chrome state keeps them saying the same thing, but a new dock form is still drawn twice.

## 8. Decisions for Stas

1. **The Mac.** Recommended: the same SwiftUI shell, and Tauri is dropped (decision 0092, option B). Otherwise the Mac stays on Tauri (option D) or waits. Asked on a card in the thread, 2026-11-22.
2. **Where the work sits.** Recommended: inside the Glass Table milestone, with its scope amended: the iPhone window comes in, "a native SwiftUI client" leaves its Out list, and one exit row is added (Stas plays *The Silent Mill* on his iPhone: a person). Otherwise a milestone of its own after Glass Table.
3. **The paid Apple Developer account.** Not needed for Stas's own phone. Needed for the signed Mac app (as before) and for anyone else's phone. No row until Stas says who else plays.

## 9. Sources

- Decision 0092; decision 0090; `docs/design/glass-table-system-design.md`; `docs/scope/glass-table-scope.md`.
- Draft PR table #480 and its `spike-hybrid-shell` runs of 2026-11-22.
