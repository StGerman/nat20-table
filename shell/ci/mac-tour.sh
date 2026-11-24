#!/bin/bash
# The Mac shell's UI test (MacTour/MacTour.swift): the replay host behind the real seat wire, on
# the wire that holds every kind of ask, answered from the menu bar. Then what the host heard is
# read against what the pages handed the shell (heard.ts), and that closing the window told the
# host `quit`. Leaves the test's pictures and the logs.
# usage: mac-tour.sh <out dir>   (after `xcodebuild build-for-testing -scheme GlassTableMac -derivedDataPath build-mac`)
set -euo pipefail
OUT="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
# Where the shell keeps what its pages handed over (`-keepSent`, Shared/Shell.swift).
SENT="$(getconf DARWIN_USER_TEMP_DIR)nat20-sent.jsonl"
rm -f "$SENT"

LINKFILE="$(mktemp)"
rm -f "$LINKFILE"
# The first two asks of each kind wait for the shell. When the recording is played out, the host's
# own second window takes the seat.
node --experimental-strip-types --no-warnings "$HERE/replay-host.ts" every-ask "$LINKFILE" ru "did=$OUT/mac-asks-host.jsonl" each=2 take-seat > "$OUT/mac-asks-host.log" 2>&1 &
HOST=$!
for _ in $(seq 1 30); do [ -s "$LINKFILE" ] && break; sleep 1; done
ASKS_LINK="$(cat "$LINKFILE")"
rm -f "$LINKFILE"

STATUS=0
# Cut off at twenty minutes, so a test that hangs leaves its logs.
TEST_RUNNER_ASKS_LINK="$ASKS_LINK" perl -e 'alarm 1200; exec @ARGV' xcodebuild test-without-building -project GlassTable.xcodeproj -scheme GlassTableMac \
  -destination 'platform=macOS,arch=arm64' -derivedDataPath build-mac \
  -resultBundlePath "$OUT/mac-tour.xcresult" > "$OUT/mac-tour-test.log" 2>&1 || STATUS=$?
# The host is given a moment to write down the last line it heard.
sleep 2
kill "$HOST" 2>/dev/null || true
tail -60 "$OUT/mac-tour-test.log"
cat "$OUT/mac-asks-host.log"
cp "$SENT" "$OUT/mac-asks-sent.jsonl" || touch "$OUT/mac-asks-sent.jsonl"
# Only the pages' lines were sent, every kind of ask was answered, the lost press was asked again.
node --experimental-strip-types --no-warnings "$HERE/heard.ts" "$OUT/mac-asks-host.jsonl" "$OUT/mac-asks-sent.jsonl" || STATUS=1
# Closing the Mac's window ends the run: the host heard `quit` (Glass Table design §7).
if ! grep -q '\\"name\\":\\"quit\\"' "$OUT/mac-asks-host.jsonl"; then
  echo "the host heard no quit when the window was closed" >&2
  STATUS=1
fi
xcrun xcresulttool export attachments --path "$OUT/mac-tour.xcresult" --output-path "$OUT/tour" || true
python3 "$HERE/pictures.py" "$OUT/tour" || true
rm -rf "$OUT/mac-tour.xcresult"
exit "$STATUS"
