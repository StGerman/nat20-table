# 0064. Numbers and game words at the table; hidden values still never

- **Status:** Proposed (accepted when Stas merges table: AGT-95)
- **Date:** 2026-11-07
- **Decided by:** Stas, in the storytelling bible thread, 2026-11-07 17:22Z ("create a task to remove 'no numbers or jargon on screen'"). How far the removal goes (option B, keeping hidden values out) is Claude's reading of Rule 3, for Stas to confirm in the PR.

## Context

Since Milestone 6 (spec §3.5, TASKS.md AGT-20) the narration and speech guards in `game/src/table/guards.ts` refuse any digit outside a roll citation, number words from ten up (English and Russian), and every game-statistic term (Armor Class, DC, Hit Points, КД, СЛ, хиты and so on) in what the DM and the AI players say to the table. The prompts repeat it: "No numbers", "No game statistics", "No numbers or game terms".

The rule did two jobs:

1. **Style:** the table reads as a story, not a character sheet. The storytelling bible lists it among the always-on laws as "no numbers or jargon on screen". Stas asked for it to be removed. Without it the DM can name prices, coin, distances, days and counts, and say a game word when it is the plain one.
2. **Visibility (Rule 3):** HP, AC, DCs, roll targets and stat blocks never reach a player view, free text included. The DM's `get_state` carries every creature's Hit Points and Armor Class and every check's DC, so a DM that may say any number may also say "the goblin has 3 HP left". The blanket number ban was the only thing between that and the table while the game runs; the leak scan (`crates/nat20-duel/src/leak_scan.rs`) catches it only after the run, and only in English.

## Options

### A. Remove the guard's number and game-term checks entirely
- Pro: the simplest change, and exactly the words of the request.
- Con: breaks Rule 3 at run time. Nothing stops the DM saying a creature's Hit Points or a DC, and in a Russian run nothing catches it afterwards either.

### B. Lift the style ban, keep a narrow hidden-value guard
- Pro: numbers and game words are fine everywhere the table may know them: coin, days, distances, counts, a roll's total, "advantage", "bloodied".
- Pro: Rule 3 keeps a structural check. A number in the same clause as Armor Class, AC, DC, Difficulty Class, Hit Points, HP, an attack or save bonus or a challenge rating (English and Russian, digits or words) is refused, as is a roll written with its modifiers (`14 + 5 = 19`).
- Con: a hidden number said without its statistic's name ("you needed a fifteen") passes the guard. Only the DM prompt stops it, and the leak scan only reads English. The old rule caught it whenever the number was ten or more.
- Con: a public number beside a statistic's name is refused too ("Maren heals 7 hit points"). The engine's lines already show it, so the DM rewrites it in words.

### C. Keep the rule as it is
- Pro: no change to a guard that has held since Milestone 6.
- Con: not what Stas asked for.

## Decision

B. Rule 3 is in CLAUDE.md and outranks a style rule. Lifting the style half keeps every hidden value out of the table's text at run time, at the cost of one gap the old rule closed only by accident (a bare number with no stat word).

## Consequences

- `game/src/table/guards.ts`: `numberIn` and `statTermIn` give way to `hiddenNumberIn` (a number within four words of a statistic's name, in one clause) and `rollModifiersIn`. Mixed-script words, Latin words in a Russian run, DM-only ids and unknown roll citations are refused as before.
- The DM prompt's "What the table may hear", the narrate and remember tool texts, the AI player's speak tool, the Russian lines in `game/src/agents/language.ts`, the closing, night and pay wakes in `game/src/table/loop.ts`, and *Fair in Wend*'s Saltmouth prose stop saying "no numbers"; they say which numbers stay the engine's.
- Unchanged: Rule 3, the visibility table in `contract/protocol.md` (enemy health stays a band), the leak scan, the roll citation rule (Rule 4).
- The storytelling bible's Guardrails list marks "no numbers or jargon on screen" as removed and keeps "hidden values never reach a player (Rule 3)".
- TASKS.md AGT-95; AGT-20 notes that its number and game-term refusals were narrowed by it.

## Revisit when

- A run's leak scan or a reader of a Russian transcript finds a hidden value said without its statistic's name: then the guard needs the scene's actual hidden numbers (DCs, Hit Points, Armor Class from `get_state`) to refuse them by value.
- The narration judge or a Vera test finds the table reading like a character sheet: then the style rule comes back in the prompt, not the guard.

## Sources

- Storytelling bible, thread "Storytelling bible", Stas 2026-11-07 17:22Z.
- CLAUDE.md Rule 3; M6 spec §3.5; TASKS.md AGT-20, AGT-95.
