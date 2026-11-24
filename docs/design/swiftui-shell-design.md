# The SwiftUI shell: design of the build

- **Status:** Proposed; accepted on merge
- **Date:** 2026-11-22, main 958f389
- **Decision:** `docs/decisions/0093-swiftui-shell-over-the-page.md` (Proposed)
- **Amends:** `docs/design/glass-table-system-design.md` §3 (the shell), §8 (the package), §11 (PRs 3 and 9). Everything else there stands: the seat wire, `WebSeat`, the page, the lobby, the tests.
- **Asked by:** Stas, 2026-11-22 21:16Z («let's use SwiftUI for iOS. The goal is to run "Silentl Mill" on an emulator or my iPhone next weekend») and 23:12Z («spike прошел успешно и мы готовы к билду на SwiftUI»)
- **Evidence:** the spike on draft PR table #480, which is not merged. This design says what of it moves to main, in which PRs, and what checks each.
- **Read by:** Lev (the fallback), 2026-11-23; his findings are applied here and listed in §5. Vera (the fallback), 2026-11-22, on the shell's own lines (§5). No pack, scene or card changes, so there is no board for Zoya to check.

## 1. Summary

The window around the page becomes a small SwiftUI program, the same one on the iPhone and the Mac. The page stays the content and the only game logic. The seat wire's messages do not change: the ping and the notice to a replaced window are the WebSocket's own frames. Nothing here touches the engine, the contract crate, the loop or the Rule 3 projection.

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
| Every kind of ask can be answered | each `HumanPrompt` kind puts up a control, and what the page posts for a press is an intent the wire schema takes | test, no model: the page in native mode on Playwright's WebKit in the `page` job, driven through the shell's own entry points over a wire that holds every kind; then the same on a simulator |
| Swift holds no game logic | the shell sends only what the page posted, its own `resume` and a ping; it words nothing the seat already words; its own lines follow the table's language | test, no model: a check over what the shell sent in the simulator test |
| A press is not lost | the shell pings; a socket found dead comes back and the open ask is offered again; a press that never reached the host is not shown as answered | test, no model: the simulator test drops the socket between a press and its send |
| The story survives a drop | resume asks from the page's own `seq`; a page that was reloaded is fed the run from 0 | test, no model: the simulator test drops the socket and reloads a page |
| One seat, one window | the seat closes the window it replaces with a WebSocket close code that says so, and that window stops asking for the seat; no wire message is added | test, no model (`game/test/seat-wire.test.ts`) |
| A seat on the home network takes no browser | no origin is let in off the loopback address | test, no model (`game/test/seat-wire.test.ts`) |
| Rule 3 | the shell receives only what the page received | nothing new to test: the leak scan over `seat-wire.jsonl` covers every line sent |
| Rule 4 | the die shows only the engine's number: the roll stage stays in the page | existing replay tests |
| The table waits for a phone that sleeps | an ask never times out; the phone keeps its screen on at a table; the host keeps the Mac awake while a seat is on the network | a person: a lock and unlock in the middle of a fight |
| It runs on Stas's iPhone at a real table | *The Silent Mill*, Scene 1 to 6, over Wi-Fi | a person |

What a phone costs the player, said plainly: the other players keep taking their turns while the phone is locked, and nothing calls the human back when the table waits on them; if the Mac sleeps, the table stops and the phone can only say «Нет связи со столом». Notifications are out (§6).

**Leaving.** «Встать из-за стола» on the phone takes the phone away and leaves the table running: the ask waits, and the same link sits down again. It sends no `quit`, so it does not end the run; the host saves the party by its own rules (after every night and on exit, Glass Table design §7), and the run is ended on the Mac. This differs from the Mac window, whose closing sends `quit` (§7 there). The line needs words that say the table goes on (§5).

## 4. PRs

Order by dependency. Rows and sizes are Yan's, written only after this is accepted.

| # | PR | Gate |
|---|---|---|
| 1 | This design and decision 0093 | Stas accepts |
| 2 | Rows: CON-20 re-pointed from Tauri to the Swift Mac app (its question stays open until PR 7's report), CON-21 rewritten, the rows below; the Glass Table scope amended (Decisions for Stas, 1) | 1 is on main |
| 3 | The page's native mode and the chrome state; a wire that holds every kind of ask; a reaction that offers more than one answer shows each | every kind of ask is answered through the shell's entry points on WebKit, and the posted intent passes the wire schema; the page in a browser is unchanged |
| 4 | The seat's listen address and `--seat-lan`; a replaced window is closed with its own code; the host keeps the Mac awake | the seat-wire tests pass |
| 5 | The shell for the iPhone, its CI job on a hosted macOS runner, and the UI test: every kind of ask, a dropped socket, a reloaded page, only the page's lines sent | the job is green on the simulator; Vera on the shell's own lines |
| 6 | The same shell for the Mac: a window, a menu bar command and key for every dock action | a UI test on the runner answers an ask by each menu command and its key |
| 7 | The Mac app starts the table: the compiled loop and the engine as bundled binaries, signed (what CON-20 asked of Tauri, and CON-21's package) | a report from Stas's Mac, then the DMG of the Glass Table exit row 6 |
| 8 | Stas's iPhone: first ten minutes at a recorded table over Wi-Fi with a lock and unlock, then *The Silent Mill* | a person; recorded in the task |

PRs 3 to 5 are the spike's code, reviewed and with what the spike skipped (§5). The ten-minute half of PR 8 can happen on the spike branch before 3 to 5 land: it needs nothing from main, it fails sooner than a two-hour session would, and its result decides whether they land at all.

## 5. What the spike skipped

Found by Lev's read of the spike's code, by Vera, and by the spike's own pictures. Each is owned by a PR in §4.

- **A press can vanish (PR 5).** The page marks an ask answered when it hands the message to the shell, and the shell only logs a send that failed. There is no ping, so a socket that Wi-Fi left half open shows the table as thinking.
- **The story can vanish (PR 5).** The shell keeps the `seq` and the pages keep the story. If the system ends a web view's process, the page comes back empty and resume asks only for what the shell had not seen.
- **Two windows fight for the seat (PR 4).** The seat takes the newest window and drops the one before; both sides ask again after a second. A Mac window and a phone on one seat would trade it forever.
- **«Лист» asks the seat for a fresh sheet on every touch of its tab (PR 5).** The host then asks again under a new id, and an ask that is its own sheet opens over the tab.
- **The shell words things in Russian whatever the table's language is (PR 5).**
- **The shell writes one message itself, `resume` (kept).** It is the only one; the rule in §3 names it.
- **Recorded wires hold four kinds of ask (PR 3).** A reaction, the Narrator's question and the pause were pressed on a hand-made wire; a surrender, a level-up and a road step have none. The recorded table checks no answer, so "a valid intent" is untested.
- **A reaction's "yes" takes the first answer (PR 3).** Its sheet says who may be answered but not with what, and a second answer has no control. The page has the same gap.
- **Typing in the dock was blind.** The keyboard covered the line. Fixed on the spike branch: the line opens over the keyboard.
- **Vera has not passed the shell's own lines (PR 5).** Her read of 2026-11-22 (the fallback; in full in this design's PR) stops on the first screen, at the link field: «Ссылки у меня нет, и откуда она берётся, я не знаю». She read the wrong-link line twice and took it as being told she pasted it wrong, heard «стол» too often, and asked of «Встать из-за стола» and «Нет связи со столом» the same thing: is what I played kept? PR 5 rewords the lines and she reads them again. The link field itself goes only when the phone finds the table without one (§6).
- **Nothing has run on a real phone or over Wi-Fi (PR 8).**
- **Accessibility (VoiceOver, larger type) is unchecked in the shell (PR 5 for the phone, PR 6 for the Mac).**

## 6. Out

- A phone with no Mac. The loop, the engine and the models stay on a Mac.
- Finding the table without a pasted link, pairing and TLS. They come before anyone outside the project plays on a phone, and get rows only when Stas asks for that.
- Calling the human back to a locked phone (notifications).
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

Decided: the Mac takes the same SwiftUI shell and Tauri is dropped (Stas, card in the thread, 2026-11-22 23:35Z).

1. **Where the work sits.** Recommended: inside the Glass Table milestone, with its scope amended: the iPhone window comes in, "a native SwiftUI client" leaves its Out list, and one exit row is added (Stas plays *The Silent Mill* on his iPhone: a person). Otherwise a milestone of its own after Glass Table.
2. **«Встать из-за стола» on the phone.** Recommended: as §3 says, the phone leaves and the table waits. Otherwise it ends the run for everyone, as closing the Mac window does.
3. **The paid Apple Developer account.** Not needed for Stas's own phone. Needed for the signed Mac app (as before) and for anyone else's phone. No row until Stas says who else plays.

## 9. Sources

- Decision 0093; decision 0090; `docs/design/glass-table-system-design.md`; `docs/scope/glass-table-scope.md`.
- Draft PR table #480 and its `spike-hybrid-shell` runs of 2026-11-22.
