---
type: Task
id: ENG-50
title: "Level 4: the recommended Ability Score Improvement ends the level-up, and every class is offered Protector"
pri: P2
dest: Fork
size: S
state: todo
---

Found by AGT-146's walk of every level-up choice (`game/test/level-up-lines.test.ts`). At 2,700 XP the fighter, barbarian and wizard pregens get a `Feat` choice of `ability_score_improvement`, `protector` and `skilled`. The recommended pick, which Enter takes, is `ability_score_improvement`. After it, `level_up` answers "<handle>'s level-up cannot go on: it asks for ability scores or a spell swap, which level_up cannot ask yet." So a human who presses Enter, or an AI player left to the recommended pick, stalls at level 4. `protector` seems to be the Cleric's Divine Order feat (Martial weapons, Heavy armor), offered to every class at level 4, and a fighter already has both.

No shipped run reaches 2,700 XP yet: saved parties stand at level 3.

Check: a pregen at 2,700 XP levels to 4 taking the recommended pick at every choice; the `Feat` choice lists only feats its class may take: test, no model.

## Status

todo.
