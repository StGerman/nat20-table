---
type: Milestone
title: "Rooms you can enter"
description: "A door on a place map leads into another place; first the Wendford alehouse, where the party can take a room for the night; no number until Stas gives one"
state: open
---

# Goal

A house is worth drawing when you can go in. A door anchor carries `leads_to`, another place in the registry, with its own layout and mesh. Going through it loads that place, the way a scene exit loads the next scene. An interior is a place of its own, never a second storey inside one mesh, so this milestone adds places and links and changes neither the registry format nor the geometry.

First interior: the Wendford alehouse. Going in changes the scene, never the caravan's place on the world map: the interior's registry entry has `in: wendford`, and the world position stays `wendford`. So the room for the night is the `rest_night{where: inn}` that already exists (protocol §4.12): it charges the `inn_cp` of `wendford` in `worlds/wend/map.json` through the ledger and ends the day. This milestone gives that rest a room to happen in; it adds no new price, command or rest rule.

# Exit criterion

Not written yet. It comes with the scope and the system design, each row naming its lowest layer (decision 0080).

# Tasks

None yet; they come after the scope and design are accepted (regulate first).

# Status

open, no number. Opened 2026-11-23 at Stas's ask («как насчет таверны гостевого дома где можно остановаться? Хотим под это запланировать milestone?»). Comes after Walls and cover: a door needs a wall to stand in.
