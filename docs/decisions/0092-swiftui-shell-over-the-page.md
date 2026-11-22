# 0092. The client's shell is SwiftUI over the same page, on the iPhone and the Mac

- **Status:** Proposed
- **Date:** 2026-11-22
- **Decided by:** Stas, project chat: 2026-11-22 21:16Z («let's use SwiftUI for iOS»), and 23:12Z («spike прошел успешно и мы готовы к билду на SwiftUI») after running the spike on his Mac. The hybrid shape and the Mac half are Claude's proposal in `docs/design/swiftui-shell-design.md`; accepted on merge

## Context

Decision 0090 put the first client in a Tauri shell on the Mac and rejected a native SwiftUI client (its option C) on three facts: a cloud thread cannot build, run or look at a SwiftUI app; every change would wait on Stas's Mac; and the whole client would be written a second time in a second language. On 2026-11-22 Stas asked for an iPhone client in SwiftUI, with *The Silent Mill* running in it by the weekend. Tauri has no path to a phone that we have tried, and its own spike (CON-20) is still waiting on an evening at Stas's Mac.

Facts checked by the spike on draft PR table #480 (never merged; its branch is the evidence):

- A hosted macOS runner builds a Swift app for the simulator, and a cloud thread reads what it drew: screenshots, and a video of a UI test pressing through a live table. The first of 0090's three facts no longer holds. A round takes about 20 minutes, most of it the simulator's first boot.
- A SwiftUI shell can draw every control (tab bar, dock, move chips, sheets) in the system's own material while the page stays the only game logic: the page's reducer says what the controls show, the shell draws that and reports a press, and the page builds the intent. Swift holds no game rule and builds no message.
- The shell's own WebSocket plays a table over the seat wire of 0090 unchanged, with resume by `seq` after a drop. A seat opened to the home network takes a phone by a pasted link.
- It builds on Xcode 26.6 and on Xcode 27.1 in CI, and Stas ran it in the simulator on Xcode 27.2.

Not checked: a build on a real phone, the socket over Wi-Fi, the same shell built for macOS, and a Mac app that starts the game loop and the engine (the question CON-20 asked of Tauri).

## Options

### A. Stay on 0090: Tauri on the Mac, no phone
- Pro: nothing new to build or learn.
- Con: no iPhone client, which Stas asked for; the glass stays a CSS imitation.

### B. A SwiftUI shell over the page, on the iPhone and the Mac
- Pro: one shell for both, in the system's material; the page, its reducer and its tests are kept whole.
- Pro: the page still opens in a plain browser against a recorded run, so most work is still tested on Linux with no Mac and no model.
- Con: a second language, for the shell only, and a macOS CI job that takes about 20 minutes a round.
- Con: the story is still a web view. Text selection, scrolling and type follow WebKit, not SwiftUI.
- Con: the macOS half is unbuilt; it inherits CON-20's open question about starting the compiled loop from a signed app.

### C. A fully native SwiftUI client (0090's option C)
- Pro: every pixel is the system's; no web view.
- Con: the reducer, the story, the lenses and the sheet are written again in Swift, with generated wire types and a second set of tests that run only on a Mac. The page already drawn becomes a test harness and nothing more.

### D. SwiftUI on the iPhone, Tauri on the Mac
- Pro: 0090 stands for the Mac as written.
- Con: two shells in two languages around one page, and Tauri's spike still has to be run.

### E. A cross-platform toolkit (React Native, Flutter, Capacitor)
- Pro: Android or Windows later from one codebase.
- Con: no Android or Windows client is planned; none of them gives the system's glass; React Native and Flutter would also rewrite the page.

## Decision

B. The spike removed the reason 0090 gave against Swift, and a shell over the page costs one small Swift program where C costs the client twice. One shell for both devices beats D on upkeep. 0090's wire, `WebSeat`, the page and its tests all stand; this record replaces only its choice of shell. The Mac half of B is Claude's recommendation and is the one open choice (design, Decisions for Stas, 1): if the shell does not hold on macOS, the Mac falls back to D.

## Consequences

- The Tauri shell is not built. CON-20 closes as `wont-do` and CON-21 is rewritten for a Swift Mac app; what CON-20 was to check (the compiled loop and the engine started from a signed app launched from Finder) is checked on that app instead. The rows change only after this record is accepted.
- The page gains a native mode: it draws content only and tells the shell what its controls show. That state is plain data, tested with no browser and no Mac.
- The shell is a new top-level part of this repo with its own CI job on a hosted macOS runner, off the `ci-ok` gate until it has been stable for a milestone. No Xcode project is committed; it is generated.
- The shell must stay free of game logic: no rule, no intent built in Swift, no text of its own that the seat already words. A line the shell does word itself (no connection, the connect screen) is player-facing and goes to Vera.
- A seat can listen beyond the loopback address. There the link's token is the only guard and crosses the network unencrypted, so that mode lets in no browser origin. It is fit for Stas's home network. A pairing step and TLS come before anyone outside the project plays on a phone.
- The phone is a window, not the game: the loop, the engine and the models still run on a Mac. A phone with no Mac is a different product and is not planned here.
- The floor is iOS 26 and macOS 26, where SwiftUI's own web view and the glass material exist.
- Stas's phone takes a build signed with a free Apple ID for 7 days at a time. Anyone else needs TestFlight, and with it the paid Apple Developer account CON-20 already waited on.
- Rule 3 is untouched: the shell receives what the page received, which is the human's own view.
- The player is never told the material is Liquid Glass (kept from 0090).

## Revisit when

- The phone build or the socket over Wi-Fi fails on Stas's iPhone in a way the shell cannot fix: then the phone waits and the Mac goes back to 0090.
- Stas plays a session and the story reads as a web page inside an app: then C for that one view, with the page kept as its test harness.
- The shell does not hold on macOS, or cannot start the loop from a signed app: then D.
- A second human, a seat outside the home network, or an Android or Windows client is planned: then the wire of 0016 and 0090 is reopened (0090's option E), and E here.

## Sources

- `docs/design/swiftui-shell-design.md`; `docs/design/glass-table-system-design.md` §3, §8, §10.
- Decisions 0016, 0090.
- Draft PR table #480 (branch `table/glass-table-hybrid-shell-spike`) and its `spike-hybrid-shell` workflow runs of 2026-11-22; pictures in project files, `demo/hybrid-shell-2026-11-22/`.
- Thread "Build the iPhone app in SwiftUI", 2026-11-22: the options page and the spike design.
