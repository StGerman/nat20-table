---
type: Task
id: MAP-39
title: "Place records: one file per place, scenes name their place and spots, the pack's plates list goes"
pri: P1
dest: Ours
size: L
state: todo
area: "7. Maps and scenario (E7)"
---

Design §4.2 and §4.3, PR 2. The 8 places that the 14 scenes draw get one record each in `worlds/wend/places/<id>.json`; the 8 stock places are not in this row (design §9.8, Stas 2026-11-28).

Done means:
- Each record: `id`, `in`, names, `ground`, `look` and `look_ru` by Zoya, `anchors[]` with `kind` and, on props, `footprint_ft`, `solid`, `cover`, `height_ft`, and `leads_to` on a door (Stas 2026-11-23: from the first commit); `pictures[]` with `time`, `when`, `people`, `shows`, `shows_ru`, `focus`; `plans[]` by time and theme.
- Every scene of the three packs drops its `anchors` and names `place`, `spots` and `anchors_used` (filter and rename, never move). The party's starts become `spots`.
- One Wendford green: the Mill's and the wagon packs' wells become one position; every change of position is listed in the PR.
- `scenarios/the_silent_mill/plates/index.json` goes; its pictures move beside the place records; `game/src/pack/places.ts` reads `worlds/<world>/places/`.
- Pictures in the pack: all seven Mill pictures in the new scene style, Stas's picks of 2026-11-28 («новый стиль для всех сцен»; `/mnt/project-files/assets/generations/scenes-v1/picks/`), replacing the four older ones in the pack; the Snitt storeroom with `when: snitt_yielded`. Highsteads, Wendmouth and the road on title pages (the two Wend pictures there, the Millbeck bridge and the roadfolk fire, belong to cards, not places). Painted plans only for the green and the yard.

Check: every anchor id a scene uses survives, every move listed: test, no model (exit row 1). The place rules: record, layout, looks in both languages, every prop's geometry fields, no start spot within 5 ft of a prop, no lettered spot, every named file present: test, no model (`pack:check`, exit row 2). Zoya reads each look, picture and plan against its scene: a person.

Takes over CON-26's open items on the road and yard pictures.

## Status

todo. Written 2026-11-28 from `docs/design/registries-and-picture-book-design.md` §11, after Stas accepted its §9 recommendations (card in the thread, 2026-11-28).
