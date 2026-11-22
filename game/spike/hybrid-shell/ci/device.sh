#!/bin/bash
# Prints the simulator the spike uses: the newest iOS runtime's iPhone 17.
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
        if row["name"] == "iPhone 17":
            found.append(((int(m.group(1)), int(m.group(2))), row["udid"], runtime))
found.sort()
print(found[-1][1] if found else "")
')"
if [ -z "$DEVICE" ]; then
  xcrun simctl list devices available >&2
  echo "no iPhone 17 simulator" >&2
  exit 1
fi
echo "$DEVICE"
