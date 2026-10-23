# The Silent Mill

An original one-shot for four level 2 characters and about 90 minutes of play, written for the Demo Run (scope §3). The miller's apprentice has vanished and the mill wheel has stopped; the party follows the mill lane to a yard full of goblins and a cellar with their boss.

Everything in this folder is for the DM. Players see only what the DM narrates and, for AI players, their own card.

## Scenes

| Scene | Beat | Target |
|---|---|---|
| 1. The village green | Social: the reeve's request; Insight and Persuasion unlock details | 10 min |
| 2. The mill road | Exploration: tracks and a snare, a chance to spot the lookouts | 10 min |
| 3. The mill yard | Fight: Goblin Warriors and Wolves; one goblin may surrender | 25 min |
| 4. The captured goblin | Social: the interrogation, a short rest | 10 min |
| 5. The mill cellar | Fight: the Goblin Boss and his band, rats from the grain chute | 30 min |
| 6. Back on the green | Narrative: reward, epilogue, a hook | 5 min |

## What is where

- `adventure.json`: the skeleton (decision 0031). Scene order, exits, NPCs, which check fits which player intent, target times and the prose each part uses. Its schema is `game/schema/adventure.schema.json`.
- `scenes/`: the engine's scene files: anchors, creatures, checks and DCs, the snare, both fights with their surprise, surrender and reinforcements.
- `prose/`: the adventure's premise and truth, one file per scene (read-aloud opening, what the characters can notice, how to run it) and one per named NPC in `prose/npcs/`.
- `cards/`: the personality cards for the four pregens (`pregens/` in the repo root), each read by the agent playing that character.
- The setting is in the shared `lore/the_wend_valley.md`.

## Check it

```bash
cargo build -p nat20-api-server
npm run pack:check -- scenarios/the_silent_mill
```

The check validates the skeleton against its schema and `format_version`, every file and id it names against the pack, and then loads every scene in the engine in order with the party carried in. CI runs it on every pack in `scenarios/`.

## Licence

Text, scene files and cards: CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/), credit "nat20-table contributors". Monster names and rules are from the SRD 5.2.1 (CC-BY-4.0, Wizards of the Coast LLC); see `NOTICE.md` in the repo root.
