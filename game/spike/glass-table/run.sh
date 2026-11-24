#!/usr/bin/env bash
# Glass Table spike (CON-20): builds the spike's Swift Mac app on an Apple Silicon Mac, puts the
# compiled host and the engine inside it, signs all three under the hardened runtime, optionally
# notarises the app, launches it the way Finder does, and prints the report. It launches the app
# twice: with the host signed with the entitlements Bun's docs give (round A), then with none
# (round B), so one run says whether they are needed. Then it asks for one double-click in Finder
# (round C), the launch the question is about.
#
#   game/spike/glass-table/run.sh                      # ad-hoc signature: no Apple account needed
#   game/spike/glass-table/run.sh --entitlements full  # round A only (none: round B only)
#   game/spike/glass-table/run.sh --sign "Developer ID Application: NAME (TEAMID)" --notary-profile glass-table
#
# Everything it prints also goes to spike-<time>.log under ~/Library/Application Support/glass-table-spike: paste that.
set -euo pipefail

IDENTITY="-"
NOTARY=""
ENTITLEMENTS="both"
while [ $# -gt 0 ]; do
  case "$1" in
    --sign) IDENTITY="$2"; shift 2 ;;
    --notary-profile) NOTARY="$2"; shift 2 ;;
    --entitlements) ENTITLEMENTS="$2"; shift 2 ;;
    *) echo "unknown flag $1"; exit 2 ;;
  esac
done

case "$ENTITLEMENTS" in both|full|none) ;; *) echo "--entitlements takes both, full or none, not $ENTITLEMENTS"; exit 2 ;; esac
REPORTS="$HOME/Library/Application Support/glass-table-spike"
mkdir -p "$REPORTS"
LOG="$REPORTS/spike-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee "$LOG") 2>&1

REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SPIKE="$REPO/game/spike/glass-table"
BUILD="$SPIKE/build"
BUN="$REPO/node_modules/.bin/bun"
NAME="Glass Table Spike"
APP="$BUILD/$NAME.app"
INSIDE="$APP/Contents/MacOS"

step() { printf '\n== %s\n' "$*"; }

step "0 machine and tools"
[ "$(uname -sm)" = "Darwin arm64" ] || { echo "needs an Apple Silicon Mac, this is $(uname -sm)"; exit 1; }
sw_vers
echo "table commit $(git -C "$REPO" rev-parse --short HEAD) on $(git -C "$REPO" branch --show-current)"
command -v cargo >/dev/null || { echo "no cargo: install Rust (rustup.rs)"; exit 1; }
command -v npm >/dev/null || { echo "no npm: install Node 22"; exit 1; }
command -v xcodegen >/dev/null || { echo "no xcodegen: brew install xcodegen"; exit 1; }
xcodebuild -version || { echo "no Xcode: the app is built with xcodebuild, the command line tools alone are not enough"; exit 1; }
cargo --version; echo "node $(node --version)"
echo "signing identity: $IDENTITY; notary profile: ${NOTARY:-none}; host entitlements: $ENTITLEMENTS"

step "1 dependencies and the engine"
cd "$REPO"
[ -d node_modules/@anthropic-ai/claude-agent-sdk ] || npm ci
# Bun comes with the repo's packages; a blocked install script leaves it without its program.
"$BUN" --version >/dev/null 2>&1 || (cd node_modules/bun && node install.js)
echo "bun $("$BUN" --version)"
cargo build --release --locked -p nat20-api-server

step "2 the compiled host"
rm -rf "$BUILD"
mkdir -p "$BUILD"
"$BUN" build --compile --minify --target=bun-darwin-arm64 "$SPIKE/host.ts" --outfile "$BUILD/glass-table-host"

step "3 the Swift app, with the host and the engine inside it"
cd "$SPIKE/app"
xcodegen generate
# Not signed here: step 4 signs every program itself, so the log says what each was signed with.
xcodebuild -project GlassTableSpike.xcodeproj -scheme GlassTableSpike -configuration Release \
  -destination 'platform=macOS,arch=arm64' -derivedDataPath "$BUILD/xcode" -quiet build
ditto "$BUILD/xcode/Build/Products/Release/$NAME.app" "$APP"
cp "$BUILD/glass-table-host" "$REPO/target/release/nat20-api-server" "$INSIDE/"
ls -lh "$INSIDE"
du -sh "$APP"

sign() {
  local args=(--force --options runtime --sign "$IDENTITY")
  [ "$IDENTITY" != "-" ] && args+=(--timestamp)
  codesign "${args[@]}" "$@"
}
# Signs the two programs inside, then the app around them. $1: full or none, the host's entitlements.
sign_all() {
  if [ "$1" = "full" ]; then
    sign --entitlements "$SPIKE/entitlements.plist" "$INSIDE/glass-table-host"
  else
    sign "$INSIDE/glass-table-host"
  fi
  sign "$INSIDE/nat20-api-server"
  sign "$APP"
  codesign --verify --deep --strict --verbose=2 "$APP"
  # `flags=…(runtime)` on each line is the hardened runtime.
  for file in "$APP" "$INSIDE/glass-table-host" "$INSIDE/nat20-api-server"; do
    codesign -dv --verbose=2 "$file" 2>&1 | grep -E '^(Identifier|CodeDirectory|TeamIdentifier)' | tr '\n' ' '
    echo
  done
  codesign -d --entitlements - "$INSIDE/glass-table-host" 2>/dev/null || true
}

# The newest file of this name written since the app was last launched, if there is one.
fresh() { find "$REPORTS" -maxdepth 1 -name "$1" -newer "$BUILD/launched" | sort | tail -1; }
# The process $1 and everything under it, one id a line.
tree() {
  local child
  echo "$1"
  for child in $(pgrep -P "$1"); do tree "$child"; done
}
# Which of the processes $@ are still there.
alive() {
  local pid
  for pid in "$@"; do
    if kill -0 "$pid" 2>/dev/null; then ps -o pid=,comm= -p "$pid"; fi
  done
  return 0
}

# Launches the app ($1: open, by this script, or finder, by a double-click), waits for the host's
# report and prints it, then kills the app and looks for anything it started that outlived it. Fails
# when no report came.
launch() {
  local came=0 wait=120 hostlog app before name
  local -a pids
  touch "$BUILD/launched"
  if [ "$1" = "finder" ]; then
    wait=300
    open -R "$APP"
    echo "Double-click «$NAME» in the Finder window that has just opened. Waiting up to 5 minutes."
  elif [ "${NAT20_SPIKE_NO_MODEL:-}" = "1" ]; then
    env -i /usr/bin/open -n --env NAT20_SPIKE_NO_MODEL=1 "$APP"
  else
    # `open` goes through Launch Services, as a double-click does, but hands the app the environment
    # it was called with: it is called with none, so the app gets no shell PATH.
    env -i /usr/bin/open -n "$APP"
  fi
  for _ in $(seq 1 "$wait"); do
    [ -n "$(fresh 'report-*.json')" ] && { came=1; break; }
    sleep 1
  done
  if [ "$came" = 1 ]; then
    cat "$(fresh 'report-*.json')"
  else
    echo "no report in $wait s: the host did not finish. Its own log says how far it got:"
    hostlog="$(fresh 'host-*.log')"
    if [ -n "$hostlog" ]; then cat "$hostlog"; else echo "(no host log: the host never started)"; fi
  fi
  # The hard way out: the app is killed with a signal it cannot answer, so nothing in it cleans up.
  # The host, the engine it keeps running and anything else under the app have to end by themselves.
  app="$(pgrep -f "$INSIDE/$NAME" | head -1)"
  if [ -z "$app" ]; then
    echo "(the app was not running any more)"
    [ "$came" = 1 ]
    return
  fi
  while read -r pid; do pids+=("$pid"); done < <(tree "$app")
  before="$(alive "${pids[@]}")"
  echo "running before the app is killed:"
  echo "$before"
  if [ "$came" = 1 ]; then
    for name in glass-table-host nat20-api-server; do
      echo "$before" | grep -q "$name" || echo "MISSING before the kill: $name"
    done
  fi
  kill -KILL "$app"
  for _ in $(seq 1 10); do
    [ -z "$(alive "${pids[@]}")" ] && break
    sleep 1
  done
  if [ -n "$(alive "${pids[@]}")" ]; then
    echo "LEFT BEHIND 10 s after the app was killed:"
    alive "${pids[@]}"
    kill -KILL "${pids[@]}" 2>/dev/null || true
  else
    echo "all ${#pids[@]} ended with the app"
  fi
  [ "$came" = 1 ]
}

FIRST="$ENTITLEMENTS"
[ "$ENTITLEMENTS" = "both" ] && FIRST="full"

step "4 signing under the hardened runtime (host entitlements: $FIRST)"
sign_all "$FIRST"

if [ -n "$NOTARY" ]; then
  step "5 notarisation"
  ZIP="$BUILD/glass-table-spike.zip"
  ditto -c -k --keepParent "$APP" "$ZIP"
  xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY" --wait
  xcrun stapler staple "$APP"
  spctl --assess --type execute -vv "$APP"
else
  step "5 notarisation: skipped (no --notary-profile)"
  spctl --assess --type execute -vv "$APP" || echo "(expected without a Developer ID and notarisation)"
fi

step "6 round A: launched the way Finder launches it (host entitlements: $FIRST)"
launch open || { echo "round A gave no report"; exit 1; }

if [ "$ENTITLEMENTS" = "both" ]; then
  step "7 round B: the same app, the host signed with no entitlements"
  if [ -n "$NOTARY" ]; then
    echo "skipped: signing again would undo the notarisation"
  else
    sign_all none
    launch open || echo "round B gave no report: the compiled host does not run under the hardened runtime without its entitlements"
    echo
    echo "signed again as in round A, for the round below"
    sign_all full >/dev/null 2>&1
  fi
fi

step "8 round C: launched by Finder itself"
if [ -t 0 ]; then
  launch finder || echo "round C gave no report"
else
  echo "skipped: nobody is at this machine to double-click"
fi

step "done"
echo "Paste this log: $LOG"
