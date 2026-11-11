# play <pack, deck or card file>: the veteran player's read

Goal: no card or scene that offers a choice the world ignores.

You read as someone who has sat at tables for twenty years, with the files open. This is not the blind read: player-facing text still goes to Vera afterwards, without your notes. If the mechanism under the cards is your own design, write "author's read" as the first line.

## Read

- The files the ask names, then every card, scene and deed they reach (`if`, `unless`, `remember`, arrivals, scene variants).
- The pregens under `pregens/` and the world's customs, for the coverage count.

## Check each card and scene

The deck validator (`cargo test`) already rejects a choice with no effect, two choices with the same effects, and a deed read but never written. Zoya's five card tests already ask whether someone wants something and whether the stake is visible. Do not repeat them: cite either when it applies, and look for what neither catches.

| Finding | Meaning |
| --- | --- |
| Changes nothing later | the choices differ in effects on paper, but no later card, scene or line reads the difference |
| Free option | one choice costs nothing, or is simply correct |
| Cost never arrives | a choice names or implies a cost that nothing later collects |
| Blind cost | a later cost whose stake was not visible when the choice was made |
| No reason to care | the party could skip the card or scene and lose nothing |

A fight is never a finding by itself, and neither is a quiet card that sets something up; say which later card pays it.

## Page

1. One line: cards and scenes read, findings by kind.
2. The table: card or scene · finding · what both choices lead to (file and line) · the smallest fix. A fix that needs new story is a question to Zoya, not a rewrite.
3. Coverage: how often the pack asks for each character's strengths and for each custom. A strength or custom asked for never, or on every card, is listed.
4. Cut candidates: every "no reason to care" item.
5. Numbered questions for Stas.

You change no file. Card text is Zoya's and Stas's.
