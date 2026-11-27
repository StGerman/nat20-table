# 0087. A lie lives only in a character's quoted speech

- **Status:** Proposed
- **Date:** 2026-11-15
- **Decided by:** Stas accepted the rule on 2026-11-14 12:03Z in the feedback thread («Да давай но пожалуйста сделай проверку через Веру»). Vera read a sample the same day. This record's wording is drafted by Lev Neiman and is accepted when Stas merges it.

## Context

A milestone is planned around a place that is not what the people in it say it is. The table then has to carry a falsehood to the player without the game itself lying. Facts checked:

- Rule 3 already keeps hidden truth out of every player view. It says nothing about a false statement in one.
- A player has two kinds of text on the screen: what the game says in its own voice (the narrator's sentences, card text, choice text, table lines, the map, the sheet) and what a person in the story says.
- The narration judge checks each narration line against engine state. A narrator's sentence that repeats a character's false claim would be a contradiction it flags, or, worse, one it cannot see because the engine holds no such state.
- Vera, given the sample with no notes, took the place for a trap by herself. Her one condition: the line that says where the party is must be exact, which bank and how far to the border. Without it she could not tell a lie from a mistake of the game's.

## Options

### A. The narrator may be unreliable
- Pro: the strongest surprise when the truth comes out.
- Con: after the first time, the player cannot trust any line the game says, the place line and the sheet included; the judge has nothing to check a narrator's sentence against; Vera reads it as the game being wrong.

### B. A lie lives only in a character's quoted speech
- Pro: the game's own voice stays true everywhere, so the player can always check a person's claim against the screen; the judge's rule stays one rule; a test with no model can scan authored text for it.
- Con: an attentive player sees the lie early, so a design cannot rest on the player being fooled; it has to rest on what the player does about it.

### C. No falsehood on screen at all
- Pro: nothing to check.
- Con: no person in the story can deceive anyone, which removes the milestone and most intrigue after it.

## Decision

B. No player view, card text, choice text, table line, place name or sentence in the narrator's own voice states a false fact. The narrator may quote a named person saying it, and may report truly that the person said it. Where a person's claim is about where the party stands, the place line beside it is exact: which bank, how far to the border. It beat A because a player who cannot trust the screen stops reading it, and C because it keeps people able to lie.

## Consequences

- A pack that holds a falsehood lists its false facts, and a test with no model checks that every match in the pack's player-facing strings lies inside quoted speech that names its speaker.
- A check that looks into a falsehood returns a detail, never the verdict. The verdict is the player's.
- The truth behind the falsehood is scenario data, DM only (Rule 3, unchanged).
- A live DM is tried on it before a run: the card bench or `play:scene`, with the lines a player would say.
- The storytelling bible gains the line in its own PR (Zoya).
- A design cannot assume the player is deceived. It must still give a choice to a player who saw through it on the first screen.

## Revisit when

A blind reader takes a quoted lie for the game's own statement, or the narration judge flags a correctly quoted lie as a contradiction twice in one exit pair.

## Sources

- `docs/scope/kamen-a-scope.md` §2 item 4; `docs/design/kamen-a-system-design.md` §4, §9, §10 rule 7.
- The feedback thread of 2026-11-14 (Stas 12:03Z; Vera's read of the sample, the same day).
