# The Godmother (the lair under the Barrow Oak): system design

Status: Proposed. Lev Neiman, 2026-11-24, branch `claude/project-thread-4t5v2z` at c617f9c (table #492). Scope: `docs/scope/the-godmother-scope.md`, §9 answered by Stas in its §10. It answers the twelve questions of the scope's §6 by number (§3). Three Proposed records carry the choices with real alternatives: 0095 (arrival in file order), 0096 (a scene's card in a site pack), 0097 (held creatures lost by the round). Author's read: no verdict on itself. Zoya's board check and Vera's read of §11 were made on 2026-11-24 and are quoted in §17 (decision 0069); Lev has not answered them or the review findings in §17.4, so §1 to §16 stand as he wrote them.

Naming (Stas, 2026-11-23): the hill folk call the spider the Godmother («Крёстная»), which is also the pack's name; the pack id is `the_godmother` and her handle in a scene is `godmother`. Her true name, Arachta («Арахта»), is the Narrator's, and only Nell says it; no mechanism reads it. She is a beast: she never speaks and never yields. The map's `pack_slot` for `barrow_oak` (`lair_of_arachas` in `worlds/wend/map.json`) and the assertion in `crates/nat20-world/tests/worlds.rs` are renamed in the first content PR (§13 PR 11).

## 1. Summary

A party that has a history in Wend walks into six scenes that know it: who stands at the well, who sells the back way, who is left at the Bald Hill farm depend on deeds the world already holds. Under the oak, children hang in the Godmother's web and one is lost at the end of each round while she stands; the engine counts them. At dawn the seats decide what happens to Nell Hale on a card, and on the next contract Wendford meets the party with that decision before any other business.

The retelling: "We cut two of the children out of the web and could not get to the third. At dawn I said where the reeve's niece goes, and a contract later Wendford had something to say about it."

The question the mechanism puts to the player, every turn of fight 2: this turn, a child or the spider?

One new system: a scene reads a deed (§4). Beside it, a rule change at arrivals (§5.1) and one block in a fight (§6).

Said early, to Stas: the scope counts two mechanisms, and its item 7 needs a third piece of engine work it does not count. No card can reach the table in a pack with no campaign today, so "the decision about Nell is a deck card" is the largest engine PR of the milestone (§5.2, decision 0096). What it buys the player: the decision is made at dawn, by the seats, in the pack. The cut, if it is too much: the decision moves to a Wendford card on the next contract (0096 option C), and the dawn scene ends without it.

## 2. Records

| Record | Who writes | When | Who reads | Where the player sees it |
| --- | --- | --- | --- | --- |
| The 24 older deeds of scope §2 item 2 | already written on main (the Mill, the road decks) | earlier contracts | a scene's `reads` (§4), once, when the scene loads | a person who is or is not there; one sentence from the DM that names the cause (§4.4) |
| `hesta_known` | the engine, a scene 1 check's `remember` (M13) | on a success | scene 3: who leads fight 1; scene 4: which promise card comes | a neighbour leads on Bald Hill, and the captive is that neighbour |
| `party_ambushes` (a flag, not a deed) | a scene 2 check | on a success | fight 1's surprise rule | the cult is surprised |
| S2 card deeds: `cut_the_ewe_loose`, `back_way`, one for going round | the engine, the card's `remember` (§5.2) | when the scene 2 card is decided | scene 3: the surprise rule is off after `cut_the_ewe_loose`; scene 5: `back_way` keeps the two extra spiders out | fight 1 opens with the cult ready; no second wave under the oak |
| Fight 1's outcome: `bald_hill_yielded` or `bald_hill_to_the_end`; `killed_<Hesta's id>` | the engine, `on_end` and the death rule (M13) | at `combat_over`, party winning; at her death | scene 4's cards (`if: bald_hill_yielded`); scene 6 | there is a captive to promise to, or there is not |
| The promise (one deed per choice), `nell_doubts`, `signal_fire_lit` | the engine, the scene 4 card's `remember` and its check | when the card is decided | scene 5: a spawn reads `signal_fire_lit`; scene 6 reads the promise against the sleepers' outcome; the scene 6 card has a choice `if: nell_doubts` | two more spiders in round 3; the captive at the fold gate, kept or broken faith with |
| Fight 2's outcome: `nell_yielded` or `roots_to_the_end`; `killed_nell_hale` | the engine, `on_end` and the death rule | at `combat_over`, party winning; at her death | scene 6's card (`if: nell_yielded`); `the_fair_price` (`unless: nell_yielded`, and rule A8 when she is dead) | the decision card comes, or Osric rides up to a dead niece; Nell is never back at the well |
| The sleepers: `all_sleepers_woke` or `a_sleeper_did_not_wake`, and one deed for each sleeper lost | the engine's count (§6) | at `combat_over` of fight 2, party winning | scene 6: which children and which parents stand at the fold gate | `held_lost` in the fight, as it happens; the dawn |
| The decision about Nell: one of `nell_sent_to_the_reeve`, `let_nell_go`, `nell_given_to_the_shrine` | the engine, the scene 6 card's `remember` | when the card is decided | three Wendford arrival cards, one a deed, first in their pile (§5.1) | the first card at Wendford on the next contract |
| A named person dead in a site session | the engine, into the site memory's people | at the death | rule A8 (a card with a dead person in its cast never comes); «Люди» on the next contract | `the_fair_price` does not come |

The deed ids above are working ids. Zoya may rename any of them until the pack PR opens; after it merges an id is fixed.

Not kept: who saw a deed; the round a sleeper was lost in; a marker for the Godmother's death (the concept dropped it and nothing here needs it: the two outcomes of fight 2 already say the fight was won); anything about the Hollow King.

The count, said plainly: the pack reads 24 older deeds and writes about 20 of its own in six scenes. My read is that this is more than a table can feel in 95 minutes (§16 item 8).

## 3. The scope's questions, by number

1. **What `if` on a scene adds to the wire.** The card's own two names with the card's own meaning (all of `if`, none of `unless`), on a new list `reads` in the scene file, and one optional field `read` on a creature, a spawn and a surprise rule (§4, §8). Additive on the wire; the scene schema and the schema hash change. No command changes; one DM-only event is added.
2. **The promise in scene 4.** A card (§5.2). The seats' word picks the promise and writes its deed; a check under the choice rolls, and its two outcomes write `nell_doubts` or `signal_fire_lit`. A scenario check alone would leave "which promise" to the DM's reading of the table.
3. **Sleepers.** Creatures that cannot act: neutral scene creatures outside the encounter, held Restrained by the Godmother's own web from the scene's load. Cut loose: one attack against the web that holds the sleeper, the same act that frees a webbed friend in fight 1. Lost: by the round, one at the end of each round from a round the scene names, while the Godmother is conscious (§6, decision 0097). A player view shows a cocoon as a named creature with a position, a health band and the Restrained condition; never the round, the order or who is next.
4. **Fight 2.** The round-3 arrival needs no flag gate and no new spawn kind: the existing `round` spawn carries a `read` (`if: signal_fire_lit`, `unless: back_way`). `standing_at_most` cannot watch one creature and yield another, because the creatures it counts are the ones that yield. `leader_down` can: the surrender lists all eight hostiles with `any_of: [leader_down {godmother}]`. When it holds she is down, and only the conscious turn neutral, so she never yields. The concept's second trigger, "Nell yields when Bloodied with `nell_doubts`", cannot be built without a new surrender kind, which the scope puts out: a surrender ends the whole fight (§16 item 5).
5. **Web in core.** Core work in the fork (Rule 6). The stat blocks are registry JSON. The Restrained effect is not in core's registries at ea7eaef: I found the word only in the SRD rule text file, so it is part of this work, against the brief's checked fact (§16 item 10). A web that holds a creature until it is destroyed, with its own Armor Class and Hit Points, is probably code; it is destroyed by damage to the web, as the stat block says. I could not read the SRD 5.2.1 block here (§14). Recommended for core: the web is a thing in the fight that can be attacked, so the table attacks it like any target.
6. **The Bald Hill farm.** Four states, four reads, no scene variant file. Both brothers alive: prose only (they are witnesses). Both dead: prose only. Col dead, or Dunn dead: the survivor stands in one Cultist's place, with his `npc`, so his death is recorded. One slot, four creature entries, at most one present; a test holds fight 1 at seven hostiles and 575 XP under each state. `col_owes_blades` is one more read, prose only. «Камень A» adds a fifth read as one line and one id in the other four's `unless`.
7. **Level 3 pregens.** Data files, built by the engine's own level-up: each `pregens/<id>_l3.json` is the level 2 file with `level: 3` and the level 3 picks its `recommended` already names. A test levels each `_l2` file through `level_up` and compares it with its `_l3`. Nothing is written by hand. The offer is the game's (§7).
8. **Which records outlive the contract.** Every deed does, mechanically. Meant for later readers: the decision about Nell, `nell_yielded` or `roots_to_the_end`, `killed_nell_hale`, the two sleeper outcomes, fight 1's outcome, Hesta's death. Read only inside the pack: `hesta_known`, the scene 2 deeds, the promise, `nell_doubts`, `signal_fire_lit`, the deed of each lost sleeper. `party_ambushes` is a flag and ends with the session. A second play of the pack on the same world is out: the world keeps first outcomes, and the reads would see the first play.
9. **Nell after the pack.** Dead: rule A8 takes `the_fair_price` out, once a site session marks a named dead person in the world's memory (§5.2 rule 9). The lost card is the consequence, as the scope's question allows. Alive: all three decisions take her from the well, so `the_fair_price` gains `unless: nell_yielded`. Her record's `monster` and `attitude` do not change: the attitude step is out of scope. What stands at the well afterwards is Zoya's content, on carriers that exist (a card with `if: nell_yielded`, a card with `if: killed_nell_hale`). A world where the pack was begun and not won keeps the old card (§16 item 9).
10. **The roster for the exit pair.** Stas's own latest Wend roster, if it reads on the exit build and holds at least one Mill deed and one road deed; both halves start from copies of it. Fallback: a roster made on the exit build by a scripted, seeded run with no model. A level 3 pregen keeps its character's handle, so a deed's `by` names the same person before and after (§16 item 7).
11. **Fight 2 and the sleeper deed.** The count writes only at fight 2's end with the party the winner. A lost fight writes neither deed and scene 6 is not played. The chamber has no way on but through the fight; that is a content rule the skeleton holds and Zoya's read checks, not something `pack:check` can see. A scene that reads neither sleeper deed tells nothing about the children.
12. **Arrival without a draw.** Decision 0095 and §5.1: at an arrival the first eligible card of the place's pile, in file order, goes on the table. It replaces the d100 a card, the offer of three and the DM's pick, at arrivals only; 0063 and 0089 stand for road and night piles. Real competitors exist only at Saltmouth (seven cards, five independent conditions). Wendford holds seven of which at most three hold together; Highsteads and the Millbeck bridge hold one.

## 4. A scene reads a deed (the one new system)

### 4.1 What it is

A scene file names its reads. Each read is an id with the deeds it needs and the deeds that cancel it. Three kinds of thing in the scene may name one read and are in the scene only when it holds. The pack's skeleton gives each read one line for the DM.

```json
"reads": [
  { "id": "wenna_lived", "if": ["wenna_saved"] },
  { "id": "fire_seen",   "if": ["signal_fire_lit"], "unless": ["back_way"] }
],
"creatures": [ { "handle": "wenna", "read": "wenna_lived" } ],
"spawns":    [ { "when": { "kind": "round", "round": 3 }, "read": "fire_seen" } ]
```

and in `adventure.json`, under the same scene:

```json
"reads": [ { "read": "wenna_lived", "tell": "Wenna Thorne is at the ford because the company brought her out of the mill cellar alive. She says so." } ]
```

(The `tell` above shows the shape. Every real line is Zoya's.)

### 4.2 Rules (each a test could check)

1. A read holds when every deed in `if` is in the world's deed book and none in `unless` is. Both are always lists.
2. Reads are evaluated once, when the scene loads, and do not change while the scene is loaded. A deed written inside a scene is read by a later scene.
3. A creature, a spawn or a surprise rule that names a read is in the scene only when the read holds. An element with no `read` is always in. One element names one read.
4. A creature left out is left out wherever its handle is named (an encounter's `creatures`, a surrender's list, `yielded`), by the rule scenes with `party_start` already follow. Handles stay unique across the file.
5. With no world (a session with no site and no campaign) a read with a non-empty `if` never holds and a read with only `unless` holds. The base scene plays. This is exit row 3's "with no deed the scene still plays".
6. Right after `scene_loaded` the engine logs `scene_read`, DM only: the ids that hold, and the deeds they read with `by`, day and contract.
7. The game hands the DM the `tell` of every read that holds, in file order. A read that selects a creature, a spawn or a surprise rule is always told. Of the reads that select nothing, the first three are told; the rest are handed over marked "held, not told". The run report counts both.
8. A deed counts as read by a scene only where a read names it in `if` (the meaning rule A9 gives a card). A deed named only in `unless` is a gate.
9. `pack:check`: every read in a scene file has a `tell` in the skeleton and the reverse; every read id an element names exists; every deed a read names is written by some pack or deck on the map (the validator across packs, M13 design §4.2 rule 8, extended to scenes); every deed the pack writes is read in the pack or by a shipped card.
10. A scene reads deeds only. Flags keep their one job: `party_ambushes` is set by a scenario check and read by `surprise.when_flag`, as in the Mill.

### 4.3 What it is used for in this pack

- **A person is there or not.** Wenna at the ford (`wenna_saved`). Snitt on the slope or an unnamed kinsman in his place (`snitt_yielded`, `yard_to_the_end`). Hesta or a neighbour leading fight 1 (`hesta_known`). The surviving brother in a Cultist's place (§3 question 6). The captive, the children and their parents at the fold gate.
- **A spawn comes or not.** The two Giant Wolf Spiders of round 3.
- **A surprise rule holds or not.** Fight 1's rule carries a read with `unless: cut_the_ewe_loose`: a party that cut the ewe out loudly cannot surprise the hill, whatever its check said.
- **A line for the DM.** Everything else in scope §2 item 2: Osric's account of what the company answered him, Gwyn believed at last, the cairn, the salt, what Nell remembers of the company at the well.

### 4.4 What the DM says

The `tell` is a sentence the DM can say or turn, written by the pack's author, and it names the cause: who did what, and when. The DM is never asked to recall a deed: it gets the sentence, with the deed's `by` and day beside it. The narration judge gets the same list. Proposed as a design item for the judge: a check `read_untold`, flagged when a read handed over as told does not appear in the scene's narration.

### 4.5 Not built

- Reads of flags, and conditions re-evaluated inside a scene.
- A whole scene file chosen by a deed. Three element kinds cover every use the concept has, and one file a scene keeps `pack:check` and the fixtures simple.
- A read on an encounter, a check, an exit or a map. No use in this pack.
- Variants of a card's text. A card that needs a different text is a different card (§5.1).
- "Any of" in a read. The farm's Cultist slot pays for that with two entries (§3 question 6); a second pack that pays it again is the signal.

## 5. A card without a draw

### 5.1 At an arrival (decision 0095)

Rules:

1. At an arrival the engine puts the first card of the place's arrival pile on the table, in file order: the world's deck files by name, then the pack's deck. No d100, no offer, no DM pick. A card in the `soon` queue still comes first.
2. Road and night piles are drawn as today.
3. In every shipped arrival pile, a card with no `if` comes after every card with one (a test on the decks, no model).
4. The Wendford reader of the decision about Nell is three cards, one for each decision deed, each `once: true`, written first in `worlds/wend/deck/wendford.json`. They exclude each other, so the pile's head is the one the party earned. Three cards and not one, because a card's text has no variants and the text must name the cause.

Cost, said once: at Saltmouth the author's order replaces the DM's judgement, and "a fight card first" (0089) holds there only if the file is written that way. Every seeded fixture with an arrival draw is re-recorded, because the d100 leaves the dice stream.

The existing `soon` queue could have made this one reader certain without a rule change. Stas chose the arrival rule (scope §10 answer 1); it also frees the sixteen arrival cards that already carry an `if` from the roll.

### 5.2 In a scene of a site pack (decision 0096)

Rules:

1. A scene file may list card ids in `cards`. Only a site session accepts it; anywhere else it is `bad_scene`.
2. When the scene loads, after `scene_loaded` and `scene_read`, the first listed card whose own `if` and `unless` hold, which is not gone and has no dead person in its cast, goes on the table: `card_shown` (with the deeds it reads), then `card_drawn`. If none holds, the scene loads with no card.
3. The card is an ordinary card in the pack's own `deck/`: its zone is the site's place, `when: arrival`, `chained: true` (nothing ever adds it, so no pile holds it), `once: true`, `target: blades`.
4. Its effects may only `remember`, `check` and `pay`. Any other effect is `bad_scene`.
5. A scene that lists cards declares no encounter.
6. The seats answer with `choose_card` and `own_move` as on the road. The Blades are the party members in the scene who are up. The human gives his word first (0062). A tied vote goes to the human, whom `new_session` now names.
7. While the card waits, `load_scene` is rejected with `card_pending`.
8. State gains `scene_card`: the DM's view of the card for the DM, the player's view for the others. `world` stays a campaign's.
9. A scene creature whose `npc` names a roster person and who dies in a site session is marked dead in the site memory's people, so rule A8 and «Люди» hold on the next contract.

Uses: scene 2 (the ewe, going round, or the back way for coin: two cards, the dearer one with `unless: snitt_yielded`); scene 4 (the promise: two cards, to Hesta or to the neighbour, both `if: bald_hill_yielded`); scene 6 (the decision: `if: nell_yielded`, cast Osric and Nell).

What the bench cannot do: the card bench (0084) draws a pile of one in a copied campaign pack and never reaches a chained card. A scene card is tried by a fixture with no model and by `play:scene` on its scene.

Not built: a pile in a site session, a draw in a scene, people views (`world.npcs`, the `remembers` lines of 0077) in a site session. Those belong to the registries milestone.

## 6. The held and the count (decision 0097)

Rules:

1. A scene creature may carry `held_by` naming another creature of the scene. It starts Restrained by that creature's web, with no save, when the scene loads.
2. An encounter may carry one `held` block: the held creatures in order, the holder, the round the count starts from, the two outcome deeds, and optionally one deed for each held creature.
3. At the end of round `from_round` and of each round after it, while the holder is conscious, the first held creature in the list that is still Restrained by the web and not yet lost is lost: the engine logs `held_lost`, public.
4. A held creature whose web is destroyed is safe from then on. A creature already lost stays lost if its web is cut later.
5. When the holder is not conscious the count stops and does not start again.
6. Cutting loose is the stat block's own rule: damage to the web that holds the creature. It is an attack and costs what an attack costs.
7. At `combat_over` with the party the winner the engine writes one outcome deed: `not_all` if any held creature is lost or dead, else `all_free`; and the own deed of each held creature that is lost or dead. `by` is the party-side participants, as for any fight-end deed. A fight the party loses writes none.
8. The engine changes nothing on a lost creature: no damage, no condition. The loss is a record. What "does not wake" is in the fiction is the pack's prose (decision 0070; Vera reads it, exit row 5).
9. The DM's view of the encounter shows who is next and at the end of which round. The scene's DM note carries one authored line that tells the table the children are going, said when the fight opens. A cost may land in round 3, but the table must hear the stake in round 1.

The scope's constraint holds by construction: a surrender needs the Godmother down, which has already stopped the count, and nobody is lost before the end of round `from_round`. The proposal is 3; a seeded table sets it (§14).

Rejected: the concept's rule (still in a cocoon when the fight ends). It makes winning the moment of loss, and a party learns to leave one enemy alive and cut at leisure.

## 7. Core and the pregens

**Core (two PRs into `demo`, then the pin).** Giant Spider, Giant Wolf Spider, Cultist, Cultist Fanatic; the Restrained effect; the web; each Fanatic spell core lacks. Each PR's description quotes the SRD 5.2.1 block and says, trait by trait, built or left out and why (the Demo Run's out-of-scope list still stands: no vision, no Hide). Each block has a test in `core/tests/` against its numbers (exit row 9).

**Fights, as data.**

| Fight | Surrender | `on_end`, in order | Named |
| --- | --- | --- | --- |
| 1, Bald Hill | all seven hostiles listed; `standing_at_most: 2` | `surrender {yielded: [the people]}` writes `bald_hill_yielded`; `won` writes `bald_hill_to_the_end` | Hesta carries `npc`; the surviving brother carries his |
| 2, the roots | all eight listed; `leader_down {godmother}` | `surrender {yielded: [nell]}` writes `nell_yielded`; `won` writes `roots_to_the_end` | Nell carries `npc: nell_hale`; the `held` block of §6 |

Content rule, checked by `pack:check`: every hostile of an encounter that has a surrender condition is listed in its `creatures`. A hostile left off the list stays hostile after the surrender.

The scope's deed id `killed_nell` becomes `killed_nell_hale`: the death rule builds the id from the person's record id.

**Level 3.** §3 question 7 for the files. The offer is the game's, before `new_session`: when any roster character is below level 3 the table offers the level 3 pregens. On a yes the game sends the roster with those characters left out and the world kept; the pregens take the same handles. On a no the table says the warning once and the pack starts. No contract change. In an unattended run the answer is a run setting, so exit row 7 needs no model.

## 8. Contract

Goals: (a) the DM can always see which reads held and why; (b) no player view gains a deed, a read, a round or an order; (c) a card in a site session looks to a seat exactly like a card on the road; (d) every change is additive, and a scene file written before it loads unchanged.

| Change | Proposed shape | DM | Owner | Others | Kind |
| --- | --- | --- | --- | --- | --- |
| Scene reads | `SceneFile.reads: [{id, if: [deed], unless: [deed]}]`; `read: Option<String>` on `SceneCreature`, a spawn and `Surprise` | scenario data | none | none | additive |
| What held | event `scene_read {scene_id, holds: [id], reads: [DeedDm]}` | yes | no | no | new event kind |
| Arrival order | no shape change; a "Meaning" line in the CHANGELOG, protocol §4.13 | - | - | - | a changed meaning, allowed at `1.0.0-dev` with its line and fixture |
| Scene cards | `SceneFile.cards: [card id]`; `State.scene_card`; `new_session.human: Option<Handle>`; error reason `card_pending` | `CardDm` | `CardPlayer` | `CardPlayer` | additive |
| Held | `SceneCreature.held_by: Option<String>`; `Encounter.held {creatures: [{handle, lost: Option<deed>}], holder, from_round, all_free, not_all}`; the DM's encounter view gains `held {next, at_round_end, lost}` | scenario data and the view | none | none | additive |
| A loss | event `held_lost {handle}` | yes | yes | yes | new event kind, public |
| The web | waits on core. If the web is a thing in the fight it gets a handle and a view row: players see its name and health band, never its Armor Class or Hit Points | full | - | band only | additive |

Each change takes the next free version after `1.0.0-dev.80`, in its own PR, in Rule 1 order. `held_lost` carries a handle and nothing else: it is a fact of the fiction, like a death, and reveals no number. The visibility table gains a row for every line above. I do not edit the contract; the implementing thread does.

## 9. Carrier for each owed row

No board was given with this ask. Scope §2 item 2 and the debts of the M13 design §12 stand in for it; Zoya's board check may add rows.

| Owed | Carrier | Kind |
| --- | --- | --- |
| `wenna_saved` | scene 1: a creature read | person |
| `snitt_yielded`, `yard_to_the_end` | scene 2: two creature reads; which scene 2 card comes | person, card |
| The six Wendford answer deeds (owed since M13 §12 item 3) | scene 1, Osric; `named_self_for_the_goblin` in scene 2 where the concept puts it | line |
| `killed_col`, `killed_dunn` | scene 3: four reads, one creature slot | person, line |
| `col_owes_blades` | scene 3 | line |
| `heard_of_the_low_fires` | scene 2, Gwyn | line |
| `robbed_cairn`, `left_the_cairn_stones` | scene 5 | line |
| `paid_for_the_ridge_salt`, `fenn_gave_credit`, `fenn_said_no` | scene 6, the boy's mother | line |
| `gave_fenns_salt_to_bald_hill`, `passed_the_ridge_farm` | no scene named in the concept; a read in scene 3 fits. Zoya places it | line |
| The four deeds Nell remembers from `the_fair_price` | scene 5, where the party faces her; the `tell` may reuse her record's `remembers` line | line |
| The human makes a deed and meets its reader in one pair (M13 §12 item 6) | scenes 2 and 4: a card the human answers first; read in scenes 3, 5 and 6 | card, then person or spawn |
| The decision about Nell | three Wendford arrival cards (§5.1) | card |
| `killed_nell_hale` on the next contract | the lost card (rule A8). A Wendford card with `if: killed_nell_hale` is Zoya's call (§16 item 9) | - |
| `killed_gritch`, MAP-13's deed, Snitt's fate | no carrier here: out by the scope | - |
| The Hollow King, the lit barrows | no carrier: kept as rumour, by the scope | - |
| «Камень A»'s farm deed | no carrier yet: one read line in scene 3 once the deed has an id | later |

## 10. Failure

- **No world, or a world with none of the deeds.** §4.2 rule 5: the base scene plays, and `scene_read` holds only `unless`-only reads.
- **A read names a deed nobody writes, or an element names a missing read.** `pack:check` fails; the engine answers `bad_scene` for the missing read.
- **A roster whose world does not read, or with a contract under way.** `bad_roster`, as today.
- **No listed scene card is eligible.** The scene loads with no card. In scene 6 that is the dawn with Nell dead or the fight lost: no decision is offered, because there is nobody to decide about.
- **The seats do not answer a scene card.** The road's fallback applies and the log says "fallback"; the exit rows do not count a deed written by a fallback.
- **The DM never calls the surrender in fight 2.** The count has already stopped when the Godmother fell. The party fights on, Nell dies or the fight ends as won, `roots_to_the_end` is written, and the dawn has no decision. The record stays true; the player loses the pack's last choice (§14).
- **A sleeper dies to the party's own spell.** It counts as not woken, and its own deed is written.
- **The party loses fight 2.** No sleeper deed, no scene 6.
- **Core cannot hold a web as a thing with Hit Points.** Then §6 rule 6 has no carrier and the design comes back before the pack is written; that is why the core PR is first.

## 11. Player-facing lines (for Vera, alone)

These five are the engine's and the table's own words. No card text is drafted here: every card and every `tell` is Zoya's.

1. The offer, to a company below level 3.
   - "The road into the hills is harder than any your company has walked. You can go as you are. Or you can start it as the same company with more behind them: your heroes will be stronger and carry new gear, and what they carry now stays behind."
   - "1. Go as we are."
   - "2. Start with more behind us."
   - «Дорога в холмы труднее всех прежних. Можно идти как есть. А можно начать её тем же отрядом, только опытнее: герои станут сильнее и возьмут новое снаряжение, а то, что у них сейчас при себе, останется в прошлом.»
   - «1. Идём как есть.»
   - «2. Начать опытнее.»
2. The warning, said once after a no.
   - "The company goes as it is. One word for the road: what waits in the hills is more than it can handle yet."
   - «Отряд идёт как есть. Одно слово на дорогу: то, что ждёт в холмах, ему пока не по силам.»
3. The first line that tells a player they are Restrained.
   - "{Name} is caught in the web: no moving from the spot, harder to strike, harder to dodge. The web can be cut."
   - «{Имя} в паутине: с места не сойти, бить труднее, увернуться тоже. Паутину можно разрубить.»
4. The option's name.
   - "Cut the web"
   - «Разрубить паутину»
5. The line for `held_lost`.
   - "{Name} has stopped moving inside the web."
   - «{Имя} в коконе больше не шевелится.»

The seat's words for Restrained today are «в путах» and «освобождается от пут» (`game/src/table/seat-lines.ts`); line 3 replaces the first only where a web is the cause.

## 12. Out, and not built

As the scope's §3, unchanged. Chosen not to build, beside §4.5 and §5.2:

- A marker deed for the Godmother's death.
- A change to Nell's `attitude` or `monster` after the pack.
- A second surrender condition in fight 2 for a doubting Nell.
- A deadline clock the players see as a number. The stake is told (§6 rule 9), and each loss is a public event.
- An engine cap on reads. The cap of three is the game's, on lines only.
- A replay of the pack on the same world.
- Levelling the roster's own characters to 3 while they keep their gear. The scope offers pregens; the offer line says what it costs.

## 13. PRs

Fifteen with the scope: one more than the scope's upper count of fourteen. The extra one is PR 9. With 0096 option C it is fourteen.

| PR | What it lands | Depends on | What Stas reviews |
| --- | --- | --- | --- |
| 1 | Scope (table #492) | - | done in part: §10 |
| 2 | This design, decisions 0095 to 0097, Zoya's board and Vera's read quoted | 1 | §16 |
| 3 | Rows (Yan) | 2 | the price |
| 4 | core: the Restrained effect, Giant Spider with its web, Giant Wolf Spider | - | the SRD block quoted beside each test; how the web is modelled |
| 5 | core: Cultist, Cultist Fanatic, the Fanatic's spells core lacks | - | the same; which spells were missing |
| 6 | table: the pin | 4, 5 | full suite green |
| 7 | table: arrival in file order (0095) | 2 | the order of each arrival file, Saltmouth first; the re-recorded fixtures |
| 8 | table: scene reads (§4, §8): contract, fixture, server, the skeleton's `reads`, `pack:check` rules | 2 | the visibility row for `scene_read`; rule 5's fixture |
| 9 | table: a scene's card in a site session (0096) | 8 | the fixture where a card is put, voted and writes its deed; the game loop with no campaign |
| 10 | table: held creatures and the count (0097) | 6, 8 | the three fixtures of exit row 2; the public event |
| 11 | table content: the slot rename (map and `worlds.rs`), Nell's age (scope item 11) with exit row 11's test | - | Zoya's read; Vera on the two `look` lines |
| 12 | table: the level 3 pregens, the offer and the warning | - | exit row 7's test; Vera on lines 1 and 2 |
| 13 | table content: the pack `the_godmother` with its deck and registry records | 6 to 10; registries; MAP-13 | Zoya's board; Vera on scene 6 and line 3; exit rows 1, 2, 3, 8 |
| 14 | table content: the three Wendford reader cards, `the_fair_price` with `unless` | 7, 13 | the bench run; Zoya and Vera quoted |
| 15 | table: the judge item, the report rows, the exit pair's record | 13, 14 | the run verdict, which is his |

Can start now, before «Камень A» and the registries: 4, 5, 7, 8, 11 (without registry records), 12. PR 7 touches nothing of the pack and may merge first.

## 14. Risks

- **Most likely to sink it: the card in a site session (PR 9).** The server's card code assumes a campaign in 85 places and the game's card round runs only in one. Cheapest test: the one fixture of PR 9, written first, before any pack content; if it cannot be made to pass in a few days, take 0096 option C and the pack loses only its dawn card.
- **Cutting a child loose is never worth a turn.** If four level 3 characters bring the Godmother down inside two rounds every time, the count never starts and fight 2 puts no question. From memory the SRD gives a Giant Spider about 26 Hit Points; I could not read the block. Cheapest test: 200 seeded fights of fight 2 with no model under two scripted party policies (all on the spider; cut first), before the pack merges. It sets `from_round` and where she starts on the map. The signal: either policy saving every sleeper nine times in ten.
- **The DM does not call the surrender**, and the dawn has no decision (§10). Cheapest test: `play:scene` on scene 5, several times, before the pair.
- **Many reads, told thinly.** §4.2 rule 7's cap is the only guard. The exit `trace` counts reads told against reads a seat reacted to.
- **The Fanatic's spells take the human's turns.** Hold Person on the human's character in the pack's last fight is a player watching. Cheapest test: the same `play:scene` runs; the count of turns the human lost goes in the report.
- **Fixture churn** from PR 7. It is mechanical; it goes alone in its PR for that reason.
- **`back_way` pays only when scene 4 fails.** A party that pays for the back way and then keeps its promise sees nothing for the coin. A second reader (a line in scene 5) is Zoya's to place.

## 15. Exit rows

The scope's eleven rows stand with their layers. Proposed refinements, for the scope's owner to take or leave:

| Row | Proposed | Lowest layer |
| --- | --- | --- |
| 4, split | (a) a scene card writes its deed in a site session, and on the next contract's arrival the reader is the card put on the table | test, no model |
| | (b) the decision card with a live DM and seats | `play:scene` on scene 6, smaller than the exit run |
| | (c) the Wendford reader's line | the card bench, as the scope says |
| 10, made exact | the human's handle is in the deed's `by` by his own word or roll (a card choice or a check), not as a participant of a fight's end | full run, read by a person |
| 12, new | in every shipped arrival pile a card with no `if` comes after every card with one, and the Nell readers head Wendford's | test, no model |
| 13, new | neither half has a confirmed `read_untold` flag | full run, the judge |
| 14, new | in each half the stake line of fight 2 is told before the first `held_lost`, or no sleeper is lost | full run, read from the log |

## 16. Decisions for Stas

1. **A card in a pack with no campaign** (decision 0096). Recommended: A, a scene names its cards. It is the third piece of engine work, and the scope counts two. The cut is C.
2. **Arrival in file order** (decision 0095). Recommended: A.
3. **Sleepers are lost by the round while the Godmother stands** (decision 0097). Recommended: C, with `from_round` set by the seeded table.
4. **The scope's Out line "an attackable web outside the Giant Spider's stat block".** I read it narrowly: a cocoon is her own web, placed when the scene loads, and cutting it is her stat block's rule. If the line was meant to forbid that, sleepers have no carrier inside the scope. Recommended: accept the narrow reading.
5. **`nell_doubts` cannot move Nell's surrender** (§3 question 4). Its reader becomes a choice on the dawn card that only a doubting Nell opens, and a line in scene 5. Which of the two the story wants is a question to Zoya. Recommended: accept; no new surrender kind.
6. **The human can be outvoted on the decision about Nell.** The card is decided by the Blades' majority; the human speaks first and breaks a tie. Three AI seats can carry it against him, and then `by` does not name him. Recommended: keep the road's rule, and let exit row 10 be met by an earlier deed. The alternative is a card field for "the human decides", a new rule for one card.
7. **The exit roster** (§3 question 10). Recommended: your own latest Wend roster, both halves from copies of it. It is your history the pack should read.
8. **A challenge, made once, to scope §2 items 2 and 6.** The record: 24 deeds read and about 20 written in six scenes. Twelve tracked factions shipped and playtesters noticed two; I expect the same ratio here. The refinement: Zoya marks at most two reads a scene as the ones a player must feel, and they go first in file order; the rest stay as lines the cap may drop. It costs nothing to build. The scope stands until you say otherwise, and this design follows it.
9. **Open for Zoya and you, story, not mine to draft:** what stands at the Wendford well after Nell is gone; whether a dead Nell gets a Wendford card of her own; what a world sees where the pack was begun and lost.
10. **Departures and corrections, to accept:**
    - the Restrained effect is core work, not something core has;
    - `killed_nell` is `killed_nell_hale`;
    - one deed for each lost sleeper beside the two the scope names, read only in scene 6;
    - `leader_down` is the surrender condition of fight 2; the scope names the other two;
    - fifteen PRs.
11. **Rules I am about to follow where the rulebook is silent:**
    - a card's text has no variants, so a different text is a different card;
    - a fallback's deed does not count toward an exit row;
    - a working deed id may be renamed until its pack PR opens.

## 17. Zoya and Vera

Both read this draft on 2026-11-24 (decision 0069). Lev has not answered either page: the draft above is as he wrote it, and what follows is what they change if Stas agrees.

### 17.1 What they add to §16, for Stas

12. **§11 line 1 does not pass Vera.** She cannot tell whether "start" forgets the story or whether the gear is gone for good, and the warning after a no makes option 1 read as a trap. Zoya holds the same line against guardrail 7 and asks that the purse carries over. Recommended: rewrite lines 1 and 2 (the story and the purse stay, the gear is named as the price on the button itself, the warning says "harder", not "beyond you") and read them to Vera again before the content PR.
13. **§11 line 5 leaves the child's fate unsaid.** Vera asks "is he dead, can I still save him", Zoya quotes Story-space 4. Recommended: the line stays cold and short, the lost child is marked dead in the engine's record, and dawn says it plainly.
14. **§11 line 3 does not say who cuts.** Recommended: add "anyone beside her can".
15. **Rows the board holds as owed:** the other five `gwyn_news` deeds, the two barrow-lights deeds, "going round", a lost fight 2, a card for a dead Nell at Wendford, a failure deed beside `hesta_known`. Recommended: take Zoya's carriers (a fourth sleeper for going round, a surprise rule for `back_way`, one Osric card `if: killed_nell_hale`), strike the barrow lights with the lit barrows, and decide the lost fight as its own question: a loss rule is engine work the scope does not count.
16. **Snitt is not put on the slope.** The back way is sold by an unnamed kinsman in both worlds; Osric keeps the three `snitt_yielded` answers. Recommended: accept.
17. **The name.** Zoya's two risks with Arachta: five of the six letters of the old source's name survive, and «арах-» leans to «арахис» in Russian. Stas chose the name knowing the first; the second is new. Recommended: keep it, stress Ара́хта, always «ё» in «Крёстная».
18. **The lore line** in Zoya's §4, for `lore/the_wend_valley.md`, lands with the first content PR. The stale "Arachas" lines in her bible are a rename-only bible PR.
19. **Zoya's amendment to the bible** (a deed carries a pay-off only if the other outcome writes its own deed). Recommended: accept; it goes in the same bible PR.

Would Vera get through this alone? Through the fight lines, yes. Through the offer, not yet: she would press "start more experienced" pushed and without knowing what she loses (item 12).

### 17.2 Zoya's board, verbatim

> **Zoya Katz: board check, `wend`, with the Godmother design (Proposed) and decisions 0095 to 0097 among the files**
>
> I read the bible, the Mill, *Fair in Wend*, *The Way Back*, `worlds/wend` and the lore, and edited nothing. Each of the 24 deeds the design reads has a writer in the tree. `killed_col` and `killed_dunn` come from the death rule, through the Millbeck fight's `npc`.
>
> **1. The board**
>
> *Setups the Godmother pays off*
>
> | Setup | Pay-off | Carrier, status |
> |---|---|---|
> | Mill S3: `snitt_yielded` / `yard_to_the_end` | s2: who sells the back way | creature read. **Paid** once fixed: an unnamed kinsman in both worlds. Putting Snitt on the slope decides his fate, which scope §3 leaves out and `mill_goblin_taken_alive`'s note forbids |
> | Wendford: the six answer deeds | s1: Osric | line. Fix: the three `yard_to_the_end` answers go to the kinsman in s2 (`sent_the_hill_kin_to_the_blades` is the kin arriving); Osric keeps the three `snitt_yielded` answers. **Paid when told**; M13's card tests 3 and 4 close then |
> | Mill S5: `wenna_saved` | s1: Wenna at the ford | **struck as a pay-off**: every win writes it, so it is a marker. It is a gate, not "owed" as §9 has it |
> | Bridge: `killed_col`, `killed_dunn` | s3: the slot | **Paid** |
> | `col_owes_blades` | already paid by `gwyn_cheese` | s3 line, optional |
> | `heard_of_the_low_fires` | s2: Gwyn | **Paid** |
> | The other five `gwyn_news` deeds (`asked_after_the_ridge_farm`, `listened_to_gwyn`, `gave_gwyn_fenns_clipboard`, `told_gwyn_of_fenns_purse`, `told_gwyn_of_her_dog`) | **owed** | none. They are not in the scope's list, so the design owes the board these rows |
> | `robbed_cairn` / `left_the_cairn_stones` | s5, beside the coppers in the roots | line. **Paid when told** |
> | `saw_the_barrow_lights` / `passed_the_barrow_lights` | **owed** | not in the scope's list. Either an s5 line that explains nothing, or struck with the lit barrows: Stas's call |
> | `salt_on_credit`: five deeds | s6: the boy's mother | Fix: read all five in one place (§9 splits two off). Only one can hold, so they take one slot |
> | `the_fair_price`: Nell's four deeds | s5 | Add the fifth, `wendford_turned_cold`. Nothing on main reads it |
> | `heard_of_the_hollow_king`, Gritch's words, the lit barrows | **struck**: kept as rumour (scope §3) | - |
> | `killed_gritch`, Snitt's fate, Osric's hidden loan | **owed**, not by this pack | - |
>
> *Deeds the Godmother writes*
>
> | Deed | Read in | Status |
> |---|---|---|
> | `hesta_known` | s3, s4 | A failure writes nothing, so by Consequence 2's letter it carries nothing. Fix: the failure writes its own deed |
> | `cut_the_ewe_loose` | s3, the surprise rule | paid |
> | `back_way` | s5 spawn, only when the fire was lit | half paid (§2) |
> | going round | **nobody** | owed; card tests 3 and 4 fail. Proposal: a fourth sleeper with `if: went_round` |
> | fight 1 outcomes, Hesta's death, the promise, `nell_doubts`, `signal_fire_lit`, `nell_yielded` / `roots_to_the_end` | s4 to s6 | paid |
> | sleeper outcomes | s6 | Paid in the pack. Gap: §6 rule 8 changes nothing on a lost child, so «Люди» shows her alive on the next contract. Fix: mark a lost child dead, as §5.2 rule 9 does for a named death |
> | the decision about Nell (three deeds) | three Wendford cards | **owed** until PR 14 |
> | `killed_nell_hale` | next contract | **owed** (§2) |
> | fight 2 lost | **no writer** | **owed** (§2) |
>
> The page stays open while any row above is owed.
>
> **2. Lev's questions**
>
> - **The well after Nell.** Keep `the_fair_price`. It is Fenn's salt crowd, the card where custom meets the market, and it comes back on every *Way Back* contract. Take Nell out of its `cast` and drop `unless: nell_yielded`. Add one note line per outcome saying who sits on the rim of the well now. Letting rule A8 remove the whole card punishes the party for what it did earlier, which is Story-space 8's reason.
> - **A dead Nell's card.** Owed, not optional. Osric has `place: wendford`. Without a card he greets the party a contract later as if his niece were alive. One card with `if: killed_nell_hale`, first in the pile beside the three. Brief: Osric wants one name for his tally, the words of the mill card coming back at the party.
> - **Begun and lost.** Owed, with no carrier. `on_end` only holds when the party wins (`scene.rs`), and Consequence 4 says losing is a consequence. Stas's call: a loss rule, or strike it with a reason.
> - **A second reader for `back_way`.** A surprise rule in fight 2 with `if: back_way`: the coin bought a way in unseen. It shortens the Godmother's fight, so it goes into the seeded table.
> - **At most two reads a scene.** I take it. Reads that select a creature, spawn or surprise rule are always told, so the two are line reads:
>   - s1: Osric's answer
>   - s2: Gwyn, the kinsman
>   - s3: `col_owes_blades`
>   - s5: Nell's memory, the cairn
>   - s6: the mother's salt
>
>   A held read does not count as paid on my board. For `nell_doubts`, keep the dawn choice and cut the s5 line, because it changes nothing.
>
> **3. Names**
>
> - **«Крёстная» / the Godmother.** A kin word in a folk register, right for the hill farms. The root «крест» is not imported from a church: the cross is already Embra's sign on the loaf and the stitches on the company's sleeve, and the lore line ties the word to the loaf. Always write ё; without it, «Крестная» can be read as "of the cross". Cases: Крёстная, Крёстной, Крёстную. Both languages carry echoes of the Godfather and the fairy godmother, and no DM note should lean on either. It is a common noun, so guardrail 9 holds.
> - **Арахта / Arachta.** Cases: Арахта, Арахты, Арахте, Арахту, Арахтой. The stress needs fixing; I lean to Ара́хта. No clash with Gwyn or Agna. Two risks, both Stas's to weigh:
>   - it keeps five of the six letters of «Арахас», so the old source shows through the rename;
>   - «арах-» sounds like «арахис» (peanut), a joke that lands in Russian only.
>
>   Hesta and Arachta rhyme, and they share scenes. The DM says «Крёстная» before Nell says the true name and after.
> - **Stale names.** "Arachas cult" in `compass-wend.md`, "Arachas" on `examples.md` lines 44, 52 and 84, and the map's `_comment`. A bible PR, rename only. "Nell, a year later" in the compass also goes stale.
>
> **4. The lore line.** It goes in `lore/the_wend_valley.md`, under *People and customs*, after Embra:
>
> > - **A godmother** (крёстная). On the hill farms a child is named over a loaf scored with a cross, and a woman who is not its mother breaks the loaf: she is its godmother, and the child goes to her when its own house cannot feed it.
> >
> > **Крёстная.** На холмах ребёнка нарекают над хлебом, надрезанным крестом, и хлеб разламывает женщина, которая ему не мать: она его крёстная, и ребёнок уходит к ней, когда свой дом его не прокормит.
>
> The custom comes from the economy (World 4): a farm with no flock cannot feed a child. The line names no god.
>
> **5. Against the bible**
>
> - **§11 line 1:** "what they carry now stays behind". Guardrail 7: "A player's progress is never lost. The party, its deeds, and the world carry over between evenings." It holds only as a choice whose line states the price. The purse must carry over with the handles, and the design does not say that it does. "Your heroes" is the wrong register for sell-swords.
> - **The lost child.** Story-space 4: "The darkness comes from the situation, never from a withheld fact." A child who "does not wake" while the engine records no death leaves it unsaid whether she is dead. Say it plainly at dawn.
> - **§9, `wenna_saved` and `hesta_known`.** Consequence 2: "a deed every path writes is a marker… never counts as a carried pay-off."
> - **§16 item 6.** A human outvoted on the card keeps Story-space 1's letter ("decides first") and breaks the scope's goal, "the human's own decision". Stas's call.
>
> **Pack tests.** Half-blind choice: the back way. Consequence on the young: the sleepers. Out of date: what the party learned of Nell at the well. All three hold.
>
> **Amendment.** Policy: a deed carries a pay-off only if the other outcome writes its own deed; writing nothing does not count. Why: the bible is silent on an outcome that writes nothing, and I applied this rule to `hesta_known` above. Blocks: nothing.
>
> Nothing here reaches a player, so there is no Vera read. The lore line is DM context only (`lore/README.md`), and §11 goes to Vera from the calling thread.

### 17.3 Vera, verbatim

She was given the five Russian lines of §11 alone, with «Марен» and «Тэм» in place of the name, and nothing else.

> 1. Что я поняла
> Перед дорогой в холмы мне дают выбор. Можно идти теми же героями, какие они сейчас. А можно взять тех же героев, но «опытнее»: они станут сильнее и получат новые вещи, а старые вещи пропадут. Если я пойду как есть, игра один раз меня предупредит, что сил не хватит. Я бы, скорее всего, выбрала второе, потому что после такого предупреждения первое похоже на ловушку. Потом в бою: Марен попала в паутину, паутину можно разрубить, и в списке действий есть кнопка «Разрубить паутину». Я бы её нажала. Потом Тэм в коконе перестаёт шевелиться, и я пугаюсь, что он умер.
>
> 2. Что я бы переспросила вслух
> - «начать её тем же отрядом, только опытнее». Что значит «начать»? Я всё забываю и начинаю заново? То, что мы прошли до сих пор, пропадёт? Я так поняла, что история продолжается, а меняются только герои, но слово «начать» заставило меня засомневаться.
> - «останется в прошлом». Это значит, что вещи пропадут насовсем? Или я смогу их найти потом? Если у кого-то есть любимая вещь, я хочу знать, что я теряю, до того как нажму.
> - «Начать опытнее». В самой кнопке не сказано, что вещи пропадут. Это сказано только в абзаце над кнопками.
> - «ему пока не по силам». «Пока» — значит, в холмах можно стать сильнее? Или значит «вы проиграете»? Я не поняла, насколько это серьёзно.
> - «бить труднее, увернуться тоже». Насколько труднее? Мне хватает и того, что сказано, но я не поняла, кто должен разрубить паутину: сама Марен или кто-то другой.
> - «Тэм в коконе больше не шевелится». Он мёртв? Без сознания? Ещё можно его спасти? Я поняла, что он умер или умирает, и я бы спросила, что мне делать.
>
> 3. Где я стала пассажиром
> Перед походом. Предупреждение после первого варианта не оставляет мне настоящего выбора, так что я нажала бы «Начать опытнее» только потому, что меня к этому подтолкнули, не понимая, что я теряю. На Тэме я бы остановилась и не знала, что нажать: кнопки «освободить Тэма» мне не дали, а про него сказано только, что он не шевелится. Ноутбук я бы не закрыла, но тут мне стало тревожно.
>
> 4. Где стало скучно
> Скучно нигде не было, всё короткое. Абзац перед походом я прочитала дважды из-за слов «начать» и «останется в прошлом». «Можно идти как есть» и «Идём как есть», а потом ещё «Отряд идёт как есть»: «как есть» повторяется три раза совсем близко, я это слышу. «Паутину» тоже повторено в двух соседних фразах, и это похоже на эхо. «Одно слово на дорогу» мне понравилось, звучит как старая присказка, и я улыбнулась. «Тэм в коконе больше не шевелится» сказано коротко и холодно, и это сработало: мне стало не по себе, хорошо это или плохо.

### 17.4 Review findings open against the draft

One review round on e5bb161 (Rule 8). Three were errors of fact and are fixed in place: the spawn example's tag (`kind`), the arrival counts in 0095 and §5.1 (16 of 17 carry an `if`; 11 are `once: true`, 6 are `once: "contract"`), and the status line. Five are design defects, checked against the tree, and stay open until Lev's next pass:

1. **0095: a recurring arrival card at the head of a pile starves the cards behind it.** Six arrival cards are `once: "contract"`; `rufus_due` returns every contract with no `unless`, so in file order it is shown at every Saltmouth arrival and the cards after it never come. Fix: every `once: true` card before any `once: "contract"` card, with a test, and a rule for where a pack's own arrival card sits.
2. **§5.2: a scene card marked `chained: true` that nothing adds does not load.** `Deck::validate` answers "chained card ... is never added" (`crates/nat20-world/src/deck.rs`). Fix: name the validator change in §5.2, PR 9 and 0096, or use another marker.
3. **§3 question 4, §7: with the signal fire lit, fight 2 can end by surrender while the two spawned Giant Wolf Spiders are still hostile.** The surrender lists eight creatures and the fight holds ten. Fix: say whether a spawn's handles may be named in a surrender, or what happens to the two.
4. **§5.2 rule 1 against §4.2 rule 5.** A scene that lists `cards` answers `bad_scene` outside a site session, while the base scene is meant to play with no site. Fix: ignore `cards` outside a site session, or run exit row 3's no-deed case in a site session with an empty memory.
5. **`roots_to_the_end` has no reader**, so the pack fails the design's own `pack:check` rule (§4.2 rule 9). Fix: a scene 6 read, or drop the deed; check `bald_hill_to_the_end` the same way.

The branch is the session's own `claude/...` branch, against Rule 8's naming: a cloud thread can push nowhere else.

## Sources

- `docs/scope/the-godmother-scope.md` §2, §4, §6, §10; the concept, version 2; `docs/scope/dramaturg-mechanism-scope.md` §3.
- `docs/design/m13-system-design.md` (scene deeds, the site, the validator); `docs/design/card-bench.md`.
- Decisions 0043, 0062, 0063, 0069, 0070, 0075, 0077, 0080, 0083, 0084, 0089; Proposed 0095, 0096, 0097.
- `contract/protocol.md`; `crates/nat20-api-contract/src/scene.rs`; `crates/nat20-world/src/deck.rs`, `travel.rs` (`Memory`); `crates/nat20-api-server/src/campaign.rs` (`SiteWorld`), `session/cards.rs`.
- `worlds/wend/map.json`, `npcs.json`, `deck/`; `scenarios/the_way_back/deck/fenn.json`; `scenarios/the_silent_mill/`.
- The fork at ea7eaef: `assets/registries/` (monsters, conditions, spells).
