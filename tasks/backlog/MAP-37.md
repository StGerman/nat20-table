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
- Both lines are gone. The reeve pays a sum the pack names, the engine moves it with `give`, and the sheet shows it.
- The sum is the human's to win on the green, in their own words: no card, no Narrator's pick.

Mechanism (Lev, 2026-11-27, fits S, no contract change):
- `s6_wrap_up.json`: `osric_hale` gets `carries: {coins: {gp: 40}}`, the common chest. The engine caps the pay: a `give` over his purse is refused (`insufficient_funds`).
- `s1_village_green.json`: two new checks, `reeve_bargain` (Persuasion DC 12, flag `pay_thirty`) and `reeve_bargain_chest` (Persuasion DC 17, flag `pay_forty`). The player's ask picks one; the first one rolled is Osric's last word (prompt rule). A failure sets nothing. No ask, no roll.
- `prose/s6_wrap_up.md`: the Narrator reads the flags in `get_state`, moves Osric beside the bargainer and has him `give` 40 GP on `pay_forty`, else 30 on `pay_thirty`, else 20. One character is paid, the bargainer or Bren; sharing is the party's own `give`.
- Prose lines in `adventure.md`, `s1_village_green.md`, `npcs/osric_hale.md`, and the two check intents in `adventure.json`. Osric's new lines go to Zoya, then Vera.

Cut, to stay S: prepay (scene creatures leave with the scene, halves need the Narrator's arithmetic, and nothing in the pack sells before Scene 6); Osric's own purse; one roll with two DCs.

Accepted for S: the Narrator passes `give` a sum the pack names for an engine-set flag (the structural version, a scene `pay` consequence, is size M); "one ask" is a prompt rule, not enforced.

Not here: loot, shops, or any other change to the Demo Run's money (its scope is frozen; this is the pay the pack already promises).

Lowest layer (decision 0080): a test with no model. A seeded server test on the real scenes: each bargain check sets its flag on success and none on failure; the flag is in DM state after Scene 6 loads; Osric's `give` of 20, 30 and 40 raises the receiver's purse by that, 41 is refused; `pack:check` and the m7 replay fixtures stay green. Not covered: that the Narrator gives the sum the flags name; one live Scene 1 + Scene 6 run checks the ledger entry against the flags.

## Status

Opened 2026-11-27 from the analysis of the 2026-11-25 run, at Stas's request.
