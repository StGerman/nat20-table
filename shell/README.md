# The SwiftUI shell

A SwiftUI program around the page (`game/src/page`) in a web view, for the iPhone (CON-22) and the Mac (CON-23; decision 0093, `docs/design/swiftui-shell-design.md`). It draws the tab bar, the dock, the chips, the sheets and the menu from what the page says its controls show, and holds the socket to the table. It holds no game logic: the page builds every message for the host, and the only one the shell writes itself is `resume`. No Xcode project is committed; `xcodegen generate` writes it from `project.yml`.

## Simulator

```
npm ci && npm run page:build
brew install xcodegen
cd shell && xcodegen generate && open GlassTable.xcodeproj
```

Pick an iPhone simulator and press Run. The first screen offers two recorded runs that need no host.

## A live table

```
cargo build --release -p nat20-api-server
npm run play:demo -- --seat web --seat-lan
```

It prints two links. Paste the `ws://127.0.0.1…` one into the simulator, or the `ws://192.168…` one into the phone (Mac and phone on the same Wi-Fi). Anyone on that network who has the link can sit at the table.

«Встать из-за стола» takes the phone away and tells the table nothing: the run goes on, the open ask waits, and the link stays in the field to sit down again. The run is ended on the Mac. One seat holds one window: a second one with the same link takes the seat, and the first says so and offers «Играть здесь».

## The Mac

The same project has a second scheme, `GlassTableMac` (`Mac/`): pick it and My Mac, and press Run. The window holds the three pages as tabs and the dock under them; an ask that is its own list (a card, a reaction, a pick) stands under the story, and a turn's list of moves opens as a popover over the dock. Paste the `ws://127.0.0.1…` link of a table started on the same Mac (`npm run play:demo -- --seat web`).

The menu bar's game menu («Игра») holds every action of the dock, each with a key: the answers the open ask takes by number (⌘1 to ⌘9, by their place in the menu), yes and no to a reaction (⌘Y, ⌘N), the whole list (⌘L), the human's own words (⌘K) and the pause (⌘P).

Closing the window ends the run: the page sends `quit` and the host saves the party before it stops (Glass Table design §7). That differs from the phone, which only leaves. The app is signed to run on the Mac that built it; starting the table from inside the app and a signed package are CON-20 and CON-21.

## Your iPhone

A free Apple ID is enough. Xcode signs the app for 7 days; after that, press Run again.

1. Xcode, Settings, Accounts: add your Apple ID.
2. On the phone: Settings, Privacy & Security, Developer Mode, on. The switch appears after the phone has been plugged into the Mac with Xcode open. The phone restarts.
3. In the project: target GlassTable, Signing & Capabilities, Team: pick your personal team. Pick the phone at the top and press Run.
4. The first launch is refused until you trust yourself on the phone: Settings, General, VPN & Device Management.
5. The app asks for the local network the first time it connects. Allow it.

`xcodegen generate` forgets the team from step 3. To keep it, run this once after step 3, before the next generate:

```
grep -m1 -o 'DEVELOPMENT_TEAM = [A-Z0-9]*' GlassTable.xcodeproj/project.pbxproj > Local.xcconfig
cat Local.xcconfig
```

It should print one line, `DEVELOPMENT_TEAM = ` and ten characters. If Xcode says the bundle identifier is taken, change `APP_BUNDLE_ID` in `project.yml`.

The app is named Fine Print, «Мелкий шрифт» on a phone set to Russian (`APP_NAME` in `project.yml`, `Shared/Names`). The project, target and scheme keep the working name `GlassTable`.

## Pictures and the UI test on CI

`.github/workflows/shell.yml` builds for the simulator on two Xcode images, takes the pictures (`ci/shots.sh`) and runs the UI test with a video (`ci/tour.sh`, `Tour/Tour.swift`). The test sits at a table with no engine and no model: `ci/replay-host.ts` plays a recorded run behind the real seat wire. It answers every kind of ask, loses the socket between a press and its send, has a page loaded again, and is replaced by a second window; `ci/heard.ts` then fails the job if the host heard anything the page did not hand over, `resume` apart. The job is not part of `ci-ok` (decision 0093).

The `mac` job of the same workflow builds the Mac shell and runs `MacTour/MacTour.swift` (`ci/mac-tour.sh`) at the same kind of table: it answers every kind of ask from the menu bar, by a command and by its key turn about, with the same lost socket, reloaded page and replaced window, then closes the window, and the job fails unless the host heard `quit`. It keeps pictures of the window, light and dark; on the Mac the shell keeps what its pages handed over in the user's temporary folder (`nat20-sent.jsonl`).

The test's hooks are launch arguments, off without them: `-tour 1` draws a line of state the test reads, `-keepSent 1` keeps what the pages handed over in `Documents/sent.jsonl`, `-dropBeforeSend <n>` loses the socket and the nth message with it, `-reloadAfter <n>` loads the story's page again after the nth. On the Mac, `-dark 1` draws the window dark for the pictures.
