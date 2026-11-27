---
type: Task
id: MAP-38
title: "People records: one record per speaking person, with a portrait, and faces found by the person"
pri: P1
dest: Ours
size: M
state: todo
area: "7. Maps and scenario (E7)"
---

Design §4.1, PR 1. Everyone who speaks in the three packs has one record in `worlds/wend/npcs.json`, and the page draws a person's face from it.

Done means:
- Every person record gains `portrait`, a 512 px JPEG in `worlds/wend/portraits/`, cut from the final drawn set (`/mnt/project-files/assets/generations/portraits-drawn-v1/`, Stas 2026-11-28).
- Bertil, Snitt and Gritch join the people file with no `place`, with `names`, `look` and `look_ru` from Zoya.
- The Silent Mill's `adventure.json` `npcs[]` entries gain `person`; names, look and portrait come from the record, the pack keeps its DM prose and `creatures`.
- The page finds a face by the creature's `npc` (the person's id) first, by its handle only for kinds, so Gritch (`boss`, `npc: gritch`) has his. The build cuts the 128 px faces from the records; `game/src/page/portraits/` keeps the party and the kinds.
- A person with no portrait is drawn by their initial; the dashed ring and the corner list go behind the developer switch.

Check: the people file, the `person` links and every named portrait file: test, no model (`pack:check`). A face for each Mill person, Gritch included: test, no model (page e2e). Zoya's look lines and Vera on a person's card: a person.

Takes over CON-26's open items on faces (Gritch, Snitt).

## Status

todo. Written 2026-11-28 from `docs/design/registries-and-picture-book-design.md` §11, after Stas accepted its §9 recommendations (card in the thread, 2026-11-28).
