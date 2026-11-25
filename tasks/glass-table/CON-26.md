---
type: Task
id: CON-26
title: "The right page of the Mac's open book shows the picture of the place, and what is not drawn is named where it would stand"
pri: P2
dest: Ours
size: M
state: partial
---

Stas on his own Mac, 2026-11-25, full screen at a live table of *The Silent Mill*: the open book of CON-25 runs and looks bad. Without pictures its right page frames a small map on an empty ground, people stand as letters, and the story is pressed to the top. Of three ways on (park the book until the picture-book milestone, mend it as it is, pull the pictures in now) he picked the pictures now (card in the thread, 2026-11-25 20:54Z), knowing it costs days against the iPhone goal. He then asked that what is missing be drawn as a placeholder by its type, with the name of the place or the person on it, so a picture of the window says which picture, portrait or plan to make (20:57Z, 21:00Z).

What a window is told of a place lies in the pack beside the pictures, `plates/index.json`: by scene, the name the window may show, the picture's file and the key of the place's plan. It is not in the skeleton, which is read to the DM whole. The table tells the human's window the place of the scene it is in with each situation (`place` on the `situation` event: a name and two file names under the pack's folder, no scene id, Rule 3). The pictures are copied into the built page (`plates/<pack>/`), so the app holds them and loads nothing from the network.

On the Mac's open book the right page has a third turn, «Место»: the picture of the place, which is what the page shows by itself out of a fight. In a fight it turns to «Где все» by itself, and back when the fight ends or the table moves to another place; a turn by the human holds until then. A place whose picture is not drawn is a placeholder: «Картина места не нарисована», the place's name, the file's name.

On «Где все», in every window: three of the Mill's people (`osric_hale`, `bertil_pell`, `wenna_thorne`) have faces, cut from our NPC portraits. A creature with no portrait stands in a dashed ring, and a line in the corner lists what is not drawn by its own name: the plan of the place (`the_silent_mill/green`) and each missing portrait's file (`wolf.jpg`). On a page as wide as a Mac's the story's first line stands clear of the window's top, and a foot of the yard may be as small as 8 px (CON-25 kept 10) so more of a place fits the right page.

Not in this row: the painted plan under «Где все» (the scene-map design: plans of the green and the yard exist as pictures and are not laid under the lens here), a person's portrait on the right page when their name is pressed, any of it on the phone beyond the faces and the corner line, a picture shown only once the party has seen what it shows, and pictures made while the game runs (Stas, 2026-11-25: perhaps after Sign in with ChatGPT). The corner line and the placeholder are for us, while pictures are being made: before a stranger plays, they go behind a switch or go away. The labels that run into each other on «Где все» are table #479's.

Depends on: CON-25 (table #499; this row's PR is stacked on it).

Check: the places file and its mistakes, and that nothing told of a place names its scene: test, no model (`game/test/places.test.ts`, the pack check). The place reaches the window with the scene it belongs to: test, no model (`game/test/loop.test.ts`). The shell is told the place and the fight: test, no model (`game/test/page-chrome.test.ts`). The corner line and the dashed ring: test, no model (`game/e2e/shell.spec.ts`). The picture, the placeholder and the page turning to «Где все» in a fight, in the Mac's window: test, no model (`shell/MacTour/MacTour.swift` `testPictures`, shots 51 to 58). How it reads at a live table on his own screen: a person (Stas).

## Status

partial (table #499's stack). Built: all of the above. The Mill names six places; four have pictures (`green.jpg`, `storeroom.jpg`, `cellar.jpg`, `green-after.jpg`, all Stas's picks of 2026-11-25; a second storeroom with the goblin who yielded is picked and not shown, since no window is told what happened in the yard) and two do not (`mill-road.jpg`, `mill-yard.jpg`), which `npm run pack:check` lists as warnings. Gritch has a portrait and no face on the page: his creature's handle is `boss`, which names no one, so the page would give that face to any pack's boss; Snitt is no creature of the pack and has no token.

Open: the pictures of the road and the yard; the wolf's portrait; a face for Gritch (a handle or a kind that names him); the corner line behind a switch before Friends and Family.

Not checked: the page turning back to the picture when a fight ends (the recorded run ends in the fight); a window made narrow with the picture on its right page; the corner line on the phone under the dock; Stas's own Mac.
