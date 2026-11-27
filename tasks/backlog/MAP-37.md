---
type: Task
id: MAP-37
title: "The Mill's reeve pays a real sum, and the pack stops telling the Narrator to name none"
pri: P2
dest: Ours
size: M
state: todo
area: "7. Maps and scenario (E7)"
---

The Silent Mill still carries a Demo Run rule from before the engine moved money: the Narrator reads the whole pack (`game/src/pack/read.ts`), and two lines in it say the reward stays in the fiction. `prose/adventure.md` ("Name no sum and change no sheet") and `prose/s6_wrap_up.md` ("Name no sum; the engine's purses don't change in this adventure"). In the run of 2026-11-25 (`full-2026-11-25T21-37-49-644Z`, flag n93-1) the reeve put the common chest's purse and his own into Bren's hands, and Bren's sheet still said 54 GP: the judge flagged it, and only that line made it a dismissal. Coin moves through the engine now (`give`, the pay events of ENG-49), so the line is an artifact.

Done means:
- Both lines are gone. The reeve's pay is a sum the engine moves to the party as a scene payout, so the sheet shows it and the Narrator says the number from the engine (dm.ts numbers rule).
- The sum and the terms are the human's to win on the green, in their own words (not a card, not the Narrator's pick), so the human is not a passenger to the pay.

Proposal (Stas, 2026-11-27: Claude proposes the sum, the roll moves it, the chest caps it, prepay or postpay can differ):
- The common chest holds 40 GP; no deal can pay more. Osric offers 20 GP if nobody bargains.
- The human (or an AI player) names an ask; the engine rolls Charisma (Persuasion) for the one who bargains, a check separate from `reeve_persuasion`. Success at DC 12 makes it 30 GP, at DC 17 the whole 40 GP; a failure keeps 20 GP and Osric names nothing more. An ask at or under 20 GP needs no roll.
- Terms are the party's ask too: half now from the chest, the rest when Wenna is home, or all of it on the green at the end. Without an ask, all of it at the end, before the village, as Scene 1 already plays.
- Scene 6 pays what is still owed. Osric adding from his own purse stays fiction with no sum, or is cut.

Open: how the engine carries a promise from Scene 1 to Scene 6 (a scene `pay` consequence is a contract change, Rule 1; the escort contract's pay on arrival may already be the shape). Lev's design picks it before code.

Not here: loot, shops, or any other change to the Demo Run's money (its scope is frozen; this is the pay the pack already promises).

Lowest layer (decision 0080): a test with no model. Seeded fixtures show each outcome (no bargain, fail, DC 12, DC 17; prepay and postpay) put the right sum in the party's purse, never over 40 GP. A Vera read of the green with the bargain.

## Status

Opened 2026-11-27 from the analysis of the 2026-11-25 run, at Stas's request.
