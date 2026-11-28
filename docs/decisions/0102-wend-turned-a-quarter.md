# 0102. The Wend is turned a quarter clockwise: the sea to the west, the hills to the east, the Snake to the south

- **Status:** Proposed
- **Date:** 2026-11-28
- **Decided by:** Stas, in the scene pictures thread, 2026-11-28 ("world on 90° CW: Snake in front"), after Claude recommended keeping the map as it was; accepted on merge

## Context

The Wend maps are being painted: a region sheet and area sheets, in plan with the relief lifted (decision record to come with the map pipeline; prototype in the project folder, `worlds/wend/mapgen/`). The painting and the vector layer (pins, roads, the party's route) go through one projection, so any rotation of the sheet keeps the miles in `worlds/wend/map.json` right. Stas wants a wide sheet with the sea on the left, the Hollin Hills on the right and the Snake across the front. Facts checked:

- Compass words about the Wend live in three files on main: `lore/the_wend_valley.md` (21 phrases), `worlds/wend/map.json` (two comments and two edge names) and `scenarios/fair_in_wend/prose/adventure.md` (one). No pack, prompt, deck or open PR (#417, #492) uses them.
- The cost grows with every pack written against the old directions.

## Options

### A. Keep the map as it is (north up, sea at the bottom)
- Pro: a tall sheet fits the phone; the river road reads top to bottom; nothing changes.
- Con: not the wide sheet Stas wants.

### B. Turn only the sheet
- Pro: free; the world keeps its north.
- Con: the sheet's north arrow points down the page, and "the old road east" runs down the page.

### C. Turn the world a quarter clockwise
- Pro: the wide sheet with north up; the lore's words match the sheet; cheapest now.
- Con: about 25 phrases change; two edge ids keep their old names.

## Decision

C. Every direction turns a quarter clockwise: north becomes east, east south, south west, west north. The sea is to the west, the Hollin Hills to the east, the Snake and the Free Host to the south, the kingdom and the lord's harbour to the north. It beat B because the sheet and the words now agree, and beat A because it gives Stas the sheet he wants while it is still cheap.

## Consequences

- `lore/the_wend_valley.md`, `worlds/wend/map.json` and the *Fair in Wend* prose are turned in the same PR. Miles, roads, places and their names do not change, except the two edges: "the old road north" (id `old_road_west`) and "the old road south" (id `old_road_east`). The ids stay, because records and tests may carry them.
- The relief study in the project folder (`worlds/wend/coastgen/`) keeps its own frame; the map pipeline turns it with one rotation.
- Packs written from now on use the turned directions; Zoya checks them against the lore.

## Revisit when

The map sheet proves unreadable on the phone, or a pack needs the old orientation for a reason the lore cannot carry.
