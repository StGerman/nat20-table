---
type: Task
id: MAP-37
title: "The Mill's reeve pays a real sum, and the pack stops telling the Narrator to name none"
pri: P2
dest: Ours
size: S
state: todo
area: "7. Maps and scenario (E7)"
---

The Silent Mill still carries a Demo Run rule from before the engine moved money: the Narrator reads the whole pack (`game/src/pack/read.ts`), and two lines in it say the reward stays in the fiction. `prose/adventure.md` ("Name no sum and change no sheet") and `prose/s6_wrap_up.md` ("Name no sum; the engine's purses don't change in this adventure"). In the run of 2026-11-25 (`full-2026-11-25T21-37-49-644Z`, flag n93-1) the reeve put the common chest's purse and his own into Bren's hands, and Bren's sheet still said 54 GP: the judge flagged it, and only that line made it a dismissal. Coin moves through the engine now (`give`, the pay events of ENG-49), so the line is an artifact.

Done means:
- Both lines are gone. In their place, the reeve's pay is a sum the pack names, and the engine moves it to the party in Scene 6, so the sheet shows it and the Narrator says the number from the engine (dm.ts numbers rule).
- Scene 1 stays as it plays: Osric names no sum on the green and says he will name it before the village when Wenna is home.

Open, for Stas: the sum, and whether it comes from Osric's purse in the engine (`give` from the scene creature) or as a scene payout.

Not here: loot, shops, or any other change to the Demo Run's money (its scope is frozen; this is the pay the pack already promises).

Lowest layer (decision 0080): a test with no model. The pack check or a seeded Scene 6 fixture shows the party's purse grow by the pack's sum.

## Status

Opened 2026-11-27 from the analysis of the 2026-11-25 run, at Stas's request.
