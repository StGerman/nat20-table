# The Way Back

The second contract of Milestone 11 (MAP-12, design "The Way Back"): the Grey Lantern company, as Hired Blades, escorts Fenn Lusk's wagon of salt and iron from the Saltmouth fair back up to the Highsteads. About three game days and up to two hours of play, on the shared Wend map (`worlds/wend/`). The human plays a Hired Blade; the merchant is an NPC. Played after *Fair in Wend* on the same roster, it is the exit pair's run 2: the road remembers the first contract. Played alone, on a new party, the cards that read deeds are not in the pile, and the rest plays as written.

Everything in this folder is for the DM. Players see only what the DM narrates, the engine's lines and, for AI players, their own card.

## Places and scenes

| Place (world) | Scene | Beat |
|---|---|---|
| Saltmouth (start) | `twb_wendmouth` | Social: Odda hands the company on, the advance |
| Every stretch and camp | `twb_road` | Exploration: road cards and fights |
| Wendford | `twb_wendford` | Social: the price of salt, the reeve |
| The Highsteads (destination) | `twb_highsteads` | Narrative: arrival, the pay, the end |

## What is where

- `campaign.json`: the skeleton and the campaign in one file, the adventure.json format plus the engine's `world` block (map, start, route, caravan, escort, each place's scene) and the run's `day_limit`, which counts from the contract's first day. Its schema is `game/schema/adventure.schema.json`.
- `scenes/`: the engine's scene files: anchors and checks. Every place scene has a `by_the_wagon` anchor, where the world's place NPCs stand.
- `prose/`: the premise and truth, one file per scene, and Fenn Lusk in `prose/npcs/`. Odda Vell's is a copy of *Fair in Wend*'s.
- `deck/`: Fenn's three cards (*Wet salt*, *Men at the iron*, *Salt on credit*) and *The fair price*. They join the world's deck only while this contract runs.
- `cards/`: the four pregens' personality cards, the same as *Fair in Wend*'s.
- The map, the world's road cards (among them *The bridge again* and *Gwyn's news*) and the people of each place are the world's: `worlds/wend/`.

## Play and check it

```bash
cargo build --release -p nat20-api-server
npm run pack:check -- scenarios/the_way_back
npm run play:full -- --pack scenarios/fair_in_wend --roster <name>
npm run play:full -- --pack scenarios/the_way_back --roster <name>
```

Our own text, CC-BY-4.0, credit "nat20-table contributors".
