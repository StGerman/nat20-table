#!/bin/bash
# The shell's UI test (Tour/Tour.swift) at two live tables: the replay host behind the real seat wire,
# the screen recorded while the test presses, types and scrolls. Then what the second host heard is
# read against what the pages handed the shell (heard.ts). Leaves tour.mp4, the test's pictures, the
# logs and the accessibility audit's findings.
# usage: tour.sh <out dir>   (after shots.sh: the simulator is booted and the tour is built)
set -euo pipefail
OUT="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEVICE="$("$HERE/device.sh")"
mkdir -p "$OUT"
# Each stage is named as it starts: the test's own words go to a file, so a tour that stands still
# would otherwise leave the job's log empty.
stage() { echo "tour $(date -u +%H:%M:%S): $*"; }
stage "the simulator boots"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b > /dev/null
# A new simulator shows its keyboard's lesson on sliding over the letters in place of the keys, and
# the line being typed loses the keyboard when the lesson goes: it is marked as seen.
xcrun simctl spawn "$DEVICE" defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool true || true
xcrun simctl ui "$DEVICE" appearance light

LINKFILE="$(mktemp)"
rm -f "$LINKFILE"
node --experimental-strip-types --no-warnings "$HERE/replay-host.ts" "$HERE/../../game/test/fixtures/yard.seat-wire.jsonl" "$LINKFILE" ru "did=$OUT/tour-host.jsonl" > "$OUT/tour-host.log" 2>&1 &
HOST=$!
for _ in $(seq 1 30); do [ -s "$LINKFILE" ] && break; sleep 1; done
LINK="$(cat "$LINKFILE")"
rm -f "$LINKFILE"
# A second table on the wire that holds every kind of ask (game/test/page-wires.ts): the first two
# asks of each kind wait for the shell. When it is played out, the host's own second window takes
# the seat.
node --experimental-strip-types --no-warnings "$HERE/replay-host.ts" every-ask "$LINKFILE" ru "did=$OUT/tour-asks-host.jsonl" each=2 take-seat > "$OUT/tour-asks-host.log" 2>&1 &
HOST2=$!
for _ in $(seq 1 30); do [ -s "$LINKFILE" ] && break; sleep 1; done
ASKS_LINK="$(cat "$LINKFILE")"
rm -f "$LINKFILE"

xcrun simctl io "$DEVICE" recordVideo --codec h264 --force "$OUT/tour.mp4" > "$OUT/tour-video.log" 2>&1 &
VIDEO=$!
sleep 2
# What the keyboard's service and the system say against the app, taken as it is said: read back
# afterwards, the simulator's log has lost the words of its lines.
xcrun simctl spawn "$DEVICE" log stream --level info --style compact --predicate 'subsystem == "com.apple.KeyboardArbiter" OR (process == "GlassTable" AND (messageType == fault OR messageType == error))' > "$OUT/tour-system.log" 2>&1 &
SYSTEM=$!
STATUS=0
stage "the test runs"
# The two tests take about ten minutes. One that hangs is cut off at twenty-five, so the step fails
# with its logs and pictures kept, not at the job's limit with nothing.
TEST_RUNNER_TABLE_LINK="$LINK" TEST_RUNNER_ASKS_LINK="$ASKS_LINK" perl -e 'alarm 1500; exec @ARGV' xcodebuild test-without-building -project GlassTable.xcodeproj -scheme GlassTable \
  -destination "platform=iOS Simulator,id=$DEVICE" -derivedDataPath build-tour \
  -resultBundlePath "$OUT/tour.xcresult" > "$OUT/tour-test.log" 2>&1 || STATUS=$?
stage "the test ended with $STATUS; the recording is closed"
# The recorder writes the file when it is interrupted, not killed. One that does not end in a
# minute is killed, and the recording is lost.
kill -INT "$VIDEO" 2>/dev/null || true
for _ in $(seq 1 60); do kill -0 "$VIDEO" 2>/dev/null || break; sleep 1; done
kill -KILL "$VIDEO" 2>/dev/null || true
wait "$VIDEO" 2>/dev/null || true
kill "$HOST" "$HOST2" "$SYSTEM" 2>/dev/null || true
stage "the app's log is read"
tail -40 "$OUT/tour-test.log"
# A keyboard that did not come at the first touch of the dock's line: the tour touched the line
# again, and the job says how often, with what the keyboard's service said.
AGAIN="$(grep -c "nat20-tour the keyboard did not come" "$OUT/tour-test.log" || true)"
if [ "$AGAIN" != "0" ]; then
  echo "::warning::the simulator's keyboard did not come at $AGAIN touch(es) of the dock's line"
  grep -h "KeyboardArbiter" "$OUT/tour-system.log" | cut -c1-300 | tail -20 || true
fi
# What the app said about its socket and its pages while the test ran; cut off if the log is slow.
perl -e 'alarm 120; exec @ARGV' xcrun simctl spawn "$DEVICE" log show --last 15m --style compact --predicate 'eventMessage CONTAINS "nat20-"' > "$OUT/tour-app.log" 2>&1 || true
grep -h "nat20-wire\|nat20-diag .* again\|came back" "$OUT/tour-app.log" | grep -v "send failed\|log run" | tail -40 || true
# What the system said against the app while the test ran: its faults and errors, and a view that
# stopped following its state.
perl -e 'alarm 120; exec @ARGV' xcrun simctl spawn "$DEVICE" log show --last 15m --info --style compact --predicate 'process == "GlassTable" AND (messageType == fault OR messageType == error OR eventMessage CONTAINS[c] "cycle" OR eventMessage CONTAINS[c] "AttributeGraph" OR eventMessage CONTAINS "Modifying state" OR eventMessage CONTAINS "nat20-")' > "$OUT/tour-app-faults.log" 2>&1 || true
grep -ch "" "$OUT/tour-app-faults.log" || true
grep -hi "cycle\|AttributeGraph\|Modifying state" "$OUT/tour-app-faults.log" | cut -c1-300 | sort | uniq -c | sort -rn | head -20 || true
cat "$OUT/tour-host.log" "$OUT/tour-asks-host.log"
# What the accessibility audit found on the shell's screens: read by a person, it fails nothing.
grep -h "nat20-audit" "$OUT/tour-test.log" > "$OUT/accessibility.txt" || true
cat "$OUT/accessibility.txt"
# Leaving the table tells the host nothing: the first tour ends by leaving.
if grep -q quit "$OUT/tour-host.jsonl"; then
  echo "the shell sent a quit when the human left the table" >&2
  STATUS=1
fi
# The first tour presses a chip, then a row, then types a line, and the host heard each in that
# order: a press that lit its control and was not taken is named here, not by what stood in the
# way of the test two minutes later.
FIRST="$(grep '"answered"' "$OUT/tour-host.jsonl" | head -3 | sed 's/.*"kind":"\([a-z]*\)".*/\1/' | tr '\n' ' ' || true)"
if [ "$FIRST" != "option option text " ]; then
  echo "the first table heard '$FIRST' first, not a chip, a row and a typed line: a press was not taken" >&2
  STATUS=1
fi
# Only the pages' lines were sent, every kind of ask was answered, the lost press was asked again.
stage "what the host heard is read"
BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' build-tour/Build/Products/Debug-iphonesimulator/GlassTable.app/Info.plist)"
SENT="$(perl -e 'alarm 60; exec @ARGV' xcrun simctl get_app_container "$DEVICE" "$BUNDLE" data || true)/Documents/sent.jsonl"
cp "$SENT" "$OUT/tour-asks-sent.jsonl" || touch "$OUT/tour-asks-sent.jsonl"
# WebKit ends every page's process when its drawing process stops answering three times in half a
# minute (seen on the Xcode 27 image). The shell loads the pages again and asks from 0: the job
# says so, and the check of what the host heard is told, so it does not take those for dropped sockets.
ENDED="$(grep -c "terminateAllWebContentProcesses" "$OUT/tour-system.log" 2>/dev/null || true)"
ENDED="${ENDED:-0}"
[ "$ENDED" = "0" ] || echo "::warning::WebKit ended the pages' processes while the tour ran ($ENDED of its lines say so); the shell loaded the pages again"
node --experimental-strip-types --no-warnings "$HERE/heard.ts" "$OUT/tour-asks-host.jsonl" "$OUT/tour-asks-sent.jsonl" "ended=$ENDED" || STATUS=1
stage "the test's pictures are taken out"
perl -e 'alarm 300; exec @ARGV' xcrun xcresulttool export attachments --path "$OUT/tour.xcresult" --output-path "$OUT/tour" || true
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
