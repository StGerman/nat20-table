# Milestone 11 "Word on the road": spec and system design

2026-11-06 · commentable copy: Claude Doc https://claude.ai/artifact/VEh7rGHVVWmXntPNYuWw5Q. Scope: `docs/scope/living-world-scope.md` §8. Decisions: 0063 (Q1 to Q7 below, and the shape of the exit). Input: the Faces of the Road deck doc https://claude.ai/artifact/89fYVEn1nvGmUH64vmP5LJ (decisions 1 to 12, changes 1 to 13).

Status: accepted by Stas on 2026-11-06 ("Ок", 17:16Z, after Q1 to Q7). Checked against table `main` 0f4982e (contract 1.0.0-dev.58); no core change expected.

## Summary

Milestone 11 makes the road remember. Today a card is drawn at random, decided, and forgotten, and a finished contract wipes the world. After Milestone 11 the party's choices are written down as **deeds**, later cards and arrivals read them, the DM picks the card that continues the story, and the next contract starts in a valley that remembers the last one.

- **What it builds:** the first cut of the Faces of the Road deck doc: changes 1, 2, 3, 4, 10 and 13, the death deed, the arrival pay-offs and scouting ahead (decision 7). Plus the story-space strand (decision 9): the DM prompt rules and the card tests. Plus the deck content itself, including chain D (Hungry hills).
- **What it rests on:** the deck doc's decisions 1 to 12, and Stas's cards of 6 November: the deck doc is the input (card 1, accepted with this design), the exit is a pair of runs like Milestone 9 (card 3), a new roster rather than a migrated one (card 4), the post-M9 findings ship first as their own stack (card 5), AGT-25 and AGT-68 are closed (card 6), the TUI lines stay English (card 7), and Osric's kin in Arachas is Nell Hale (card 2).
- **The goal it shares with Arachas** (decision 10): after both, a design for an engine that moves the story forward. Milestone 11 supplies the data: every deed, every pick and its reason, every pay-off, logged.
- **When it starts:** now. The post-M9 hygiene stack (table #284 to #296) and table #297 (Wendmouth renamed Saltmouth) merged on 6 November: rows MAP-8, MAP-9, API-50, AGT-73 to AGT-75 and AGT-84 to AGT-87, where AGT-87 has the human's character vote first on road cards (decision 0062); contract 1.0.0-dev.58 with `pass_time` (decision 0061). Milestone 11's own contract work starts at dev.59.

## Scope

### In

1. **Deeds** (change 4). A choice can `remember` a deed; cards and choices can require a deed (`if`) or its absence (`unless`). Each deed records who did it (`by`: who voted or rolled) and the day.
2. **The death deed.** A fight's monster can carry an NPC id. When that creature dies, the engine writes `killed_<npc>` with `by` (whoever dealt the last blow).
3. **Soon** (change 2). `add_card` with `soon: true` queues the card: the next draw in its zone takes it without a roll.
4. **Place cards** (change 3). Cards with `when: arrival` are drawn when `travel` ends at their place: the Wendford and Saltmouth pay-offs.
5. **Memory across contracts** (change 10). The world splits into the contract (position, caravan, escort, card on the table) and the memory (clock, deeds, deck, NPCs, discovered places). A finished contract resets only the contract.
6. **Draw three, DM picks** (change 13). The engine rolls three cards, the DM picks one and logs why.
7. **Scouting ahead** (decision 7). One Blade walks ahead as the scout. When a leg's card is drawn, the scout makes a check before the card is shown, and on a success the party meets the card forewarned: its forewarned choice is open. Foretell (change 6) stays out.
8. **Story-space** (decision 9). The DM prompt rules, and the five card tests: the validator checks what code can check, the narration judge asks the rest.
9. **Card suggestions** (decision 4). After each run, the DM writes up to two suggested cards into the run report; accepted ones join the deck later as authored cards.
10. **Content** (change 1). The Faces of the Road cards, the cast, and chain D, each card passing the five tests.
11. **The exit pair** (card 3): *Fair in Wend*, then a second pack, *The Way Back* (Q2), with a new merchant and its own cards (Q7).

### Out

- **Hearsay, road NPCs, addressed cards, fight outcomes, schedules** (changes 7, 8, 9, 11, 12): they wait until this cut has been played once, as the deck doc says.
- **Variants** (change 5): per-case choices with `if` and `unless` do the same job inside the 2-or-3 rule (Q3 below).
- **Foretell for the DM alone** (the rest of change 6), **live DM cards** (decision 4), **a real party split** on the world map (decision 7).
- **Russian TUI lines** (card 7; decision 0038 holds).
- **Old rosters** (card 4): a roster saved before Milestone 11 is refused with a plain message, and the party starts new.
- **Core work.** None expected: deeds, memory and the deck live in `nat20-world` (decision 0057), and fights use the road scene's anchor as today (decision 5).
- **Latency gates.** p95 is measured and reported, not gated (AGT-25 and AGT-68 are closed).

## Exit criterion

Two runs on one build, as in Milestone 9 (card 3): *Fair in Wend*, then *The Way Back* on the same roster.

- **Run 1:** `play:unattended`, every seat AI, a new party (`--new-party --roster <name>`, card 4). *Fair in Wend*: one escort contract with Odda, from the Highsteads down to Saltmouth.
- **Run 2:** `play:demo`, Stas as a Hired Blade, `--pack scenarios/the_way_back --roster <name>`: *The Way Back*, the next contract in the same world, with a new merchant, Fenn, from Saltmouth back up to the Highsteads (Q2; see The Way Back below).

Each run passes:

1. **The Milestone 9 rows that still apply:** the contract done and paid in the ledger, the ledger's trial balance, every roll cited, 0 leaks, the roster's hash chain held, the contract played in 120 minutes or less.
2. **The deck at work:** at least 3 road cards and 1 arrival card decided, and every DM pick with its logged reason.
3. **A thread inside the run:** at least one deed written by a choice, and at least one later card or arrival in the same run that reads a deed.
4. **Story-space:** the narration judge's story-space question leaves no flag that Stas confirms. A flag means a scene opening or a settled card where the human's character has no problem acting on ("pleasant nothing"). As in Milestone 9, Stas confirms or dismisses each flag. **The Vera test** reads each run too: the `vera` subagent gets only player-facing text from the transcript, one scene opening and one settled card that reads a deed, never this design or the run analysis. Her answer is quoted verbatim in the exit record; it informs Stas's verdict and gates nothing on its own (CLAUDE.md, Vera).

Run 2 also passes:

5. **The world remembers:** at least one card or arrival reads a deed written in run 1. The run report names the deed, its day and the run that wrote it. This row is the reason the milestone exists.

Reported, not gated: AI player and DM narration p95 against the Milestone 9 pair (players 8.2 s and 4.2 s, DM 2.7 s and 2.4 s), the talk round p95 (45.5 s and 24.5 s in Milestone 9), every fight (its card, its choice, how many rounds, who dropped), the draw-three counts (picks that read a deed, picks that passed over a fight card, draws where the DM did not answer and the engine took the first card), and the DM's suggested cards.

Fights are a recommendation, not a gate (Q6, Stas, 17:09Z): no exit row asks for one. The design leans toward them without forcing them: the DM's pick rule prefers the card that can come to a fight when two cards continue the story equally well, the validator warns (and never fails) when a route meets fewer than two cards with a fight choice, and the run report counts every fight. A fight a card starts carries a want and leaves a deed, so it stays part of the story.

## World memory across contracts

**Today.** `WorldState` (`crates/nat20-world/src/travel.rs`) holds the clock, the position, the discovered places, the caravan, the day's travel, the deck, the place NPCs, and the escort. The roster carries it as an opaque blob (`RosterWorld.state`, API-45). When the saved contract is done, `Campaign::read` (`crates/nat20-api-server/src/campaign.rs`) drops the whole state and starts the campaign from `campaign.json` again. A second contract forgets the first.

**After.** `WorldState` splits in two:

| Part | Holds | When a contract is done |
| --- | --- | --- |
| Memory | the clock, the deeds, the deck (chained cards added, the discard, `once` cards gone for the world, the soon queue), the place NPCs, the discovered places | kept |
| Contract | the pack it belongs to (its `campaign.json` `id`), where the caravan is, the caravan and its cargo, the day's travel, the escort, the card on the table and the three offered, the `once: "contract"` cards drawn in it | rebuilt from `campaign.json` |

- **The next contract** (Q2). The next contract is the next pack's: the caravan, the escort terms and the start place come from that pack's `campaign.json`, and the memory comes from the roster. For the exit pair that pack is *The Way Back* (next section): *Fair in Wend* ends at Saltmouth, and Fenn's contract starts there. The clock does not go back: the contract starts at the pack's start hour on the first day after the saved day. If the party is somewhere other than the pack's start place, the engine adds the days the trip takes at a normal pace (one day per 24 miles by the shortest road, rounded up), and the DM tells the trip in one line. The way back ends at the Highsteads, where *Fair in Wend* starts, so the two packs can follow each other down and up the valley for as long as the roster lives. A roster whose contract is still under way opens only that contract's pack; any other pack is refused with one plain line. `Campaign::read` tells them apart by the pack id the contract part stores, because every pack on the Wend map shares `RosterWorld.map`.
- **`once` cards** (Q1). Gone for the world, not only the contract. The Millbeck bridge does not come back as it was; its second visit is told by the cards that read its deeds (*The bridge again* on the road, *The toll-man in the stocks* at Wendford, *Gwyn's news* at the Highsteads). A card that should come back each contract says `once: "contract"`: its drawn mark lives in the contract part, not the memory, so it is gone for the rest of that contract and back in the pile when the next contract is built.
- **Deeds keep their day.** In Milestone 11, a card reads only whether a deed exists (`if` or `unless`), never how old it is.
- **Roster format 2** (card 4). `ROSTER_FORMAT` becomes 2 and `RosterWorld.state` holds `{memory, contract}`, still opaque to clients. A format 1 roster is refused with `bad_roster` and one plain line: the party was saved before the road learned to remember, so start a new party with `--new-party`. No converter.
- **Who rebuilds the contract:** `Campaign::read`, which today drops everything. It keeps the memory and rebuilds only the contract part. A contract under way still belongs to the party that started it (today's rule).

## The Way Back: the second contract

Stas, 6 November (Q2): run 2 plays the way back up the valley as a pack of its own, `scenarios/the_way_back`, on the same map and with the same world deck. *Fair in Wend* takes grain down to the fair; *The Way Back* takes salt and iron up to the hills. Our own text, CC-BY-4.0, credit "nat20-table contributors", like every pack.

|  | Fair in Wend (run 1) | The Way Back (run 2) |
| --- | --- | --- |
| Merchant | Odda Vell, grain factor | Fenn Lusk, salt dealer of Saltmouth (Фенн Ласк) |
| Route | the Highsteads, Wendford, the Millbeck bridge, Saltmouth: 28 miles down | Saltmouth, the Millbeck bridge, Wendford, the Highsteads: 28 miles up |
| Days | contract on the evening of day 1, the fair on day 3 | contract on the fair's last evening, Wendford the next night, the Highsteads by noon of the day after; day limit 3 |
| Cargo | 900 lb of wheat (9 GP), 20 rations | 500 lb of salt and 400 lb of iron (65 GP), 20 rations: the same weight, so the same pace, and seven times the prize |
| Pay | 2 GP a day a Blade, one day ahead, the rest at the fair | the same (decision 0058), the rest on arrival at the Highsteads, from Fenn's purse of 40 GP |
| Scenes | the Highsteads, the road, Wendford, the fair | Saltmouth on the fair's last evening, the road, Wendford, the Highsteads |

- **Fenn Lusk**, the new merchant (`npc:fenn_lusk`, a pack NPC and the caravan's owner: the engine follows his route and the Blades call travel, as with Odda). He takes salt up to the hill farms before the autumn slaughter, so they can salt their mutton for the winter, and they pay him in wool in the spring. Known by a clipboard with a pencil on a string: he ticks off every sack at every stop (his anachronism). Wants: the salt in the hills before the slaughter, and his wool from farms that can still pay. This autumn the goblins took the flocks (Hungry hills), and he is afraid half of them can't. Party hook: Fenn sells on credit where Rufus buys debts, so the Blades see the other side of Rufus's trade. No one else in the cast starts with F.
- **Odda** stays at Saltmouth, where her contract ended. In the opening scene she hands the Blades on to Fenn; what she says about them the DM tells from her contract's deeds (scene prose, not a card).
- **Place NPCs** are the world's, as the party left them: Brannock at Saltmouth, Osric at Wendford, Gwyn at the Highsteads.
- **Played alone**, on a new roster, *The Way Back* is a first contract with an empty memory: the cards that read deeds are not in the pile, and the rest plays as written.

**The merchants' own cards** (Stas asked for cards for each caravan master):

- A pack may bring its own deck folder, `scenarios/<pack>/deck/*.json`, in the world's deck format. Its cards join the world's deck only while that pack's contract runs, and the memory keeps their state (discard, chains, a world `once`) by card id like any other card; a `once: "contract"` mark stays in the contract part, as for a world card. The world deck stays one shared deck; a merchant's cards travel with the merchant's pack. Card ids are unique across the world and every pack on its map (validator). Q7.
- By merchant, not by direction: the merchant is the one who wants something (card test 1), and the direction is already in the zones. Today's 13 road cards read the same both ways except one: the peddler's warning about the men at the bridge gains `unless` on the bridge's deeds, because after run 1 it is stale.
- Fenn's three (sketches; the full text, the five tests and the Vera test come in the content PR):
  - *Wet salt* (caravan card, river road): rain comes up the river, and salt melts in its sacks. *Throw your cloaks over the sacks*, *Pull in under the willows*, *Push on through the rain*: a cold night, half a day, or salt lost.
  - *Salt on credit* (caravan card, slope track): a woman from the farm under the ridge, Col and Dunn's farm, stops the wagon for a winter's salt she cannot pay for, and Fenn won't give credit to a farm with no flock. *Pay for her salt yourselves*, *Talk Fenn round* (Persuasion), *Walk on*. If the brothers died at the bridge she is in black, and Fenn knows why. *Gwyn's news* at the Highsteads reads what the Blades did.
  - *Men at the iron* (Blade card, night): two men with a handcart at the iron bars in the dark. *Go at them* (a fight), *Shout and wake the wagon* (Intimidation), *Let them go and track them at first light* (Survival, and a deed a later card reads).
- Odda's one, in *Fair in Wend*'s deck: *The meadow track* (caravan card, river road). Odda wants to cut across the water meadows and beat Rufus to the fair by half a day. *Take the meadow track* (Survival against the terrain's Navigation DC; a failure loses the half day and more), *Keep to the river road* (Rufus gets ahead: a deed his cards read).
- *The bridge again* (world deck, `millbeck` zone, caravan card, `if: crossed_millbeck`, which every choice of the Millbeck bridge also writes). The bridge is a fixed stop both ways, and its card is gone for the world (Q1), so the way back needs one card there, with two or three choices for each outcome of run 1. Fought: an empty hut, a cold fire, and Osric's man on the bridge. Spared: the bridge is free and the willow hut stands empty. Paid or forded: the brothers are still there, with one of Rufus's drovers now, and they know this escort pays: *Pay again*, *Stand on the bridge and say no* (a fight if they don't back down), *Ford the beck*. Run 2 gets a pay-off on the road before Wendford, and a second chance at the fight run 1 walked past.
- *Gwyn's news* becomes the way back's arrival card at the Highsteads, the last card of the contract, instead of a Highsteads night card on the next contract.

## Deck engine

All in `crates/nat20-world/src/deck.rs` and the server's card handling; the deck files stay `worlds/<id>/deck/*.json`, plus a pack's own `scenarios/<pack>/deck/*.json`. Today's rule holds everywhere: a card offers 2 or 3 choices, and a deed-dependent choice replaces another, never adds one.

One card, from draw to deed:

1. A leg, a night or an arrival ends.
2. The engine rolls three cards from the pile (three roll ids).
3. The DM picks one and logs why. No pick for a soon card or a pile of one.
4. The card goes on the table, public, as today. If a Blade walks ahead and the card names a `scout` skill, the scout's check comes first, and a success opens the forewarned choice.
5. The seats advise and vote, the human first (decision 0062), and the caller decides.
6. The choice's effects run, with any check or fight through core.
7. A deed is remembered. Later draws and arrivals read it through `if` and `unless`, which takes the loop back to step 2.
8. When the contract is done, the deed is kept for the next contract.

The new parts are the DM's pick and the deed: a choice writes a deed, a later draw or arrival reads it, and the deed outlives the contract.

### Deeds (change 4)

- **New effect** `{"do": "remember", "deed": "<id>"}`. The world stores the deed with `by` (the handles that voted for the choice, or rolled the check it sits under), the day, and the contract it was written in (1, 2, ...). The contract number is what exit row 5 reads.
- **`if` and `unless`** on a card and on a choice: a deed id, or a list that must all hold. A card whose condition fails is not in the pile. A choice whose condition fails is not offered.
- **Validator:** every deed read is written somewhere (a `remember`, or the death deed below); every card offers 2 or 3 choices in every case its conditions allow; a choice reads only deeds the party saw. In Milestone 11 every deed comes from a card the party decided or a fight it fought, so the last rule holds by construction; it guards later sources such as hearsay.

### The death deed

- A `fight` monster may name an NPC: `{"stat": "bandit", "npc": "col"}` beside today's plain stat id.
- When that creature dies (core's death event), the server writes `killed_col` with `by` set to the handle that dealt the last blow. An NPC who leaves the fight alive writes nothing; the card's own choice writes `toll_men_spared` or the like.

### Soon (change 2)

- `add_card` takes `soon: true`. The card joins a queue for its zone, and the next draw there takes it without a roll and without a pick.

### Place cards (change 3)

- `when: arrival`, with a place id as the zone. Drawn when `travel` ends at that place, after the place's scene loads, so the card plays out in that scene. At Saltmouth, an arrival card comes before the journey's last turn and closing narration (B7).

### Draw three, DM picks (change 13)

- `draw` rolls up to three d100s on the pile, without putting a card back between rolls: three roll ids, logged as today's one. The cards are **offered**, not yet on the table, and `travel` and `rest_night` wait while cards are offered, as they wait for a card on the table today.
- The DM calls `pick_card {card, reason}`. The picked card goes on the table (`card_drawn`, public, as today). The other two stay in the pile, not the discard, and a `once` card not picked stays in play. The reason is one line, DM-only, kept in the session log and the run report.
- **No pick:** a soon card; a zone whose pile holds one card (the Millbeck bridge); a pile of two offers two. If the DM does not pick within its wake, the game loop picks the first card rolled and records the pick as the engine's (Q5).

### Scouting ahead (decision 7)

Scout at the draw (Stas, 17:55Z): the scout rolls when the leg's card is drawn, not before the leg, so no card waits hidden and the draw keeps one path.

- New command `scout {actor}`: a Hired Blade (never `dm`, never the NPC owner) takes the head of the caravan. The role stands for every leg until another Blade takes it; one scout at a time.
- When a leg's card is drawn (picked by the DM, a soon card, or a zone's only card such as the Millbeck bridge) and the card names a skill in a new field `scout`, the engine rolls the scout's Wisdom check with that skill through core before the card is shown: `perception` for a creature or a person waiting on the road, `survival` for tracks, a trail or a hazard (the SRD 5.2.1 Search table: Perception finds a concealed creature or object, Survival finds tracks). The DC is the Search DC of the road's terrain (the SRD 5.2.1 Travel Terrain table: 15 for grassland, hill and coast, so 15 on every road in the Wend valley; no `scout_dc` in `map.json`). The caravan keeps its Normal pace, so the check has neither Advantage nor Disadvantage (Q4).
- On a success the card goes on the table with its forewarned choice open: a choice under the condition `if: "scouted"`, which replaces another choice (the 2-or-3 rule). `scouted` is true only for this draw; it is not a deed and is not remembered, so the next draw of the same card is not forewarned by an old scout. A forewarned choice that matters later writes its own deed. On a failure the card goes on the table as written.
- No roll: a card with no `scout` field (nothing to find: a flock, a dog, a friendly peddler), a night card (the watch is the card itself), an arrival card, or a party with no scout.
- The roll is public like any check and comes in the same answer as `card_drawn`, a line before it, so its skill hints at nothing the card does not show at once. The scout changes how the party meets a card, never which card comes: the draw and the pick come first.

### Customs on choices (ENG-39, API-55)

Stas, 2026-11-06 23:00Z, answering the card plan from the storytelling bible: the field now, not with the ethics build.

- A world's `customs.json` lists its peoples' customs by id, each with its `people` and its line. Wend's are Embra's five for the valley folk (`bread_shared`, `debt_paid`, `word_kept`, `no_blood_inside_gate`, `mercy_to_yielded`) plus one each for Saltmouth (`paper_is_law`), the hill bands (`kin_before_strangers`) and the roadfolk (`road_is_free`).
- A card choice may name the customs it `keeps` and `breaks`. The validator refuses an id the world does not list, and a custom named twice on one choice (kept and broken included). A world with no file has no customs, so any tag is refused there.
- The tags are DM-only on the wire (API-55): the DM narrates who reacts, never a verdict. Who saw or heard a deed, and how attitudes move one step, is the ethics build's, after Milestone 11.

## Wire contract and visibility

Every change below goes in Rule 1 order in its own PR: the contract crate, `contract/protocol.md`, a fixture, a `CHANGELOG.md` line, `npm run gen`, then the server. Contract versions start at 1.0.0-dev.59, after the hygiene stack's dev.58.

### Commands

| Command | Who | What |
| --- | --- | --- |
| `pick_card {card, reason}` (new) | DM only | Puts one offered card on the table; `reason` is one line. Refused when nothing is offered or the card is not one of them (new reason `card_not_offered`). |
| `scout {actor}` (new) | a Hired Blade, as itself | Takes the head of the caravan for every leg until another Blade takes it. Refused for `dm`, the NPC owner, in combat, or while a card is offered or on the table. |
| `travel`, `rest_night` | as today | Also wait while cards are offered, with today's waiting-card reason. |
| `new_session {roster}`, `save_roster` | as today | Roster format 2; format 1 is refused with `bad_roster` (protocol §4.15). |

### Events and views

| Field or event | DM | Owner | Other players |
| --- | --- | --- | --- |
| `cards_offered`: the offered cards with text, choices and roll ids | yes | no | no |
| `card_drawn`: how the card came (picked by the DM, by the engine on a timeout, soon, the only card) and the pick's reason | yes | no | no |
| `card_drawn`: text and choices, as today | yes | yes | yes |
| `deed_remembered`: deed, `by`, day, contract | yes | no | no |
| `WorldDm.deeds`, `WorldDm.offered` | yes | no | no |
| who walks ahead as the scout, in the world views | yes | yes | yes |
| a card's `scout` field and its `if: "scouted"` choice before the draw, the scout roll's `against`, and a card's `note` | yes | no | no |

- **Deeds stay DM-only** (Rule 3). Players remember what they did through the story; the word "deed", its id and its bookkeeping never reach a player view, a player prompt or the TUI.
- **The pick stays DM-only.** Players never learn that two other cards were rolled, so no player can game the pick, and Vera never sees a card she "missed".
- **New fixtures:** a pick (three offered, one picked, two back in the pile), a pick by the engine on a timeout, a scouted card with its forewarned choice and a failed scout, a death deed written in a card fight, a format 1 roster refused, a next contract that keeps the memory.

## Game loop, DM and agents

### The DM's pick

- When `travel` or `rest_night` leaves cards offered, the loop wakes the DM with the offered cards, the deeds in its view and the pick rule; the DM answers with a `pick_card` tool call. That is one more DM call per draw. If the wake fails or times out, the loop picks the first card rolled and the run report counts it.
- **The pick rule** (decision 12), in the DM prompt: pick the card that continues what the party did; failing that, the clearest problem for the human's character; between two that do equally well, the one that can come to a fight (Q6); never pick to spare the party a fight; say why in one line.
- The scripted DM picks the first card, so scripted runs and fixtures replay byte for byte.

### Story-space in the DM prompt (decision 9)

Five rules, written once in the DM prompt section, English in the source and spoken in the run's language (decision 0038):

1. Open every scene on its problem.
2. Put the human's character in that problem.
3. Treat the players as co-writers: offer, never decide for them.
4. Tie every consequence to a deed or a roll.
5. No "pleasant nothing": a scene that asks nothing of the party is cut short.

The card text rule (decision 11) is the other half: a choice names the action, and the DM tells the outcome only after the engine rolls.

### Scouting at the table

- Before any leg, each AI Blade has a `scout` tool and the human sees *Walk ahead as the scout* in `/options`; the human is offered it first, as on road cards since AGT-87. It is one choice for the road, not one per leg.
- The M9 exit runs show the need: in both, the Blades set an order of march on their own ("Торва впереди", "Брен ... встать впереди неё по дороге к мосту"; Ilsa: "идти рядом с телегой, не впереди"), and Stas twice asked Ilsa what she had noticed. None of it changed anything in the engine; the scout gives that talk an effect.
- The TUI situation panel shows who walks ahead, in English (card 7). On a success the DM opens the card on what the scout saw.

### The run report and the verdict

- **New verdict rows:** `m11-deck` (exit row 2), `m11-thread` (row 3), `m11-memory` (row 5, run 2 only); story-space flags go through the narration judge (row 4), and Stas confirms them as in Milestone 9.
- **The judge's new question:** for each scene opening and each settled card, does the human's character have a problem to act on?
- **The report adds:** every deed (run, day, `by`), every pick with its reason, every pay-off (a draw or arrival that read a deed), the draw-three counts, every fight, every scout roll and whether the forewarned choice was taken, and up to two cards the DM suggests after the run (decision 4), in the deck file format but not loaded.
- **Built (AGT-91):** the session log names every card that goes on the table in a DM-only `card_shown{card, zone, when, reads, forewarned}` (contract 1.0.0-dev.66), because a pile of one logs no `card_picked` and the public `card_drawn` has no card id. `reads` is the remembered deeds the card's `if`, or an offered choice's `if`, names; `OfferedCard.reads` carries the same, so the DM's pick sees which card continues the party's deeds rather than guessing it. The verdict's rows are `m11-deck`, `m11-thread`, `m11-story` (the judge's `story_space` flags, asked only of a living-world run) and `m11-memory` (gating only on a run that continues a roster; a card that reads a deed this run's log did not write is the world remembering). The report's "Word on the road" section lists the rest. The DM's suggestions come from one last DM wake (`suggest`) once a journey ends in play: its final answer is JSON, kept in `suggested-cards.json` and never loaded; a failed wake counts no fallback.

## Content

The deck doc names 23 cards. Milestone 11 builds 22 of them; Tobin's fortune waits, because it needs foretell for the DM alone (change 6), which is out. It adds seven the doc does not have: two small Wendford arrival cards for the paid and the forded bridge, so that every outcome of the Millbeck bridge pays off on the next contract (exit row 5); *The bridge again* for the way back's stop at the bridge; and the merchants' four, Fenn's three and Odda's one, which ride in their packs' decks (see The Way Back). 29 cards in all, plus the second pack.

| Group | Cards | Needs |
| --- | --- | --- |
| Road and night, today's engine | *The yellow wagon*, *The barefoot pilgrim*, *The old company* | content only |
| Road and night, with deeds or soon | *The roadfolk fire*, *The boy on the tailboard*, *Bel's question*, *Missing sack*, *The bog-wife's toll*, *Lame horse*, *Sedge's jar*, *What the pilgrim drew*, *Rufus's offer* | deeds, soon |
| Chain D (Hungry hills) | *The Millbeck bridge* (shipped in table #282; gains `unless: toll_men_fought` and a forewarned choice), *The peddler's mark*, *Word from the bridge*, *The toll-man in the stocks*, *Gwyn's news* | deeds, soon, place cards, the death deed, memory across contracts |
| Arrivals | *The boy's story*, *Tobin's hands*, *Rufus wants his due*, *Odda's mark*, *The loaf at the sea*, and the two new Wendford arrivals (bridge paid, bridge forded) | place cards, deeds |
| The way back and the merchants | The Way Back pack (campaign.json, Fenn, four scenes and their prose); *Wet salt*, *Salt on credit*, *Men at the iron* (Fenn's, in The Way Back's deck); *The meadow track* (Odda's, in Fair in Wend's deck); *The bridge again* (world deck) | pack decks, deeds, memory across contracts |

- **Scout fields.** A card with something to find names its skill in `scout` and has one forewarned choice under `if: "scouted"` that replaces one of its choices; a card with nothing to find has neither. In the M9 runs 8 of the 14 leg cards drawn had something to find (the Millbeck bridge, the goblins on the ridge and the peddler's warning of men in the willows for Perception; the mud and the landslide for Survival); the flock, the sheepdog and the peddler himself had nothing.
- **The five card tests.** The validator checks the two that code can check: no two choices of a card alike (their effects differ), and every choice changes something later (it has an effect or writes a deed). The other three (someone wants something, the stake is visible, the text names the action and not the outcome) are checked in review: each content PR lists every card it adds against the five tests, and the judge's story-space question catches the rest in play. On fights the validator only warns (Q6, a recommendation): a route that meets fewer than two cards with a choice that can come to a fight is named in its output, and the build stays green.
- **The cast's Russian names** (Tobin, Bel and Tam Corrin, Mother Sedge, Rufus, Sister Agna, Col, Dunn, Fenn Lusk) go into the Russian glossary that the hygiene stack added (AGT-85), with their declined forms, so the DM and the players never improvise them.
- **One anachronism each**, as the deck doc lists them, in a new optional card field `note` that only the DM sees, so the DM voices it at every meeting.
- **The roadfolk rule holds:** no card makes the roadfolk the culprit.
- **The Vera test** runs on every new card's text and choices in its content PR (CLAUDE.md, required).

## Phases and rows

The rows are in `TASKS.md` § Milestones, row 11 (the project copy is the live one until CON-1 moves the task list into this repo). Sizes are guesses.

| Phase | Row | What | Size |
| --- | --- | --- | --- |
| 0. Docs | CON-18 | This design, the scope section §8, decision 0063, the Milestone 11 line in CLAUDE.md | S |
| 1. World crate | ENG-33 | Deeds: `remember`, `if` and `unless`, the deed record (`by`, day, contract), the validator | S–M |
| 1 | ENG-34 | Soon: `add_card` with `soon: true` | S |
| 1 | ENG-35 | Place cards: `when: arrival` | S |
| 1 | ENG-36 | The death deed: a fight monster may name an NPC; its death writes `killed_<npc>` with `by` | S |
| 1 | ENG-37 | Memory across contracts: the state split, the next contract's start, `once` for the world | M |
| 1 | ENG-38 | Pack decks: a pack's own deck folder joins the world's deck while its contract runs; card ids unique across the world and its packs; a roster under way refuses another pack | S |
| 1b | ENG-39 | Customs on choices: the world's `customs.json`, `keeps` and `breaks` on a choice, the validator | S |
| 2. Contract and server | API-51 | Roster format 2 (format 1 refused); the world at the contract's start kept beside the world now, and the start question's third answer, *play the last contract again* (the TUI line and the unattended flag) | S–M |
| 2 | API-52 | Deeds on the wire: `deed_remembered`, `WorldDm.deeds` | S |
| 2 | API-53 | Draw three: `cards_offered`, `WorldDm.offered`, `pick_card`, the card's `note` | M |
| 2 | API-54 | Scouting at the draw: `scout` (who walks ahead), the card's `scout` skill, the SRD Search DC by terrain, the roll before `card_drawn`, the draw-only `scouted` condition | S |
| 2b | API-55 | Customs on the wire, DM only: a choice's `keeps` and `breaks` in the DM's card views | S |
| 3. Table | AGT-88 | The DM's pick: the wake, the tool, the pick rule, the scripted and the timeout pick | S–M |
| 3 | AGT-89 | The five story-space rules in the DM prompt | S |
| 3 | AGT-90 | Scouting at the table: the AI tool, *Walk ahead as the scout* in `/options`, who walks ahead in the situation panel | S |
| 3 | AGT-91 | Run report and verdict: `m11-*` rows, the judge's question, deeds, picks, pay-offs, counts, fights, suggested cards | M |
| 4. Content | MAP-10 | 30 cards: 22 from the deck doc, two new Wendford arrivals, *The bridge again*, the merchants' four and *The fair price*; every choice tagged with its customs; chain D, the cast's notes and Russian names; one PR per group | L |
| 4 | MAP-11 | The validator's static card tests: two of the five tests, a `scout` field only with an `if: "scouted"` choice and the other way round, and a warning for a route with fewer than two fight cards | S |
| 4 | MAP-12 | The Way Back pack: campaign.json (route, Fenn's wagon and cargo, escort), Fenn's prose and Russian names, four scenes and their prose, the README | M |
| 5. Exit | AGT-92 | The exit pair (card 3): *Fair in Wend*, then *The Way Back* on the same roster | S |

- **Order.** Phase 1 first, because the server builds on the world crate. Content can start once ENG-33 to ENG-35 are up, in parallel with phases 2 and 3.
- **One stack, merged after the exit pair,** as in Milestone 9 (decision 0060): the exit runs play the stack's head, and the stack merges bottom-up once they pass. This docs PR (CON-18) is the exception: it merges on its own, so the rows and the design are on `main` before code starts.

## Decisions in this design

Q1 to Q7 were decided by Stas on 6 November: his cards, his message of 16:44Z for Q2 and Q6, 17:09Z for Q6 as a recommendation, and "Ок" at 17:16Z for Q7 and the whole design. They are recorded in decision 0063.

| # | Question | Decided | Rejected, and why |
| --- | --- | --- | --- |
| Q1 | How long does a `once` card stay gone? | For the world; `once: "contract"` for a card that should come back each contract | For the contract only: the dead toll men would be back at the bridge on the next contract |
| Q2 | Where and when does the next contract start? | (16:44Z) Play the way back as a pack of its own, *The Way Back*, with a new merchant, Fenn; the clock carries on from the saved day; a party somewhere else travels to the pack's start in one line | Odda's start place again, with the way back told in one line: the party never sees the road home, and run 2 replays run 1's road. Clock reset to day 1: deed days would lie |
| Q3 | Build variants (change 5)? | No; per-case choices with `if` and `unless` do it inside the 2-or-3 rule | Variants too: small after deeds, but a second way to write the same thing |
| Q4 | What check does scouting take? | (17:04Z, refined 17:55Z) By the card ahead (SRD 5.2.1 Search table): Wisdom (Perception) for a creature or a person, Wisdom (Survival) for tracks, a trail or a hazard; DC = the Search DC of the road's terrain (15 on every Wend road); Normal pace, so no Advantage; no time cost. Rolled at the draw: one Blade walks ahead as a standing role, the check comes when the leg's card is drawn, and a success opens the card's forewarned choice | Scout before the leg and show the card early: a hidden queue and a second pick path (Copilot on table #298) for little gain, since the party talks a card over before deciding it anyway. The player picks how to scout, and a wrong pick finds nothing: true to the SRD, but a hidden guess for Vera. Always Survival: the SRD gives creatures to Perception. A group check: the whole party cannot ride ahead and guard the cart |
| Q5 | What if the DM does not pick? | The engine takes the first card rolled, and the report counts it | A random one of the three: hides a broken DM wake. Fail the run: one slow wake should not cost a two-hour run |
| Q6 | Keep Milestone 9's fight row? | (16:44Z and 17:09Z) More fights, as a recommendation, not a gate: no exit row; the pick rule prefers a fight card on a tie; the validator warns on a route with fewer than two fight cards; the report counts every fight | A gate, one card fight in each run: too strict, Stas does not want to control it. Drop fights from the design and only report them: Stas wants more fights, not fewer |
| Q7 | Where do the merchants' own cards live? | (17:16Z) In the merchant's pack, `scenarios/<pack>/deck/`, joining the world's deck while that pack's contract runs: three for Fenn, one for Odda | An owner field on cards in the world deck: works, but puts each pack's people into the shared deck. Cards by direction, up or down: the direction is already in the zones, and the merchant is the one who wants something |

## Risks, without sugar

- **The DM picks the mildest card every time.** The DM on `play:unattended` runs at low effort: cheap, not wise. The draw-three counts show it after run 1; the fallback is the deck doc's weighted draw.
- **Content is the bottleneck.** 29 cards and a second pack (four scenes, a new merchant) with Russian names, notes and the five tests is the largest content push yet, and each needs Stas's read. One PR per group keeps each read under half an hour; the way back is its own PR.
- **Waits get longer.** The talk round p95 was already 45.5 s; a pick adds one DM call per draw; scouting adds one choice for the road (who walks ahead), not a decision per leg. Reported, not gated; Vera feels it first.
- **Scouting pays rarely.** At DC 15 the party's best Wisdom (Perception) bonus, +4 (Maren), succeeds half the time, and the human's Fighter at +2 two times in five. With 8 of 14 leg cards worth scouting in the M9 runs (1.6 a run), that is about two forewarned cards in three runs. The run report counts scout rolls, successes and forewarned choices taken; if it proves too rare, the SRD's Help (a second Blade gives Advantage) is the first lever, not a lower DC.
- **Run 2 depends on run 1.** A failed run 2 has to replay from the world run 1 left, so the question the TUI already asks at the start of a session (continue the saved party, or a new party) gains a third answer when the saved world has a contract: *play the last contract again from its start*. For that, roster format 2 keeps the world as it stood when the contract began beside the world as it is now; an unattended run takes the same choice as a flag. `run.json` records which answer the run took, and the hash chain shows the file. Enter still means continue, so nobody starts over by accident, and the new line gets a Vera test.
- **Exit row 5 could miss by chance.** It should not: the Millbeck bridge is a fixed stop both ways, so every bridge choice in run 1 writes a deed, and run 2 reads it three times by construction: *The bridge again* on the road, a Wendford arrival that night, and *Gwyn's news* at the Highsteads. That proves the machinery end to end; whether the story is good is row 4's job.
- **The name promises hearsay.** "Word on the road" ships without hearsay (change 7); in Milestone 11 the word travels as arrival cards that read deeds. Hearsay comes when this cut has been played.

## The Vera test

Would Vera get through Milestone 11 alone? Mostly yes, and it is better for her than Milestone 9.

- **Better:** the road answers what she did. The boy she let ride comes back with a story; the men she spared at the bridge are in the stocks when she passes Wendford. That is the legible story she reads novels for, and it has no numbers in it. The way back makes it plainer still: she climbs back past the people the road down left behind, and only one face, Fenn's, is new.
- **Better:** *Walk ahead as the scout* gives her a role on the road, chosen once, so she is not a passenger; when it pays, the card opens on what her character saw. Since AGT-87 she also votes first on a road card, before the AI Blades talk her out of it.
- **Neutral:** she never sees the pick or a deed. Nothing new to learn, and nothing to feel she missed.
- **Worse:** longer waits (one more DM call per card), and English lines in the TUI around Russian prose (card 7). Neither stops her; both add friction.
- **Risk:** a new party at Milestone 11 (card 4) is no loss to her, since she has no saved party yet. Once she has one, a roster format change that throws her party away is a quit, so the next format change after Milestone 11 needs a converter.

This section is the design-level question, Claude's read of it. The Vera test itself runs in the `vera` subagent on player-facing text only (CLAUDE.md), at three points: in each content PR on the new card text and choices (required), in the PRs that add TUI lines (*Walk ahead as the scout*, the old-roster refusal, the start question's third answer), and on a narration sample from each exit run (exit row 4).

Stas decides.
