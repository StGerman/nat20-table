---
type: Milestone
title: "People and places registries"
description: "Every person and every place the table shows has one committed record: names in both languages, a look, a portrait or a hand-drawn layout, and whether the engine stands it in the scene; no number until Stas gives one"
state: open
---

# Goal

One record per person and one per place, read by the engine, the DM and the page alike, so that «Люди», «Где все», the portrait rail and the art pipeline all show the same cast and the same ground.

**People.** `worlds/wend/npcs.json` is already the Wend registry. This milestone brings in everyone who is still missing from it:
- The Silent Mill's speaking NPCs (Osric, Bertil, Wenna, Snitt, Gritch) get `names`, `look` and `look_ru`, and stand in the scene as creatures. Today they live in prose only, so «Люди» and «Где все» miss them.
- Bertil joins the Wend people file.
- A `portrait` field (an asset id) for the party and for every NPC.
- Their deaths (MAP-31).

The inventory is `/mnt/project-files/assets/npc-registry.md` (2026-11-21): 22 faces, 18 without art. Looks settled by Stas on 2026-11-21: Osric wears the good brown coat; Fenn's clipboard and Rufus's calling cards are dropped.

**Places.** One file per place, `worlds/wend/places/<id>.json`, next to `npcs.json`. It holds `in` (the place on the Wend `map.json`), `name` and `name_ru`, the ground, a player-safe `look` written by Zoya, the anchors with their `kind`, and a layout file drawn once by hand and committed. A scene names its `place` and adds only its `spots`, the start points, which are never lettered. The table resolves these into anchors, so the contract does not change. Today 14 scenes draw 8 places, and Wendford's well is drawn twice (`green_well` in the Mill, `the_well` in Fair in Wend and The Way Back). Drawing the map on the page comes after Sign in with ChatGPT. The cache is keyed by place, not by scene. N generic places are prepared and committed for the living world; 8 are proposed (ford, toll bridge, roadside camp, crossroads, farmyard, inn yard, forest clearing, roadside ruins), and N is Stas's call. Design: thread «Design scene maps for «Где все»», page https://claude.ai/artifact/GhBDV6JZMuER1TcHsLUtgN. Stas decided it on 2026-11-21: the scene's text always wins, the cache is by place, layouts are drawn by hand and committed, and the living world gets N prepared places.

# Exit criterion

Not written yet. It comes with the scope and the system design, each row naming its lowest layer (decision 0080).

# Open before the design

1. Houses on the map, or only ground and places.
2. The woodpile and the trough in the mill yard: drawn flat, or given geometry (MON-10).
3. N, the number of prepared places.
4. A player fact for "what we learned in this place".

# Tasks

MAP-31, the Mill NPCs' deaths. The other rows come after the scope and design are accepted (regulate first).

# Art references

The look for the NPC portraits starts from a private moodboard Stas asked for on 2026-11-23: works by Aleksandra Zheleznova («Самый тёмный час»), Disco Elysium concept art, and stills from Aleksei German's «Трудно быть богом» (2013), with a short note on what they share. It lives in the project files only, `/mnt/project-files/assets/moodboard/` (page `moodboard-2026-11-23.html`, sources in `SOURCES.md`), and never enters a repo or the product (Rule 7). The 70/25/5 palette rule of the October moodboard is retired (Stas, 2026-11-23). Whether portraits keep the flat Paper ground is open for this milestone's design.

# Status

open, no number. Opened 2026-11-21 at Stas's ask («Давай объединим NPC registry and Places registry в один milestone»). Order (Stas, 2026-11-23 20:12Z): Glass Table → Sign in with ChatGPT → People and places registries, so it comes before «Камень A».
