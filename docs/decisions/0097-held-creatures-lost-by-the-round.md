# 0097. A held creature is lost by the round, while its holder stands

- **Status:** Proposed
- **Date:** 2026-11-23
- **Decided by:** Lev Neiman proposes option C in `docs/design/the-godmother-system-design.md` §6. Stas decides; the merge is his yes.

## Context

The scope wants sleepers the engine can count: one the party did not reach in time does not wake, and the count writes a deed at the fight's end (`docs/scope/the-godmother-scope.md` §2 item 4, §6 question 3). One constraint: a fight that ends early by surrender never costs a child nobody had a turn to reach. Facts:

- SRD 5.2.1 gives the Giant Spider a web that holds a creature Restrained until the web is destroyed. Core has no Giant Spider and no web yet; whatever frees a webbed party member in fight 1 has to be built for the stat block anyway.
- A scene creature that is neutral and in no encounter takes no turn and is attacked by no scripted monster.
- The engine already acts on a round with a condition: a round spawn with `unless`.
- The engine never calls a surrender on its own; the DM does, while the condition holds.

## Options

### A. Still in a cocoon when the fight ends (the concept)
- Pro: one check, at the end.
- Con: winning becomes the moment of loss. A party learns to leave one weak enemy alive and cut at leisure, and a quick surrender costs children nobody reached, which the scope forbids.

### B. A round deadline for all sleepers
- Pro: simple to say.
- Con: all or nothing in one round; and the clock runs on after the spider is dead, so only the DM's call of the surrender stops it.

### C. One a round, from a stated round, while the holder is up (proposed)
From the end of a round the scene file names, and at the end of each round after it, the next sleeper still held is lost, in the scene's order, as long as the creature that holds them is conscious. A sleeper whose web is destroyed is safe. When the holder is down the count stops for good.
- Pro: both ways the concept names are ways to beat the same clock: cut a child loose, or bring the spider down. Neither is free: an action spent on a web is not spent on the fight.
- Pro: the constraint holds by construction. A surrender needs the holder down, which has already stopped the count, and no sleeper is lost before every character has had three turns.
- Pro: no model in it: the engine stops the count when the spider falls, whether or not the DM calls the surrender.
- Con: one more block in the scene format and one event. If the party can kill the spider inside the first rounds every time, cutting is never worth an action; only a table of seeded fights can show that.

### D. The spider attacks the sleepers
- Pro: the loss is a death the engine already records.
- Con: the scripted policy would have to target neutral creatures, and a child dies by a bite on screen every time.

## Decision

Proposed: C. It is the one where the player can read the system during the fight and the record does not depend on the model.

## Consequences

- Contract: `SceneCreature.held_by`, `Encounter.held`, the public event `held_lost` (design §8). Additive.
- "Cut loose" is the stat block's own rule: one attack against the web that holds a creature, the same act that frees a webbed friend in fight 1.
- The round the count starts from is scenario data, DM only. The proposal is 3; a seeded table of fight 2 under two scripted party policies sets it before the pack merges (design §14).
- A sleeper lost, or dead, at the fight's end writes `a_sleeper_did_not_wake`; otherwise `all_sleepers_woke`. A fight the party loses writes neither.
- Each held creature may name a deed of its own, written with the outcome when that creature is lost or dead: the dawn scene must know whose child it was, and one outcome deed cannot say (design §6 rule 7).

## Revisit when

- The seeded table shows one policy saving every sleeper in nine fights of ten: then the round, the order or the line-up, in content.
- Vera or a player stops at the line that tells a sleeper is lost (decision 0070's own signal).

## Sources

- `docs/design/the-godmother-system-design.md` §6; decision 0070.
- `crates/nat20-api-contract/src/scene.rs` (`SpawnWhen::Round`, `SurrenderCondition`); `contract/protocol.md` §4.4, §4.6.
