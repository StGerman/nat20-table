# Hybrid shell spike

A SwiftUI shell around the page (`game/src/page`) in a web view, for the iPhone. A spike: draft PR table #480, never merged as it is. No Xcode project is committed; `xcodegen generate` writes it from `project.yml`.

## Simulator

```
npm ci && npm run page:build
brew install xcodegen
cd game/spike/hybrid-shell && xcodegen generate && open GlassTable.xcodeproj
```

Pick an iPhone simulator and press Run. The first screen offers two recorded runs that need no host.

## A live table

```
cargo build --release -p nat20-api-server
npm run play:demo -- --seat web --seat-lan
```

It prints two links. Paste the `ws://127.0.0.1…` one into the simulator, or the `ws://192.168…` one into the phone (Mac and phone on the same Wi-Fi). Anyone on that network who has the link can sit at the table.

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

## Pictures and the tour on CI

`.github/workflows/spike-hybrid-shell.yml` builds for the simulator on two Xcode images, takes the pictures (`ci/shots.sh`) and runs a finger's tour of a live table with a video (`ci/tour.sh`). It is not part of `ci-ok`.
