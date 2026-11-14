# 0077. A deed a person witnessed shows on their card

- **Status:** Proposed
- **Date:** 2026-11-13
- **Decided by:** not decided. Stas chose the direction on 2026-11-13 20:00Z, answer 6 to the clickable-names questions («"Помнит: ты кормил её пса"… в "Свои в бою"», `docs/scope/allies-in-fights-scope.md` §10). Lev Neiman proposes option B and the wording under Decision; Stas decides, and the merge is his yes.
- **Supersedes:** [0063](0063-m11-the-road-remembers.md), in one constraint of its Context only ("deeds and picks are DM-only"), and only for the one case under Decision. Picks stay DM-only. Everything else in 0063 stands.

## Context

Since Milestone 11 a deed is the DM's alone. Decision 0063 states it as a constraint; `contract/protocol.md` says "No player view, `text` or `message` carries a deed", and its visibility table gives `world.deeds` and `deed_remembered` to the DM and to nobody else. A player learns that a deed was kept only when a later card reads it, or when the DM chooses to say so.

Stas's answers of 2026-11-13 make every name in the story open a card that shows what the player's own character has seen or heard of that person (answers 2 and 3), and put "remembers: you fed her dog" on that card in this milestone (answer 6). That line is a deed in a player's view, which 0063 does not allow. Facts checked on main a2e589f:

- The decks write 122 deed ids on 44 cards in 8 files. A card's `if` or `unless` reads 25 of them. No card reads the other 97, and 62 of those 97 carry a roster person's name in the id (`left_osric_in_the_mud`, `paid_cols_fine`, `lied_to_bel`). The 62 is a count by id, a proxy, not a list of witnesses.
- A deed record holds `by` (character handles), `day` and `contract` (numbers), under an id an author wrote in English. Rule 3 keeps numbers and scenario data out of a player's view.
- Stas's own example is not witnessed in the plain sense. `fed_gwyns_dog` is written by `stray_dog` on the lowland road; Gwyn is in the Highsteads. She learns of it when a card that reads the deed (`gwyn_news`) is shown with her in it.
- The Milestone 13 design (§3 item 7, "Room for later"; Proposed, on main) leaves room for an optional `saw` field on a deed, to arrive with its first reader and without a new roster format.
- Decision 0071: the DM's words never write a world fact.

## Options

### A. Deeds stay DM-only (0063 as it is)
- Pro: no view changes; nothing about a deed can leak.
- Con: answer 6 is not met. A deed comes back only if a card that reads it is drawn, and 97 of 122 have no such card.

### B. One authored line, on the card of a person who saw the deed or was told of it (proposed)
The roster entry of a person holds a `remembers` line for each deed that person can know, written by the dramaturg in two forms, "you" and "your company". The engine records on the deed who knows it (`saw`). A player's card of that person shows the line.
- Pro: the smallest reader a deed can get: no card to draw, no model to remember. The player sees the deed came back, on the face of the one who saw it. The view carries authored words only.
- Pro: per character without a new record of who did what: the deed's `by` already says whose word it was.
- Con: a player can open a card after a choice to learn whether the world kept it, for any deed done in front of a person.
- Con: a line for each deed and person is authored text, read by Zoya and by Vera; lines nobody writes show nothing.

### C. Strictly witnessed: only a person in the scene or on the card when the deed was done
- Pro: "witnessed" means what it says; one writer for `saw`.
- Con: Stas's example fails, and so do this milestone's own deeds: a dog or a horse that dies on the road dies away from its owner.

### D. A journal of the party's deeds, shown to the player
- Pro: one reader for all 122 deeds.
- Con: shows deeds nobody saw; turns the world's memory into a checklist of which choices are tracked; needs a player-facing line for every deed, not for the few a person remembers.

### E. A prompt line asking the DM to mention what a person remembers
- Pro: no contract change.
- Con: this is today. A model remembers badly, and no test can check that it spoke.

## Decision

B, proposed. The superseding rule, in full:

1. A player view may carry a deed in one form only: a roster person's authored `remembers` line for that deed, on that person's card.
2. The line is carried only when all three hold: the world remembers the deed; the person is in the deed's `saw`; the viewer's own character has seen the person. A person the character has only heard of carries no deed.
3. The line is the "you" form when the viewer's handle is in the deed's `by`, and the "your company" form otherwise.
4. The engine alone writes `saw`: the roster people on the card on the table when the deed is written, or placed in the scene for a deed a scene or a death writes; and, later, the roster people on any shown card that reads the deed. The DM's words never write it (0071).
5. No player view, `text` or `message` carries a deed's id, `by`, `day` or `contract`, and no `remembers` line carries a digit. `world.deeds`, `deed_remembered`, `world.offered`, `cards_offered` and `card_shown` stay DM only.
6. A card shows at most three such lines, the newest first.

B beats A and E because it is a reader a test can check, C because it keeps Stas's own example, and D because a few things a person remembers are read and a list of 122 is not.

## Consequences

- `contract/protocol.md`: the Deeds paragraph's last sentence and the `world.deeds` row of the visibility table gain this one exception; a new row gives `remembers` its view (DM: yes; owner and others: the lines rule 2 allows, per viewer). A fixture shows it, and the visibility scan gains a case for rule 5. The implementing thread makes the change under Rule 1.
- `Deed` gains `saw`, optional and left out when empty, as the Milestone 13 design allows: no new roster format.
- `worlds/<id>/npcs.json` gains `remembers` per person. `pack check` fails on a line whose deed no card writes, or whose person is on neither the card that writes it nor a card that reads it: such a line could never show.
- The lines are player-facing text: Zoya writes them, Vera reads them (CLAUDE.md, changed TUI lines).
- Rows and sizes are Yan's: the seen-or-heard record row of «Свои в бою» carries this.
- A deed's cost may still arrive late. What shows early is that the person saw it, which is the stake being visible when the choice is made.

## Revisit when

- A trace of an exit run finds a `remembers` line on screen for a deed that person could not know.
- Two exit pairs pass in which no player opens a person's card after a deed they witnessed: then the card is not a reader in practice.
- Zoya's attitude step (gap E, Arachas plus glue) needs `saw` to mean present only; then the told half moves to its own field.

## Sources

- `docs/scope/allies-in-fights-scope.md` §10, "Decided by Stas" answers 2, 3 and 6, and "What the answers change".
- Lev's design page `engine/allies-in-fights/lev-clickable-names.md` (project files; lands in the milestone's design PR), §1 rules 5 and 6.
- Decisions 0063 and 0071; `docs/design/m13-system-design.md` §3 item 7; `contract/protocol.md`, the Deeds paragraph and the visibility table.
- Vera's read, `engine/allies-in-fights/vera-clickable-names.md` (project files).
