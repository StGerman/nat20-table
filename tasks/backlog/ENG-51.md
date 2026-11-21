---
type: Task
id: ENG-51
title: "The cleric pregen cannot level up to 4: core refuses the answer"
pri: P2
dest: Fork
size: S
state: todo
---

Found by AGT-146's walk of every level-up choice. After the cleric pregen's level 3 spell pick (any of the three), `level_up` toward level 4 at 2,700 XP answers `internal`, "Core refused an answer in maren's level-up." A saved Maren with that XP can never level again.

No shipped run reaches 2,700 XP yet: saved parties stand at level 3.

Check: the cleric pregen at 2,700 XP levels to 4 on the recommended picks: test, no model.

## Status

todo.
