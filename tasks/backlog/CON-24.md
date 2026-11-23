---
type: Task
id: CON-24
title: "The shell at the largest type sizes and by ear"
pri: P2
dest: Ours
size: S
state: todo
---

Left open by CON-22 (table #490). The system's accessibility audit runs in the `shell` job on the turn's screen and lists its findings in the job's `accessibility.txt`; it fails nothing. CON-22 fixed two of them (the list button's hit area, the grey second line of a chip). Still listed on 2026-11-23:

- **Larger type.** "Dynamic Type font sizes are partially unsupported" on the title, the turn line under it, a chip's second line and the health figure; "Text clipped" on the health figure and on the dock's line. The dock sits in the tab bar's accessory, which has one fixed height: at the largest sizes its line is cut, not wrapped.
- **Contrast.** "Nearly passed" on the dock's placeholder and on the turn line under the title.
- **By ear.** Nobody has listened to the shell with VoiceOver on a phone: the audit checks that a control has a description, not that a turn can be played by ear. The story inside the web view is the page's own.

Check: the audit's list is empty for the shell's own controls, or each line left is answered here; a person plays one fight turn with VoiceOver on a phone and one at the largest type size.

## Status

todo. Written 2026-11-23 with table #490.
