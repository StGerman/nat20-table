# Arachas (the lair under the Barrow Oak): scope

Status: Proposed; accepted when this PR merges, except the source, the name Arachas and the pack id `lair_of_arachas` (§2 item 1), which stay conditional on §9 question 5. Drafted 2026-11-23 on main f5a036a at Stas's ask («Давай скоуп сейчас»). No number (decision 0085: a milestone gets one in its `milestone.md`).
Inputs: the concept, version 2 (<https://claude.ai/artifact/GDdBxPPt4tWC8tL55vcm5y>, copy `/mnt/project-files/demo/arachas-in-wend-concept.md`); Lev's review and Zoya's read of 2026-11-16, 33 items, approved by Stas 2026-11-23 20:15Z (<https://claude.ai/artifact/EFK8DGAun4PCiggVLyUtuF>); `docs/roadmap.md` row "Arachas plus glue"; `docs/scope/dramaturg-mechanism-scope.md` §3 (the shelved inputs); `docs/design/m13-system-design.md` §12 (the debts left to this pack).
Order (Stas 2026-11-23 20:12Z): Glass Table, Sign in with ChatGPT, People and places registries, «Камень A», then this. `docs/roadmap.md` still says "no spec yet" and has no registries step; Yan keeps that page (decision 0065) and updates it at his next pass; until then this line is the order.

## 1. Goal

A third quest on the Wend map, at the Barrow Oak, in which what the party did on the road and at the Mill is met again in a scene, the children are not all saved for free, and the human's own decision about Nell Hale is answered on the next contract.

## 2. In

1. **The pack `lair_of_arachas`** at the map's place `barrow_oak`, whose `pack_slot` is `lair_of_arachas`: six scenes, two fights, one day and one night on site, about 95 minutes; prose and DM notes in the pack's own text (CC-BY-4.0). The skeleton and the name Arachas come from *The Lair of Arachas* (Hugh Lashbrooke / Ten Acre Games, CC-BY 4.0); no text, map, item card or art of theirs. Rule 7's list of allowed sources does not name a third-party CC-BY adventure, so this needs §9 question 5 answered before any content PR. Attribution in `NOTICE.md` and the pack's `credit`.
2. **A scene reads a deed** (the one new system; carrier B of the M13 scope §3): a scene variant chosen by `if`, the way a card is chosen today. The deeds read are those main already writes: `wenna_saved`, `snitt_yielded` or `yard_to_the_end`, the six Wendford answer deeds the M13 design left to this pack (`named_self_for_the_goblin`, `said_the_goblin_should_have_died`, `gave_osric_no_name`, `told_osric_they_fought_to_the_last`, `sent_the_hill_kin_to_the_blades`, `asked_osric_about_the_yielded`), `killed_col`, `killed_dunn`, `col_owes_blades`, `heard_of_the_low_fires`, `robbed_cairn` or `left_the_cairn_stones`, and the five `salt_on_credit` deeds (`paid_for_the_ridge_salt`, `fenn_gave_credit`, `fenn_said_no`, `gave_fenns_salt_to_bald_hill`, `passed_the_ridge_farm`), and the four deeds Nell's own record remembers from `the_fair_price` (`sold_salt_at_their_price`, `made_way_through_wendford`, `talked_wendford_down`, `showed_wendford_the_toll`), read where the party faces her. `killed_gritch` and MAP-13's deed are not read here. «Камень A»'s farm deed is read once that quest is on main.
3. **Four monsters into core** (`demo`), from SRD 5.2.1: Cultist, Cultist Fanatic, Giant Spider (Web), Giant Wolf Spider. Checked on `demo` at ea7eaef: none of the four is there; the Restrained condition and Hold Person are; Command and a Web action were not found. The Fanatic's spell list (Command, Hold Person, and a Spiritual Weapon bonus action as far as recalled) is taken from the SRD 5.2.1 block in the design, not from this line; each spell core lacks is core work. Then the pin.
4. **Sleepers the engine can count.** Not every sleeper wakes for free: one the party did not reach in time does not wake, and the engine's count writes `all_sleepers_woke` or `a_sleeper_did_not_wake` at the fight's end (decision 0070). Scene 6 reads it. The design says what "in time" is (§6 question 3), under one constraint: a fight that ends early by surrender never costs a child nobody had a turn to reach.
5. **Two fights at level 3 for a party of four**, seven creatures each, one Cultist Fanatic in the pack: fight 1 on Bald Hill, 575 XP (Hesta or a neighbour as a Cultist, 2 Cultists, 2 Giant Spiders, 2 Giant Wolf Spiders); fight 2 under the oak, 850 XP (Arachas as a Giant Spider, Nell as the Cultist Fanatic, 2 Cultists, 3 Giant Wolf Spiders). If the signal fire was lit, two more Giant Wolf Spiders arrive in round 3 (100 XP, nine creatures); that is the price of a failed scene 4, outside the seven. Surrender through the conditions the contract has (`standing_at_most`, `hp_fraction_at_most`). Hesta and Nell carry `npc`.
6. **Every deed the pack writes has a reader in the same pack or in item 7's card.** By concept: `hesta_known`, `party_ambushes`, `back_way`, `nell_doubts`, the promise to the captive, the cultists spared or killed, `killed_hesta`, Nell yielded or `killed_nell`, and the two sleeper deeds of item 4. The design fixes the ids; the rule is the list, not a count.
7. **The decision about Nell is a deck card**, with its reader in the same change: a Wendford arrival card on the next contract.
8. **Level 3 pregens** (`pregens/*_l3.json`) for a party that starts here. A roster below level 3 is offered them and may decline; the pack then warns once, in the table's own words, that the road ahead is beyond the company, and plays as written.
9. **People and places as registry records:** Nell, Hesta, the Bald Hill brothers, the three sleepers (Nell, Col, Dunn and Gwyn are existing records in `worlds/wend/npcs.json` and are changed, not added); the Highsteads fold gate, the Bald Hill farm, the chamber under the oak. Bald Hill stays a scene on the 2-mile path, not a map place.
10. **Nell's age in older content:** four lines on main make her a child, and all four change so she is a young woman: "about eight" in the note on card `the_fair_price` (*The Way Back*) and in `notes` of `nell_hale` in `worlds/wend/npcs.json`, "A small girl with a slate" in her `look`, «Девочка с грифельной доской» in her `look_ru`. Her `notes` also say "a year on she is the one who moves"; that line is rewritten to the pack's season. Zoya reads that PR, and Vera reads the two `look` lines.

## 3. Out

- XP, level-up and the roster between runs: built in Milestone 9 (API-44, API-45, ENG-31, CHR-12).
- The other seven inputs the M13 scope §3 shelved to "Arachas plus glue". They stay on the shelf for the Mill plus glue or a later scope: errand quests; fronts and clocks (the deadline here is "tonight", in prose); witnesses and the attitude step; more of `saw` than main has; carrier C; arrival without a draw; Snitt's fate after Scene 4 and the promise to him (this pack reads `snitt_yielded` and decides nothing more about him).
- MAP-13 (the Mill's goblins yield): its own backlog row, not part of this pack, and still due before it (`tasks/backlog/MAP-13.md`); §7 keeps it in the order.
- What Gritch said about the Hollow King, and the lit barrows: the pack explains neither. Zoya's board row is answered by keeping both as rumour.
- A hazard that applies a condition outside a fight, a new surrender kind, an attackable web outside the Giant Spider's stat block.
- Travel draws inside the pack. The road deck leads in.
- The Hollow King as a fact. Nobody in the pack confirms him.
- The Dyke, the salt flats, the Snake, the border, Cork Island, Midwend.
- Allies in the pack's fights (allies join only a card fight with a wagon).
- Any item that is not in the SRD.

## 4. Exit criterion

Each row names its lowest layer (decision 0080).

1. `pack:check` is green for `lair_of_arachas`, slot and adventure id equal: test, no model.
2. Scripted fixtures, no model: each fight's surrender condition fires; fight 2 once with every sleeper cut loose, once with one left, and once ended by surrender in round 2 with no sleeper lost, each writing its deed; fight 2 with the signal fire lit and not lit, the two extra spiders arriving in round 3 only when lit.
3. One scripted case per deed id listed in §2 item 2 («Камень A»'s farm deed joins the list by an amendment here once it has an id): the scene variant shown is the one the deed selects, and with no deed the scene still plays: test, no model.
4. The decision card writes its deed and the Wendford reader offers the changed line: the card bench. The bench is the only layer on purpose: the pair ends before a next contract.
5. Vera reads scene 6's prose where a child does not wake, and the first line that tells a player they are Restrained, before either merges.
6. One pair on one build (decision 0043), all AI first, then Stas: each plays scenes 1 to 6 in 120 minutes or less; audit, leak scan and narration judge pass: full run. Both halves start from a roster and a world memory that hold at least one Mill deed and one road deed, and each transcript shows a scene reading one of them.
7. A level 2 roster is offered the level 3 pregens, and a level 3 roster is not; a roster that declines is warned exactly once and the pack starts: test, no model. Vera reads the warning line.
8. `pack:check` shows a reader for every deed the pack writes (§2 item 6), and a registry record for each person and place of item 9: test, no model.
9. Each of the four monsters has a core test in `core/tests/` against its SRD block, Web applying Restrained among them, and each Fanatic spell core lacks: core test.
10. In Stas's half, the human's character writes one deed in scenes 1 to 4 and hears it read back in scene 5 or 6 (the M13 design's §12 item 6). Lev's `trace` of that run shows where: full run, read by a person.
11. Nell's record and the `the_fair_price` note hold none of the stems "eight", "girl", «девочк» or "a year on", case ignored, and her `look` says "young woman": test on those two entries, no model.

## 5. Reads already made

- **Lev** (design and play read of the concept, 2026-11-16): the spine holds; version 1 was written against a repo that no longer existed and three of its five choices did not come back to the player. His 15 findings are in the approved list.
- **Zoya** (continuity read, 2026-11-16): the spine works; five foundations were wrong (the Mill's deeds, Nell's age, the Hollow King as fact, the free fate of the children, the map's 12 miles). Her board of paid and unpaid setups is in the approved list.
- No Vera read: there is no player-facing line yet.

## 6. Questions for the system design (Lev, decision 0069)

1. Rule 1: what `if` on a scene adds to the wire, and whether it is the card's own `if` or a new field.
2. The promise in scene 4: a deed is never on the DM's word alone, so its carrier is a check outcome or a card. Which.
3. Sleepers: objects in the fight, creatures that cannot act, or a count beside the fight. What "cut loose" costs in actions, and when a sleeper is lost (a round, or Arachas reaching it), under §2 item 4's constraint. Rule 3: what a player view shows of a cocoon.
4. Whether fight 2's round-3 arrival can be gated by a flag, and whether `standing_at_most` can watch Arachas while Nell is the one who yields.
5. Web in core, applying the Restrained condition core already has: registry JSON or code; how the web is destroyed.
6. The Bald Hill farm's states (both brothers alive, one dead, both dead, the family gone): how many scene variants that is, and which are prose only.
7. Where the level 3 pregens come from: built by the engine's own level-up from the level 2 files, or written by hand.
8. Which records outlive the contract.
9. Nell after the pack, in older content. Dead: a card with a dead person in its cast is never offered, so the design either takes her out of the cast of `the_fair_price` or names the lost card as the deed's consequence. Alive: what her record (`monster`, `attitude`) and `the_fair_price` become on each outcome of the decision card, so she is not back at the well as if nothing happened.
10. The roster for the exit pair: an earlier run's roster on the exit build or a committed fixture roster, and what a deed's `by` means when a level 3 pregen replaces the character who wrote it.
11. Fight 2 always happens once the party enters the chamber, or the sleeper deed has a writer for the endings without it: the party falling, the party leaving.

## 7. Cost and order

Not priced: Yan prices it at the next roadmap pass, after the registries and «Камень A» have their own numbers. What is known now:

| Field | Estimate |
| --- | --- |
| Rows, by kind | core: 4 stat blocks, Web, Command and any other Fanatic spell core lacks; contract and server: scene `if`, sleepers; content: the pack, the decision card and its reader, pregens, registry records; one run-record row |
| PRs for Stas | about 11 to 14 (this scope, the design, 2 to 3 core PRs and a pin, the contract PR, 4 to 6 content and server PRs, the run record) |
| Exit runs | one pair; the last pairs cost 18 to 22 USD. A roster holding Mill and road deeds may need one more all-AI run first (§6 question 10) |
| Stas at the table | one half, up to 120 minutes: the longest human half so far |
| Order inside | MAP-13 before the pack; then design, core monsters, pin, contract, pack, cards, exit |

Work that can start before «Камень A» and the registries are done, with no code: the system design, and Zoya's quest brief and problem blocks. Work that waits: registry records (after the registries), the farm's fourth state (after «Камень A»).

## 8. Rows

None until this scope and the system design are both accepted.

## 9. Questions for Stas

1. **What "plus glue" means here.** This scope takes one shelved input, "a scene reads a deed", and leaves the other seven on the shelf (§3 lists them). One of them you placed here on purpose: "arrival without a draw" was to be decided in this scope (M13 scope §3, your 23:40Z). A yes moves that decision on once more. Recommended: yes; each one the player would not feel delays the pair.
2. **XP.** After your approval of seven creatures and one Fanatic the pack gives 1425 XP, about 356 a character in a party of four; fight 1 is just under the Low budget. Options: (a) keep; (b) a second Giant Spider in fight 2 (the pack's fourth), 1050 XP there, 1625 XP in all, eight creatures. Recommended: (a) until a run shows fight 2 is short.
3. **The design may start now**, ahead of «Камень A», because it needs no code and no merged quest. Recommended: yes, as soon as you say so; it is one review of yours.
4. **The exit is a pair**, with your half up to two hours. Recommended: yes; this is the pack that owes you a deed you made and met.
5. **Rule 7 and a third-party CC-BY source.** Rule 7 lists SRD, Foundry fields, 5e-bits and our own text. This pack takes a plot skeleton and one name from a CC-BY 4.0 adventure, with attribution. Options: (a) a short decision record and one line in Rule 7 that allows a CC-BY 4.0 work's ideas and names with attribution, never its text or art; (b) rename the spider and keep only the plot outline (missing children, a cult, a lair), which is an idea and not protected, with no attribution and no rule change; that also renames the pack id, the `pack_slot` and comment of `barrow_oak` in `worlds/wend/map.json`, this file, the roadmap row, the assertion in `crates/nat20-world/tests/worlds.rs` and the open task files that name Arachas (`tasks/backlog/MAP-13.md`, `tasks/m13-dramaturg-mechanism/MAP-20.md`); accepted decisions and frozen records keep the old name. Recommended: (a); the licence page was checked on 2026-11-14 and the name is the quest's hook.
