---
type: Task
id: MAP-31
title: "The reeve, the miller and Wenna can die"
pri: P2
dest: Ours
size: M
state: todo
area: "7. Maps and scenario (E7)"
---

Osric Hale, Bertil Pell and Wenna Thorne speak in every *Silent Mill* run, but there they live in prose only. They are in the Mill's `adventure.json` `npcs[]` with no stat block and no creature, and Wenna's prose says outright that nothing can hurt her. So none of them can die: a stray Fire Bolt, a goblin's blade or a Blade's own temper passes through them. In Wend, Osric and Wenna are Commoners in `worlds/wend/npcs.json` and can die like anyone there. Their cards leave the pile when they die (rule A8), but no card or line yet says what Wendford becomes without its reeve. Bertil is not in the Wend people file at all.

Done means:
- In the Mill, each of the three is a creature in the scenes they stand in (Osric and Bertil in s1 and s6, Wenna in s5 and s6). The DM narrates a death from the engine's state.
- Each death is the engine's `killed_<id>` deed, the one every named NPC's death writes (`killed_col`), with `by` naming the last blow; `<id>_dead` stays the owner and company form. The scenes that need the dead person still run: s6 has someone to pay or blame, and s5 can end with Wenna dead.
- Wend reads the deed. Bertil joins `worlds/wend/npcs.json`. Wendford's cards and its people say who holds the common chest, the mill and Wenna's place once someone is dead.

This needs a short design (who replaces whom, what the village remembers) and Zoya's board check before it gets rows. Lowest layer (decision 0080): the deed and the scene state are a test with no model; whether the DM tells the death plainly needs a live run smaller than an exit run.

## Status

todo. Filed 2026-11-21 at Stas's ask («смерть старосты, мельника или Венны - добавь в TODO»), from the NPC art registry (`/mnt/project-files/assets/npc-registry.md`, §7). Not yet prioritised.
