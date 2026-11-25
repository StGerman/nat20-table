---
type: Task
id: MAP-36
title: "Wend people's looks match their portraits: one anachronism each, Col's knitted hat"
pri: P2
dest: Ours
size: S
state: done
area: "7. Maps and scenario (E7)"
---

The NPC portraits (2026-11-24, Stas approved the set on 2026-11-25) gave each of the 15 Wend people one cheap, worn 1970s to 90s piece of clothing or accessory, picked by Zoya (bible World 6: one detail you remember per person). The people file still described them without it, Osric in the patched coat Stas replaced with the good brown coat, Fenn with the clipboard and Rufus with the calling cards that the art dropped (2026-11-21), and Col in the borrowed helmet that his portrait swapped for a striped knitted hat (Stas, 2026-11-24).

Done means:
- `worlds/wend/npcs.json`: every person's `look` and `look_ru` names their one item, as in the portrait.
- Col wears the striped knitted hat in every line a player reads: `millbeck_bridge`, `toll_man_stocks` and `what_agna_drew`, in both languages; Dunn's mittens are the same yarn.
- The bible's examples (`.claude/skills/zoya/references/examples.md`) say the hat, not the helmet.

Not here, on purpose:
- The Silent Mill's NPCs (Bertil, Snitt, Gritch, and the Mill's own Osric and Wenna) have no `look` field yet; their records come with this milestone's people rows.
- Fenn's clipboard stays a prop in his story (`heard`, the Highsteads choices, the Fenn deck); only the look drops it. Rufus may still hand out a card in a DM note.
- A `portrait` field and wiring the images into the page.
- Zoya's proposed bible amendment that writes the anachronism rule into World 6.

Lowest layer (decision 0080): a person. The lines are content; Zoya's board check and the Vera read are on the PR.

Portraits and prompts: `/mnt/project-files/assets/generations/npc-v1/`; the items and their Russian names: `zoya-anachronisms.md` there.

## Status

done. Stas asked on 2026-11-24 («после апрува портретов добавим в описание контентным PR») and approved the portraits on 2026-11-25.
