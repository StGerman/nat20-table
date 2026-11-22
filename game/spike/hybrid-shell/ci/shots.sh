#!/bin/bash
# Installs the built app on a simulator, opens it on recorded runs and saves what the screen shows.
# usage: shots.sh <path to GlassTable.app> <out dir>
set -euo pipefail
APP="$1"
OUT="$2"
BUNDLE=dev.nat20.glasstable
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
  xcrun simctl launch "$DEVICE" "$BUNDLE" "$@"
  sleep "${WAIT:-14}"
  xcrun simctl io "$DEVICE" screenshot "$OUT/$name.png"
}

xcrun simctl ui "$DEVICE" appearance light
shot 01-yard-light -replay yard.seat-wire.jsonl
shot 02-yard-light-edge -replay yard.seat-wire.jsonl -edge 1
shot 03-road-light -replay the-way-back-ru.seat-wire.jsonl
xcrun simctl ui "$DEVICE" appearance dark
shot 04-yard-dark -replay yard.seat-wire.jsonl
shot 05-yard-dark-edge -replay yard.seat-wire.jsonl -edge 1

# What the app said about itself.
xcrun simctl spawn "$DEVICE" log show --last 5m --style compact --predicate 'eventMessage CONTAINS "nat20-"' > "$OUT/app.log" 2>&1 || true
tail -40 "$OUT/app.log" || true
