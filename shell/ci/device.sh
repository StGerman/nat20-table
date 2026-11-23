#!/bin/bash
# Prints the simulator the shell's job uses: an iPhone 17 on the newest iOS runtime that has one, or
# failing that the newest runtime's first iPhone.
set -euo pipefail
DEVICE="$(xcrun simctl list devices available -j | python3 -c '
import json, sys, re
devices = json.load(sys.stdin)["devices"]
found = []
for runtime, rows in devices.items():
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    if not m:
        continue
    for row in rows:
        if row["name"].startswith("iPhone"):
            found.append((row["name"] == "iPhone 17", (int(m.group(1)), int(m.group(2))), row["udid"], row["name"]))
found.sort()
if found:
    print(found[-1][3], found[-1][1], file=sys.stderr)
print(found[-1][2] if found else "")
')"
if [ -z "$DEVICE" ]; then
  xcrun simctl list devices available >&2
  echo "no iPhone simulator" >&2
  exit 1
fi
echo "$DEVICE"
