# 0068. A player's own move on a road card is a choice the table votes on

- **Status:** Accepted (table #339, 2026-11-11)
- **Date:** 2026-11-09
- **Decided by:** Stas chose the own move, variant B of the project note `engine/m11/own-move-on-a-card.md` (2026-11-08 20:39Z: «Да делаем обязательно own move»), and put it in Milestone 12 (scope `docs/scope/not-a-passenger-scope.md`, table #336). This record holds the shape the system design proposes, for him to accept with it.

## Context

In exit pair 3 of Milestone 11, Stas typed his own move on the bridge card and nothing changed: the card offered only its written choices. Variant B lets the DM turn the words into one check from the SRD DC ladder that brings one of the card's own choices on a success and another on a failure, so the engine still rolls (Rule 4) and no outcome is invented. Four questions were left open: how the move meets the vote, which choices it may name, how many tries, and what the world remembers.

## Options

### A. A fourth choice the seats vote on (chosen)
The move joins the card as the choice `own_move`, with the proposer's word given for it. The other seats vote or advise as on any choice; the roll happens only if the card is decided on it.
- Pro: the vote, the caravan owner's call and decision 0062 (the human first) work unchanged; on a caravan card the merchant still decides, as the scope asks.
- Con: a late AI seat's move counts only the seats still to speak, so it seldom wins.

### B. The move rolls at once and decides the card
- Pro: the player's words always matter.
- Con: one seat overrides the others and the caravan owner; 0062's order means nothing once the human speaks.

### C. Forbid naming a choice that has its own check
- Pro: one roll per own move.
- Con: 8 of the 43 cards keep fewer than two choices without a check, so they would get no own move.

### A downed proposer (within A)
- Fail with no roll (chosen): the server rolls only if the proposer is up, and no roll is a failure: the failure choice runs; `own_move_ran` records `roll: null`; the branch keeps the resolution's `by`, as for any choice, not the rollers a deck check's branch takes; one seeded fixture case. Con: the move fails for a reason the words did not cause.
- Withdraw the move when its proposer goes down: con, a new public event and a check on every card call, and the views show a dead move until then.
- Refuse fights while a card waits: con, it refuses scene and arrival fights that start with a card already drawn.

## Decision

A. The move is a choice the table votes on. The success and failure choices must be two different choices offered on the card; a failure may not name a choice that breaks a custom (the engine refuses it) or a deliberate act the words did not ask for (the DM prompt). The named choice runs in full, its own check included. One own move per card, no retry. The world writes the deed `own_move_<card>`, with no result and no words in it.

## Consequences

- The next contract version (dev.68 if API-56 lands first): the DM command `own_move`, the event `card_own_move`, `CardDm.own_move` and `CardPlayer.own_move`, reject reasons `own_move_taken` and `bad_own_move`, and the DM-only events `own_move_set` and `own_move_ran` (TASKS.md API-56).
- The success and failure choices stay DM-only (card test 5). Zoya's board check asks to show them before the vote; the design records that as open for Stas.
- A proposer who is down when the card is decided rolls nothing, and the failure choice runs (design §1.1 step 5).
- `own_move_<card>` has no reader in Milestone 12. Zoya's board lists it as an owed pay-off until the dramaturg mechanism gives it words.

## Revisit when

- A run shows the DM mapping words to choices the words did not earn, more than once.
- The dramaturg mechanism wants a reader for the deed, which needs the player's words or the result in it.

## Sources

- `docs/design/m12-system-design.md` §1 and §12 (Vera and Zoya).
- The project note `engine/m11/own-move-on-a-card.md`; the exit pair 3 analysis of Stas's run, project files `engine/m11/runs/full-2026-11-08T20-11-16-308Z/analysis.md` §3.
- Decisions 0062, 0063, 0067.
