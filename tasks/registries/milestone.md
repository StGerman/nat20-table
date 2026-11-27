---
type: Milestone
title: "People, places and the picture book"
description: "Every person and every place the table shows has one committed record, read by the engine, the DM and the page alike, and the page reads like a picture book: a chapter opener for each new place, the map as a second page, the story set in Literata; no number until Stas gives one"
state: open
---

# Goal

One record per person and one per place, and the page that shows them as a book. Two halves that ship as one milestone because the second has nothing to draw without the first (Stas, 2026-11-24 «NPC вместе со сценами и новым UI»; merged into one milestone 2026-11-28).

**People.** `worlds/wend/npcs.json` is the one people file. Everyone who speaks in the three packs is in it with `names`, `look` and `look_ru` and a `portrait`. That brings in the Silent Mill's Bertil, Snitt and Gritch, and gives the Mill's Osric and Wenna the same record as Wend's. Their deaths are MAP-31. The inventory is `/mnt/project-files/assets/npc-registry.md` (2026-11-21).

**Places.** One file per place, `worlds/wend/places/<id>.json`: where it is on the Wend map, its names, a player-safe look by Zoya, its anchors and props (each with `solid`, `cover`, `height_ft`, and `leads_to` on a door), its pictures by time and state, and its drawn plans. A scene names its `place` and adds only its start `spots`. Today 14 scenes draw 8 places; the 8 stock places for the living world (ford, toll bridge, roadside camp, crossroads, farmyard, inn yard, forest clearing, roadside ruins) are not in this milestone: they come with the first card that sends the party there (Stas, 2026-11-28, design §9.8).

**The picture book.** The page from the prototype ([Picture Book Table](https://claude.ai/artifact/8mAsZEZfHCFXtt4eUQPebd), v6):
1. A new place, or a place whose picture the party's deeds changed, opens a chapter: its picture full width, the place name lettered on it with a shadow, a light parallax, and a drop cap on the first line told there. Going back to a place that looks the same opens no chapter. A person met inside a chapter sits in the line, on the phone and the Mac.
2. The Mac's wide window is an open book: the right page is the place's picture with its name in the system serif, and it turns with the reading.
3. «Где все» is the nearer layer: a second page that slides over the story, with dots and a one-time hint. Under the lens lies the place's painted plan («План землемера», day or night, light or dark) or its drawn layout.
4. Type and marks by decision 0098: Literata for everything the Narrator says, the system font for the table's controls, Lucide marks always beside a word, "Roll no. 11" on the page while `r11` stays in the log.
5. The SwiftUI shell takes the page's colours: the page's accent instead of the system blue, the page's HP colours, a flat story background, glass that reads on dark.

Design: `docs/design/registries-and-picture-book-design.md`. Inputs: the type page [Fine Print Type](https://claude.ai/artifact/8ES1MCH37c58PVsex4rLRj), the design system [Fine Print](https://claude.ai/artifact/4JAabAo9XsvNAPPzVgKMsB), the scene style `/mnt/project-files/assets/generations/scene-style-v1/STYLE.md`, the plate picks `/mnt/project-files/assets/generations/scenes-v1/picks/`, the scene-map page https://claude.ai/artifact/GhBDV6JZMuER1TcHsLUtgN, and the half-built opener `/mnt/project-files/engine/picture-book/chapter-opener-2026-11-27.patch`.

# Out

- Houses, fences and cover that work: «Walls and cover». Doors you go through: «Rooms you can enter». This milestone writes their fields and uses none of them.
- Pictures drawn while the game runs (Stas: maybe after Sign in with ChatGPT).
- The player fact "what we learned in this place": deferred again (design §9).
- Printer's signs other than the drop cap (§, †, three dots): still proposed by decision 0098.
- The 8 stock places for the living world (design §9.8).
- Any change to the engine wire or the contract crate.

# Exit criterion

Each row names its lowest layer (decision 0080).

1. Every scene of the three packs names a `place` and its `spots`; every anchor id a scene uses today survives, and every change of position is listed in its PR: test, no model.
2. `pack:check` holds every place: record, layout, look in both languages; every prop with `solid`, `cover`, `height_ft`; no start spot within 5 ft of a prop; no lettered spot: test, no model.
3. Everyone who speaks in the three packs has one people record with `names`, `look`, `look_ru` and a `portrait`; the page finds a face by the person's id, so Gritch has his: test, no model.
4. The table picks a place's picture by place, time, deeds and who stands there: the storeroom with Snitt only after `snitt_yielded`; no picture with a person who is dead or absent; the seat sends no picture before the scene's opening is told, a held campaign scene included; the Narrator's brief carries the picture's `shows` line: test, no model (seat-wire replay). Zoya reads each picture and plan against its scene: a person.
5. The page: a chapter opens on a new place or picture with picture, name and drop cap; no parallax under Reduce Motion; the map page opens by swipe and by its dots, and its hint shows once; the Mac's right page follows the reading; Literata loads with its licence beside it; the page names a roll "Roll no. 11" and the transcript still cites `r11`. Playwright WebKit replay and the shell's tours: test, no model.
6. The tour pictures, light and dark, next to the prototype's screens look like it: a person (Stas).
7. After each Mill person's death (the deeds are written today), Scene 6 has its line for the dead and Scene 5 writes no `wenna_saved` beside `killed_wenna_thorne` (MAP-31): test, no model. The Narrator tells it plainly: a live run smaller than an exit run.
8. Vera (fallback) reads the new lines: the title page of an unpainted place, the map hint, "roll no. 11", a person's card: a person.
9. Scene-size live runs on one build, judge on: Scene 3 into 4 on both yard endings, a death into Scene 6; then Stas plays *The Silent Mill* Scene 1 to 6 on his iPhone on the same build: live runs smaller than an exit run, then a person. In place of 0043's all-AI full run, which sees no page and may roll neither a surrender nor a death (decision 0101).

# Tasks

Written 2026-11-28 after Stas accepted the design's §9 (card, "Да, все"), in the design's §11 order:

1. MAP-38 people records and faces (PR 1)
2. MAP-39 place records; scenes name place and spots (PR 2), on MAP-38
3. AGT-159 the picture pick, `SeatPlace`, `shows` in the brief (PR 3), on MAP-39
4. CON-28 Literata, marks, "Roll no. 11" (PR 4), on AGT-159
5. CON-29 the chapter opener and meetings in the line (PR 5), on CON-28
6. CON-30 «Где все» as the second page (PR 6), on AGT-159
7. CON-31 the shell's colours and the Mac's right page (PR 7), on CON-29
8. MAP-31 the deaths, reading side (PR 8), beside them, after Zoya's board
9. AGT-160 the exit runs, last

CON-26 and CON-27 (moved in from Glass Table by decision 0099) close when MAP-38, MAP-39, AGT-159 and CON-29 take their open items.

# Answered before the design (Stas, 2026-11-23)

1. Houses: wanted, but only with pathfinding and a way in, so they come with «Walls and cover» and «Rooms you can enter».
2. Mill-yard cover: real geometry, in «Walls and cover».
3. N = 8 prepared places, as proposed.
4. The player fact for "what we learned in this place" waits for this milestone's design (it stays out: design §9).

Earlier, 2026-11-21: the scene's text always wins over its anchors; the map and its cache are by place; layouts are drawn by hand and committed. 2026-11-24: the chapter opener, the story filling the screen, the map as the nearer layer, one tab with two pages and dots, «Лист» and «Люди» as tabs, a cross-fade under Reduce Motion. 2026-11-27: meetings in the line on the Mac too; parallax, a shadow and the drop cap belong here, not in Glass Table. 2026-11-28: type and marks (decision 0098), the scene style «E amber + Герман», the Snitt storeroom only after a surrender.

# Art references

The portrait and scene look starts from a private moodboard (2026-11-23, 2026-11-28: Aleksandra Zheleznova, Disco Elysium concept art, Aleksei German's «Трудно быть богом»). It lives in the project files only, `/mnt/project-files/assets/moodboard/`, is never fed to a model by name and never enters a repo or the product (Rule 7). The scene style rule is `scene-style-v1/STYLE.md`; the portraits are final in their own style, pencil under thin oil on a sky-stroke field (Stas, 2026-11-28; `/mnt/project-files/assets/generations/portraits-drawn-v1/`, 23 faces).

# Status

open, no number. Opened 2026-11-21 («Давай объединим NPC registry and Places registry в один milestone»); the picture book merged in and its UI put in scope 2026-11-28 («People and places registries merge with Picture-book milestone и внеси UI в scope этого milestone сразу»). Order (Stas, 2026-11-23 and 2026-11-24): Glass Table → Sign in with ChatGPT → this milestone → «Камень A». The folder keeps its name, `tasks/registries/`.
