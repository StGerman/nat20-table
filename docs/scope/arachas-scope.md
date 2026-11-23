# Arachas (the lair under the Barrow Oak): scope

Status: Proposed; accepted when this PR merges. Drafted 2026-11-23 on main f5a036a at Stas's ask («Давай скоуп сейчас»). No number (decision 0085: a milestone gets one in its `milestone.md`).
Inputs: the concept, version 2 (<https://claude.ai/artifact/GDdBxPPt4tWC8tL55vcm5y>, copy `/mnt/project-files/demo/arachas-in-wend-concept.md`); Lev's review and Zoya's read of 2026-11-16, 33 items, approved by Stas 2026-11-23 20:15Z (<https://claude.ai/artifact/EFK8DGAun4PCiggVLyUtuF>); `docs/roadmap.md` row "Arachas plus glue"; `docs/scope/dramaturg-mechanism-scope.md` §3 (the shelved inputs); `docs/design/m13-system-design.md` §12 (the debts left to this pack).
Order (Stas 2026-11-23 20:12Z): Glass Table, Sign in with ChatGPT, People and places registries, «Камень A», then this.

## 1. Goal

A third quest on the Wend map, at the Barrow Oak, in which what the party did on the road and at the Mill is met again in a scene, the children are not all saved for free, and the human's own decision about Nell Hale is answered on the next contract.

## 2. In

1. **The pack `lair_of_arachas`** at the map's slot `barrow_oak`: six scenes, two fights, one day and one night on site, about 95 minutes; prose and DM notes in the pack's own text (CC-BY-4.0). The skeleton and the name Arachas come from *The Lair of Arachas* (Hugh Lashbrooke / Ten Acre Games, CC-BY 4.0); no text, map, item card or art of theirs (Rule 7). Attribution in `NOTICE.md` and the pack's `credit`.
2. **A scene reads a deed** (the one new system; carrier B of the M13 scope §3): a scene variant chosen by `if`, the way a card is chosen today. The deeds read are those main already writes: `wenna_saved`, `snitt_yielded` or `yard_to_the_end`, `named_self_for_the_goblin`, `killed_col`, `killed_dunn`, `col_owes_blades`, `heard_of_the_low_fires`, `robbed_cairn` or `left_the_cairn_stones`, and the three `salt_on_credit` deeds. «Камень A»'s farm deed is read once that quest is on main.
3. **Four monsters into core** (`demo`), from SRD 5.2.1: Cultist, Cultist Fanatic (Command, Hold Person), Giant Spider (Web), Giant Wolf Spider. Checked on `demo` at ea7eaef: none of the four is there; the Restrained condition and Hold Person are; Command and a Web action were not found. Then the pin.
4. **Sleepers the engine can count.** A sleeper still in a cocoon when fight 2 ends does not wake; the count writes `all_sleepers_woke` or `a_sleeper_did_not_wake` at the fight's end (decision 0070).
5. **Two fights at level 3**, seven creatures each, one Cultist Fanatic in the pack: fight 1 on Bald Hill 575 XP, fight 2 under the oak 850 XP. Surrender through the conditions the contract has (`standing_at_most`, `hp_fraction_at_most`). Hesta and Nell carry `npc`.
6. **Six records, each with a reader in the same pack:** `hesta_known`, `party_ambushes`, `back_way`, `nell_doubts`, the promise to the captive, the fight outcomes.
7. **The decision about Nell is a deck card**, with its reader in the same change: a Wendford arrival card on the next contract.
8. **Level 3 pregens** (`pregens/*_l3.json`) for a party that starts here; a roster below level 3 is offered them.
9. **People and places as registry records:** Nell, Hesta, the Bald Hill brothers, the three sleepers, Gwyn's scene; the Highsteads fold gate, the Bald Hill farm, the chamber under the oak. Bald Hill stays a scene on the 2-mile path, not a map place.
10. **One line of older content:** the note on card `the_fair_price` (*The Way Back*) says "a young woman", not "about eight".

## 3. Out

- XP, level-up and the roster between runs: built in Milestone 9 (API-44, API-45, ENG-31, CHR-12).
- The other shelved inputs of "Arachas plus glue" (`docs/roadmap.md`): errand quests, fronts and clocks, witnesses and `saw` beyond what main has, carrier C, arrival without a draw, MAP-13. The deadline is "tonight", in prose.
- A hazard that applies a condition outside a fight, a new surrender kind, an attackable web outside the Giant Spider's stat block.
- Travel draws inside the pack. The road deck leads in.
- The Hollow King as a fact. Nobody in the pack confirms him.
- The Dyke, the salt flats, the Snake, the border, Cork Island, Midwend.
- Allies in the pack's fights (allies join only a card fight with a wagon).
- Any item that is not in the SRD.
- The writer of `killed_col` and `killed_dunn`: no deck card on main writes them. It is an older gap; question 4.

## 4. Exit criterion

Each row names its lowest layer (decision 0080).

1. `pack:check` is green for `lair_of_arachas`, slot and adventure id equal: test, no model.
2. Each fight over a fixed seed set: both surrender conditions fire; fight 2 has at least one seed where every sleeper wakes and one where one does not, and the deed written matches the count: seeded fixtures, no model.
3. One scripted case per deed in §2 item 2: the scene variant shown is the one the deed selects, and with no deed the scene still plays: test, no model.
4. The decision card writes its deed and the Wendford reader offers the changed line: the card bench.
5. Vera reads scene 6's prose where a child does not wake, and the first line that tells a player they are Restrained, before either merges.
6. One pair on one build (decision 0043), all AI first, then Stas: each plays scenes 1 to 6 in 120 minutes or less; audit, leak scan and narration judge pass.
7. In Stas's half, the human's character writes one deed in scenes 1 to 4 and hears it read back in scene 5 or 6 (the M13 design's §12 item 6). Lev's `trace` of that run shows where.

## 5. Reads already made

- **Lev** (design and play read of the concept, 2026-11-16): the spine holds; version 1 was written against a repo that no longer existed and three of its five choices did not come back to the player. His 15 findings are in the approved list.
- **Zoya** (continuity read, 2026-11-16): the spine works; five foundations were wrong (the Mill's deeds, Nell's age, the Hollow King as fact, the free fate of the children, the map's 12 miles). Her board of paid and unpaid setups is in the approved list.
- No Vera read: there is no player-facing line yet.

## 6. Questions for the system design (Lev, decision 0069)

1. Rule 1: what `if` on a scene adds to the wire, and whether it is the card's own `if` or a new field.
2. The promise in scene 4: a deed is never on the DM's word alone, so its carrier is a check outcome or a card. Which.
3. Sleepers: objects in the fight, creatures that cannot act, or a count beside the fight. What "cut loose" costs in actions. Rule 3: what a player view shows of a cocoon.
4. Whether fight 2's round-3 arrival can be gated by a flag, and whether `standing_at_most` can watch Arachas while Nell is the one who yields.
5. Web and Restrained in core: registry JSON or code; how the web is destroyed.
6. The Bald Hill farm's states (both brothers alive, one dead, both dead, the family gone): how many scene variants that is, and which are prose only.
7. Where the level 3 pregens come from: built by the engine's own level-up from the level 2 files, or written by hand.
8. Which records outlive the contract.

## 7. Cost and order

Not priced: Yan prices it at the next roadmap pass, after the registries and «Камень A» have their own numbers. What is known now:

| Field | Estimate |
| --- | --- |
| Rows, by kind | core: 4 stat blocks, Web and Restrained, Command; contract and server: scene `if`, sleepers; content: the pack, the decision card and its reader, pregens, registry records; one run-record row |
| PRs for Stas | about 12 to 15 (this scope, the design, 2 to 3 core PRs and a pin, the contract PR, 4 to 6 content and server PRs, the run record) |
| Exit runs | one pair; the last pairs cost 18 to 22 USD |
| Stas at the table | one half, up to 120 minutes: the longest human half so far |
| Order inside | design, core monsters, pin, contract, pack, cards, exit |

Work that can start before «Камень A» and the registries are done, with no code: the system design, and Zoya's quest brief and problem blocks. Work that waits: registry records (after the registries), the farm's fourth state (after «Камень A»).

## 8. Rows

None until this scope and the system design are both accepted.

## 9. Questions for Stas

1. **What "plus glue" means here.** This scope takes one shelved input, "a scene reads a deed", and leaves the other seven on the shelf. Recommended: yes; each one the player would not feel delays the pair.
2. **XP.** After your approval of seven creatures and one Fanatic the pack gives 1425 XP, about 356 a character; fight 1 is just under the Low budget. Options: (a) keep; (b) a third Giant Spider in fight 2, 1625 XP and eight creatures. Recommended: (a) until a run shows fight 2 is short.
3. **The design may start now**, ahead of «Камень A», because it needs no code and no merged quest. Recommended: yes, as soon as you say so; it is one review of yours.
4. **`killed_col` and `killed_dunn` have readers and no writer.** Fix it here as one more row, or as its own small PR before this pack. Recommended: its own PR now; `gwyn_news` is already wrong without it.
5. **The exit is a pair**, with your half up to two hours. Recommended: yes; this is the pack that owes you a deed you made and met.
