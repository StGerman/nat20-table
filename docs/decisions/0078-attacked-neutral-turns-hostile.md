# 0078. A neutral named in a fight turns hostile

- **Status:** Accepted
- **Date:** 2026-11-13
- **Decided by:** Stas (M12 run 2 analysis thread, 2026-11-13: «Да двигаем требования в M12»; M12 build thread, decision card, option "Сам, в start_fight")

## Context

In M12 exit run 2, the human's character attacked a neutral scribe. The DM called `start_fight`, and the engine refused a neutral with `bad_request`. That refusal is not retryable, so it ended the DM's turn along with its narration. The engine could set a creature's side only when the creature was placed.

## Options

### A. `start_fight` turns a neutral it names hostile
- Pro: the attack and the fight are one call; there is no new command and no step for the DM to forget.
- Con: a DM that names a neutral by mistake makes an enemy of it.

### B. A new DM command `turn_hostile`, then `start_fight`
- Pro: the change of side is its own explicit call.
- Con: more contract, and the DM has to remember two calls in the right order, which is the kind of step it got wrong in run 2.

## Decision

A. Each neutral participant of a `start_fight` becomes hostile once the request's checks pass, before Initiative. The engine logs `turned_hostile{handles}` (public), and the creature's attitudes follow the sides again. It stays hostile after the fight (contract 1.0.0-dev.71, protocol "Who can fight"). Torture stays off screen (bible Commandment 4): the fight is shown, and a mutilation is not.

## Revisit when

A neutral should fight on the party's side (milestone «Свои в бою»), or a DM names neutrals in fights by mistake in a run.
