# 0071. Allies in fights: surprise from the dog first; dog, horses and the Merchant as creatures later

- **Status:** Accepted
- **Date:** 2026-11-12
- **Decided by:** Stas, thread "Bring companions and animals into fights" (19:07Z, 19:30Z, 19:32Z, 19:33Z), on Lev Neiman's consult

## Context

On `night_wolves` (`worlds/wend/deck/lowland.json`) in a live *Fair in Wend* run on the M12 exit build, the DM narrated Gwyn's dog growling, but the fight held only the wolves and the party. The dog (deed `fed_gwyns_dog`), Merchant Odda Vell and the horses are in the scene and in no engine fight. Stas's direction: bring everyone in where it makes sense. Facts checked: `place_creature` puts a creature on side `party` under a scripted policy (MON-11); `neutral` creatures never enter a fight; core has no Mastiff or Draft Horse block; SRD 5.2.1 Wolf bite (+4, 1d6+2, crits counted) kills a Mastiff (AC 12, HP 5) in about 45% of attacks and a Commoner (AC 10, HP 4) in about 64%; with Pack Tactics (a second wolf adjacent, Advantage) about 61% and 80%.

## Options

### A. The dog acts through surprise; the note says where everyone is
- Pro: XS work, 0 extra turns or model calls; what the party did (fed the dog) changes the fight.
- Con: the dog, Odda and the horses still have no bodies; the stake on the horses stays narrated.

### B. The dog and the horses as creatures on the party side, under a script
- Pro: a dead horse slows the wagon and the dog can die, so the stake is real.
- Con: two new stat blocks in core, a hold-position policy, 9 places in initiative instead of 6, longer narration.

### C. The Merchant can die
- Pro: an escort where the Merchant can be lost is a real escort.
- Con: a new system (who pays the Hired Blades, whose cargo); a story question first.

## Decision

A after the M12 exit pair; B and C in the backlog («Только А остальное в backlog»). The dog may die from one bite without its stake shown on `stray_dog` («допустимо»). The narration judge gains a check for a creature that acts in a fight's narration but is not in it («Да добавить проверку судье»); whether it gates a run is still Stas's call.

## Consequences

Rows ENG-44, MAP-20, AGT-104 (after the M12 exit pair); MON-12, ENG-45, ENG-46 (backlog). Allies are run by the engine's script, never by the DM agent or a player.

## Revisit when

A run shows the party wanting to protect the horses or Odda and the table having nothing to act on, or the judge's new check fires on another card.

## Sources

- Lev's consult and Stas's answers in the thread above; table #360.
