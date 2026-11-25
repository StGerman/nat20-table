# Keeps a UI test's own pictures under their own names, out of a result bundle's exported
# attachments; Xcode's own recording and snapshots go.
# usage: pictures.py <dir that `xcresulttool export attachments` wrote>
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
