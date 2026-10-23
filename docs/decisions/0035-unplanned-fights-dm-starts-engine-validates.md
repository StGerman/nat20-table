# 0035. Unplanned fights: the DM starts them, the engine validates them

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Stas, review comment on the Milestone 6 spec (table #96, §3.7): "Robbery MAY become a fight. DM SHOULD narrate and handle the story. The engine SHOULD support and validate correctness. If it requires a dedicated milestone, it MUST be planned."

## Context

Players do what an adventure didn't plan, such as robbing the reeve. Today the engine can only start a fight from an encounter in the scene file, and its participants come from the file, never from the caller (protocol §4.4). An NPC who isn't a creature in the scene can't be fought, items can't change hands (loot is out of the demo's scope), and the only monsters with stat blocks are the four the demo uses. Rule 4 forbids the DM from narrating a fight the engine didn't resolve.

## Options

### A. Authored encounters only
- Pro: nothing to build; every fight is checked in the pack.
- Con: an unplanned crime can never become a fight; the DM has to steer players away, which is railroading.

### B. The DM starts an unplanned fight, and the engine places and validates it
- Pro: the DM handles the story, as a human DM does; the engine still rolls, resolves and refuses anything illegal (Rule 4), the same split as surrender (decision 0021).
- Con: contract and engine work (placing SRD creatures the scene didn't list, a fight the scene didn't define, items changing hands), more SRD stat blocks, and new DM tools.

### C. The DM narrates the fight without the engine
- Con: breaks Rule 4 and acceptance criteria 2 and 3. Rejected.

## Decision

B, as its own milestone after Milestone 7. *The Silent Mill* doesn't need it: in Milestone 6 and the demo, an unplanned crime has narrated consequences only (Milestone 6 spec D11).

## Consequences

- New Milestone 9 "Improvised play" in TASKS.md, planned after Milestone 7, with its own spec: API-33 (the DM places an SRD creature the scene didn't list), API-34 (a fight among creatures present that no authored encounter defines), MON-11 (SRD stat blocks for townsfolk such as Commoner, Guard, Bandit and Noble, in the format of decision 0026), ITM-6 (loot: items and coin change hands, with the checks the engine resolves), AGT-24 (the DM's tools and guidance for it). MAP-5 (guards and a lockup for *The Silent Mill*) can use it.
- The engine decides what is legal: which stat blocks exist, where creatures may stand, who fights whom, and what each roll does. The DM decides only that the story turns into a fight, as with surrender (0021).
- Player views of improvised creatures follow the same visibility table (Rule 3): name, health band and visible conditions.

## Revisit when

The milestone's spec is written: it fixes the commands and the limits on what the DM may place.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §3.7, D11; `contract/protocol.md` §4.4; decisions 0015, 0021, 0026; scope §5.
