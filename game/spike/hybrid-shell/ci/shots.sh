#!/bin/bash
# Installs the built app on a simulator, opens it on recorded runs and saves what the screen shows.
# usage: shots.sh <path to GlassTable.app> <out dir>
set -euo pipefail
APP="$1"
OUT="$2"
# The bundle id is the built app's own: project.yml is the one place it is written.
BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
mkdir -p "$OUT"

# The newest iOS runtime's iPhone 17.
DEVICE="$(xcrun simctl list devices available -j | python3 -c '
import json, sys, re
devices = json.load(sys.stdin)["devices"]
found = []
for runtime, rows in devices.items():
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    if not m:
        continue
    for row in rows:
        if row["name"] == "iPhone 17":
            found.append(((int(m.group(1)), int(m.group(2))), row["udid"], runtime))
found.sort()
print(found[-1][1] if found else "")
')"
if [ -z "$DEVICE" ]; then
  xcrun simctl list devices available
  echo "no iPhone 17 simulator" >&2
  exit 1
fi
echo "simulator $DEVICE"
xcrun simctl boot "$DEVICE" || true
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" "$APP"

shot() {
  local name="$1"
  shift
  xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
  # The app's own log lines (NSLog) land in the .err file.
  xcrun simctl launch --stdout="$PWD/$OUT/$name.out" --stderr="$PWD/$OUT/$name.err" "$DEVICE" "$BUNDLE" "$@"
  sleep "${WAIT:-14}"
  xcrun simctl io "$DEVICE" screenshot "$OUT/$name.png"
}

xcrun simctl ui "$DEVICE" appearance light
# The yard: a fight turn with chips, then its whole sheet, then a pick that is its own sheet.
shot 01-yard-turn-light -replay yard.seat-wire.jsonl -to 74
shot 02-yard-turn-edge-light -replay yard.seat-wire.jsonl -to 74 -edge 1
shot 03-yard-sheet-light -replay yard.seat-wire.jsonl -to 74 -open moves
shot 04-yard-pick-light -replay yard.seat-wire.jsonl -to 80
shot 05-yard-press-light -replay yard.seat-wire.jsonl -to 74 -press 9
# The road: words out of a fight, then a road card with the table's votes.
shot 06-road-input-light -replay the-way-back-ru.seat-wire.jsonl -to 12
shot 07-road-card-light -replay the-way-back-ru.seat-wire.jsonl -to 17
shot 08-road-end-light -replay the-way-back-ru.seat-wire.jsonl
# The other two tabs.
shot 12-yard-where-light -replay yard.seat-wire.jsonl -to 74 -screen where
shot 13-yard-sheet-tab-light -replay yard.seat-wire.jsonl -to 74 -screen sheet
xcrun simctl ui "$DEVICE" appearance dark
shot 09-yard-turn-dark -replay yard.seat-wire.jsonl -to 74
shot 10-yard-sheet-dark -replay yard.seat-wire.jsonl -to 74 -open moves
shot 11-road-card-dark -replay the-way-back-ru.seat-wire.jsonl -to 17

# What the app said about itself, from the system log as well; cut off if the log is slow to answer.
perl -e 'alarm 90; exec @ARGV' xcrun simctl spawn "$DEVICE" log show --last 10m --style compact --predicate 'eventMessage CONTAINS "nat20-"' > "$OUT/app.log" 2>&1 || true
grep -h "nat20-" "$OUT"/*.err 2>/dev/null | tail -60 || true
