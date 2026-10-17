# 0006. Strict player roll view: players never see an AC or DC

- **Status:** Accepted
- **Date:** 2026-10-16 (reconfirmed by Stas 2026-10-17)
- **Decided by:** Stas, contract decision 5 (2026-10-16), reconfirmed in the project chat 2026-10-17 ("Strict sounds valid for AI")

## Context

A roll has dice, modifiers, a total, a target (`against`: AC or DC) and the DC's source. The DM sees all of it. The question is what a player sees. Example: Bren attacks a goblin with AC 15 and rolls 19.

## Options

### A. Strict (built): every player, the roller included, sees dice, total and outcome; never an AC or DC
- Pro: already built and tested; no extra work.
- Pro: one player view for every roll, no per-player cases, the simplest rule to keep leak-proof.
- Pro: players cannot reverse-engineer monster stats; a Goblin Boss's save DC reveals its ability modifier.
- Pro: the DM keeps the drama ("you failed" versus "you missed by 1").
- Con: stricter than many tables, where the DM announces save DCs; the human player may find it opaque.
- Con: hides "goblin rolled 16 vs AC 17", although the player knows their AC from their sheet.

### B. Draft default: a player also sees their own AC when attacked and the DC of their own saves
- Pro: closer to most tables ("16 vs AC 17, miss"); a player can judge whether a +2 would have mattered.
- Con: more code: a third ("owner") roll view, ownership checks per roll in `projection.rs`, new fixtures, a contract change.
- Con: leaks a little: save DCs reveal monster ability modifiers to a metagaming AI.
- Con: an AI player decides nothing differently for knowing it missed by 1.
- Con: scenario check DCs stay hidden either way, so the table feel is only partial.

## Decision

A. Cheaper and safer for an AI-heavy table. Players read their own modifiers and AC from their sheet.

## Consequences

- `RollView` has a `full` variant (DM only) and a `player` variant (dice, total, outcome).
- The hidden AC or DC is still in the DM log and the audit ([0005](0005-engine-rolls.md)).

## Revisit when

The human player finds rolls too opaque in a playtest (Milestone 6 or 7). Moving to B is an additive contract change (a new owner view), so nothing is locked in.

## Sources

- `contract/protocol.md` decision 5.
- Thread "Engine API contract review", replies of 2026-10-17 10:33Z and 10:39Z.
