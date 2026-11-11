# Fair in Wend

A living-world sandbox for Milestone 9 (MAP-7): the Grey Lantern company, as Hired Blades, escorts Odda Vell's wagon of hill-farm wheat from the Highsteads down to the Saltmouth fair. About three game days and up to two hours of play, on the shared Wend map (`worlds/wend/`). The human plays a Hired Blade; the merchant is an NPC.

Everything in this folder is for the DM. Players see only what the DM narrates, the engine's lines and, for AI players, their own card.

## Places and scenes

| Place (world) | Scene | Beat |
|---|---|---|
| The Highsteads (start) | `fw_highsteads` | Social: the contract, the advance |
| Every stretch and camp | `fw_road` | Exploration: road cards and fights |
| Wendford | `fw_wendford` | Social: a warm stop, a rumour |
| Saltmouth (destination) | `fw_wendmouth` | Narrative: arrival, the pay, the end |

## What is where

- `campaign.json`: the skeleton and the campaign in one file, the adventure.json format plus the engine's `world` block (map, start, route, caravan, escort, each place's scene) and the run's `day_limit`. Its schema is `game/schema/adventure.schema.json`.
- `scenes/`: the engine's scene files: anchors and checks. Every place scene has a `by_the_wagon` anchor, where the world's place NPCs stand.
- `prose/`: the premise and truth, one file per scene, and Odda Vell in `prose/npcs/`.
- `deck/`: Odda's cards (*The fair gate*, *The meadow track*) and *Rufus's offer*. They join the world's deck only while this contract runs.
- `cards/`: the four pregens' personality cards, the same as *The Silent Mill*'s.
- The map, the road cards and the people of each place are the world's: `worlds/wend/`.

## Play and check it

```bash
cargo build --release -p nat20-api-server
npm run pack:check -- scenarios/fair_in_wend
npm run play:full -- --pack scenarios/fair_in_wend
```

Our own text, CC-BY-4.0, credit "nat20-table contributors".
