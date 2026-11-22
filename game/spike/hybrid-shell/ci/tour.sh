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

xcrun simctl io "$DEVICE" recordVideo --codec h264 --force "$OUT/tour.mp4" > "$OUT/tour-video.log" 2>&1 &
VIDEO=$!
sleep 2
STATUS=0
TEST_RUNNER_TABLE_LINK="$LINK" xcodebuild test-without-building -project GlassTable.xcodeproj -scheme GlassTable \
  -destination "platform=iOS Simulator,id=$DEVICE" -derivedDataPath build-tour \
  -resultBundlePath "$OUT/tour.xcresult" > "$OUT/tour-test.log" 2>&1 || STATUS=$?
# The recorder writes the file when it is interrupted, not killed.
kill -INT "$VIDEO" 2>/dev/null || true
wait "$VIDEO" 2>/dev/null || true
kill "$HOST" 2>/dev/null || true
tail -40 "$OUT/tour-test.log"
cat "$OUT/tour-host.log"
xcrun xcresulttool export attachments --path "$OUT/tour.xcresult" --output-path "$OUT/tour" || true
# The result bundle is large and its pictures are out: only they are kept.
rm -rf "$OUT/tour.xcresult"
exit "$STATUS"
