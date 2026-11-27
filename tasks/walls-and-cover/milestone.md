---
type: Milestone
title: "Walls and cover"
description: "The engine knows the walls, fences and cover a place map shows: paths go round them and a character can hide behind them; built from the place layouts, no number until Stas gives one"
state: open
---

# Goal

What the map draws, the engine knows. A house stops a walk, the path goes round it, and a character behind the woodpile or the fence has cover. First place: the mill yard, where Vera wanted to hide behind the trough and the engine gave her nothing.

- **One source.** A tool builds each place's mesh (`.obj`) from its committed layout: every prop with `solid` becomes a wall of its `height_ft`. The scene's existing `map` field names that mesh, so the contract does not change for this. Nobody draws a mesh by hand, and the map and the engine never disagree.
- **Core (fork, Rule 6).** Core already finds paths on a navmesh and checks line of sight. SRD 5.2.1 Cover (half +2 to AC and Dexterity saves, three-quarters +5, total cannot be targeted) is the missing rule, with a test and its `PROGRESS.md` row.
- **The page.** With walls, a circle of 30 ft lies about where you can walk. The ring becomes the area the engine says is reachable. Getting it to the page is a wire change (Rule 1), decided in the design.
- **Geometry crates first.** UPS-24 (the geometry stack in one PR) and UPS-25 (parry3d 0.27 to 0.31) land before the Cover rule, so the rule is written once against the new crates.
- **Houses on the map.** They appear once their place has a mesh, from the same layout (People and places registries, layout format).

# Exit criterion

Not written yet. It comes with the scope and the system design, each row naming its lowest layer (decision 0080).

# Tasks

None yet; they come after the scope and design are accepted (regulate first).

# Status

open, no number. Opened 2026-11-23 at Stas's ask («Я предпочту геометрию и возможность спрятаться как минимум за поленницей или оградой... планируй в отдельный milestone»). Comes after People and places registries, whose layout format it builds on. Revives what MON-10 left for later (`maps/README.md`: a mesh with walls and cover only if a fight needs cover).
