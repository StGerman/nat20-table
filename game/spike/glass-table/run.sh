#!/usr/bin/env bash
# Glass Table spike (CON-20): builds the spike app on an Apple Silicon Mac, signs it under the
# hardened runtime, optionally notarises it, launches it the way Finder does, and prints the report.
#
#   game/spike/glass-table/run.sh                      # ad-hoc signature: no Apple account needed
#   game/spike/glass-table/run.sh --sign "Developer ID Application: NAME (TEAMID)" --notary-profile glass-table
#   game/spike/glass-table/run.sh --entitlements none  # the host signed with no entitlements: is JIT needed?
#
# Everything it prints also goes to spike-<time>.log under ~/Library/Application Support/glass-table-spike: paste that.
set -euo pipefail

IDENTITY="-"
NOTARY=""
ENTITLEMENTS="full"
while [ $# -gt 0 ]; do
  case "$1" in
    --sign) IDENTITY="$2"; shift 2 ;;
    --notary-profile) NOTARY="$2"; shift 2 ;;
    --entitlements) ENTITLEMENTS="$2"; shift 2 ;;
    *) echo "unknown flag $1"; exit 2 ;;
  esac
done

case "$ENTITLEMENTS" in full|none) ;; *) echo "--entitlements takes full or none, not $ENTITLEMENTS"; exit 2 ;; esac
REPORTS="$HOME/Library/Application Support/glass-table-spike"
mkdir -p "$REPORTS"
LOG="$REPORTS/spike-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee "$LOG") 2>&1

REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SPIKE="$REPO/game/spike/glass-table"
SHELL_DIR="$SPIKE/shell"
TRIPLE="aarch64-apple-darwin"
TAURI_CLI="@tauri-apps/cli@2.12.6"
APP="$SHELL_DIR/target/release/bundle/macos/Glass Table Spike.app"

step() { printf '\n== %s\n' "$*"; }

step "0 machine and tools"
[ "$(uname -sm)" = "Darwin arm64" ] || { echo "needs an Apple Silicon Mac, this is $(uname -sm)"; exit 1; }
sw_vers
echo "table commit $(git -C "$REPO" rev-parse --short HEAD) on $(git -C "$REPO" branch --show-current)"
command -v cargo >/dev/null || { echo "no cargo: install Rust (rustup.rs)"; exit 1; }
command -v bun >/dev/null || { echo "no bun: brew install oven-sh/bun/bun"; exit 1; }
command -v npx >/dev/null || { echo "no npm: install Node 22"; exit 1; }
xcode-select -p >/dev/null || { echo "no Xcode command line tools: xcode-select --install"; exit 1; }
cargo --version; echo "bun $(bun --version)"; echo "node $(node --version)"
echo "signing identity: $IDENTITY; notary profile: ${NOTARY:-none}; host entitlements: $ENTITLEMENTS"

step "1 dependencies and the engine"
cd "$REPO"
[ -d node_modules/@anthropic-ai/claude-agent-sdk ] || npm ci
cargo build --release --locked -p nat20-api-server

step "2 the compiled host"
mkdir -p "$SHELL_DIR/binaries"
bun build --compile --minify --target=bun-darwin-arm64 "$SPIKE/host.ts" --outfile "$SHELL_DIR/binaries/glass-table-host-$TRIPLE"
cp target/release/nat20-api-server "$SHELL_DIR/binaries/nat20-api-server-$TRIPLE"
ls -lh "$SHELL_DIR/binaries"

step "3 the Tauri shell"
cd "$SHELL_DIR"
# Tauri's own signing is off; step 4 signs every binary itself, so the report says what each needs.
env -u APPLE_SIGNING_IDENTITY -u APPLE_CERTIFICATE npx --yes "$TAURI_CLI" build --bundles app -- --locked
du -sh "$APP"

step "4 signing under the hardened runtime"
sign() {
  local args=(--force --options runtime --sign "$IDENTITY")
  [ "$IDENTITY" != "-" ] && args+=(--timestamp)
  codesign "${args[@]}" "$@"
}
if [ "$ENTITLEMENTS" = "full" ]; then
  sign --entitlements "$SHELL_DIR/entitlements.plist" "$APP/Contents/MacOS/glass-table-host"
else
  sign "$APP/Contents/MacOS/glass-table-host"
fi
sign "$APP/Contents/MacOS/nat20-api-server"
sign "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -d --entitlements - "$APP/Contents/MacOS/glass-table-host" 2>/dev/null || true

if [ -n "$NOTARY" ]; then
  step "5 notarisation"
  ZIP="$SHELL_DIR/target/glass-table-spike.zip"
  ditto -c -k --keepParent "$APP" "$ZIP"
  xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY" --wait
  xcrun stapler staple "$APP"
  spctl --assess --type execute -vv "$APP"
else
  step "5 notarisation: skipped (no --notary-profile)"
  spctl --assess --type execute -vv "$APP" || echo "(expected without a Developer ID and notarisation)"
fi

step "6 launched the way Finder launches it"
BEFORE="$(ls "$REPORTS"/report-*.json 2>/dev/null | wc -l)"
# `open` goes through Launch Services, as a double-click does: no shell PATH, no terminal environment.
if [ "${NAT20_SPIKE_NO_MODEL:-}" = "1" ]; then
  open -n --env NAT20_SPIKE_NO_MODEL=1 "$APP"
else
  open -n "$APP"
fi
for _ in $(seq 1 120); do
  [ "$(ls "$REPORTS"/report-*.json 2>/dev/null | wc -l)" -gt "$BEFORE" ] && break
  sleep 1
done
LATEST="$(ls -t "$REPORTS"/report-*.json 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ] || [ "$(ls "$REPORTS"/report-*.json 2>/dev/null | wc -l)" -le "$BEFORE" ]; then
  echo "no report in 120 s: the host did not finish. Its own log says how far it got:"
  cat "$(ls -t "$REPORTS"/host-*.log 2>/dev/null | head -1)" 2>/dev/null || echo "(no host log: the host never started)"
  exit 1
fi
cat "$LATEST"

step "done"
echo "Close the spike window. Then double-click $APP in Finder once and check the window lists the same items."
echo "Paste this log: $LOG"
