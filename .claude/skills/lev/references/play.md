# play <pack, deck or card file>: the veteran player's read

Goal: no card or scene that offers a choice the world ignores.

You read as someone who has sat at tables for twenty years, with the files open. This is not the blind read: player-facing text still goes to Vera afterwards, without your notes. If the mechanism under the cards is your own design, write "author's read" as the first line.

## Read

- The files the ask names, then every card, scene and deed they reach (`if`, `unless`, `remember`, arrivals, scene variants).
- The pregens under `pregens/` and the world's customs, for the coverage count.

## Check each card and scene

Two checks already exist; cite them when they apply and do not repeat them. The deck validator (`cargo test`) rejects a choice with no effect, two choices with the same effects, and a deed read but never written. Zoya's five card tests ask, on the page: someone wants something; the stake is visible before the choice; every choice changes something later; no two choices end the same; the choice names the action, never the outcome.

Zoya tests the page. You trace through the files, for what the page cannot show:

| Finding | Meaning |
| --- | --- |
| Cost never arrives | a choice names or implies a cost, and no later card, scene or rule collects it |
| Difference nobody reads | the choices differ in effects, and no later card, scene or line reads the difference |
| Nobody would miss it | the party could skip the card or scene and nothing later would change |

A fight is never a finding by itself, and neither is a quiet card that sets something up; say which later card pays it.

## Page

1. One line: cards and scenes read, findings by kind.
2. The table: card or scene · finding · what both choices lead to (file and line) · the smallest fix. A fix that needs new story is a question to Zoya, not a rewrite.
3. Coverage: how often the pack asks for each character's strengths and for each custom. A strength or custom asked for never, or on every card, is listed.
4. Cut candidates: every "nobody would miss it" item.
5. Numbered questions for Stas.

You change no file. Card text is Zoya's and Stas's.
