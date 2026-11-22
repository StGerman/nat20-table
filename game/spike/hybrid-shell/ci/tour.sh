#!/bin/bash
# The tour (Tour/Tour.swift) at a live table: the replay host behind the real seat wire, the screen
# recorded while a UI test presses, types and scrolls. Leaves tour.mp4, the test's pictures and both logs.
# usage: tour.sh <out dir>   (after shots.sh: the simulator is booted and the tour is built)
set -euo pipefail
OUT="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEVICE="$("$HERE/device.sh")"
mkdir -p "$OUT"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b > /dev/null
xcrun simctl ui "$DEVICE" appearance light

LINKFILE="$(mktemp)"
rm -f "$LINKFILE"
node --experimental-strip-types --no-warnings "$HERE/replay-host.ts" "$HERE/../../../test/fixtures/yard.seat-wire.jsonl" "$LINKFILE" ru > "$OUT/tour-host.log" 2>&1 &
HOST=$!
for _ in $(seq 1 30); do [ -s "$LINKFILE" ] && break; sleep 1; done
LINK="$(cat "$LINKFILE")"
rm -f "$LINKFILE"
# A second table for the asks the recordings never reach (asks-wire.mjs).
ASKS="$(mktemp)"
node "$HERE/asks-wire.mjs" "$HERE/../../../test/fixtures/yard.seat-wire.jsonl" "$ASKS"
node --experimental-strip-types --no-warnings "$HERE/replay-host.ts" "$ASKS" "$LINKFILE" ru > "$OUT/tour-asks-host.log" 2>&1 &
HOST2=$!
for _ in $(seq 1 30); do [ -s "$LINKFILE" ] && break; sleep 1; done
ASKS_LINK="$(cat "$LINKFILE")"
rm -f "$LINKFILE"

xcrun simctl io "$DEVICE" recordVideo --codec h264 --force "$OUT/tour.mp4" > "$OUT/tour-video.log" 2>&1 &
VIDEO=$!
sleep 2
STATUS=0
TEST_RUNNER_TABLE_LINK="$LINK" TEST_RUNNER_ASKS_LINK="$ASKS_LINK" xcodebuild test-without-building -project GlassTable.xcodeproj -scheme GlassTable \
  -destination "platform=iOS Simulator,id=$DEVICE" -derivedDataPath build-tour \
  -resultBundlePath "$OUT/tour.xcresult" > "$OUT/tour-test.log" 2>&1 || STATUS=$?
# The recorder writes the file when it is interrupted, not killed.
kill -INT "$VIDEO" 2>/dev/null || true
wait "$VIDEO" 2>/dev/null || true
kill "$HOST" "$HOST2" 2>/dev/null || true
tail -40 "$OUT/tour-test.log"
cat "$OUT/tour-host.log" "$OUT/tour-asks-host.log"
xcrun xcresulttool export attachments --path "$OUT/tour.xcresult" --output-path "$OUT/tour" || true
# The test's pictures under their own names; Xcode's own recording and snapshots repeat tour.mp4.
python3 - "$OUT/tour" <<'PY' || true
import json, os, sys
root = sys.argv[1]
keep = set()
for test in json.load(open(os.path.join(root, "manifest.json"))):
    for a in test.get("attachments", []):
        name, file = a.get("suggestedHumanReadableName", ""), a.get("exportedFileName", "")
        if file.endswith(".png") and name[:2].isdigit():
            target = name.split("_0_")[0] + ".png"
            os.replace(os.path.join(root, file), os.path.join(root, target))
            keep.add(target)
for file in os.listdir(root):
    if file not in keep and not file.endswith(".txt"):
        os.remove(os.path.join(root, file))
PY
# The result bundle is large and its pictures are out: only they are kept.
rm -rf "$OUT/tour.xcresult"
exit "$STATUS"
