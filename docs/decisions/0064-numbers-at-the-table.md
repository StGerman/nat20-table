# 0064. Numbers and game words at the table; hidden values still never

- **Status:** Proposed (accepted when Stas merges table: AGT-95)
- **Date:** 2026-11-07
- **Decided by:** Stas, in the storytelling bible thread, 2026-11-07 17:22Z ("create a task to remove 'no numbers or jargon on screen'"). How far the removal goes (option B, keeping hidden values out) is Claude's reading of Rule 3, for Stas to confirm in the PR.

## Context

Since Milestone 6 (spec §3.5, TASKS.md AGT-20) the narration and speech guards in `game/src/table/guards.ts` refuse any digit outside a roll citation, number words from ten up (English and Russian), and every game-statistic term (Armor Class, DC, Hit Points, КД, СЛ, хиты and so on) in what the DM and the AI players say to the table. The prompts repeat it: "No numbers", "No game statistics", "No numbers or game terms".

The rule did two jobs:

1. **Trust and style:** the ban came in when the engine had no coin, so any amount the DM said was the DM's own arithmetic, and nobody wanted to trust a model with sums (Stas, 2026-11-07 17:41Z). It also kept the table reading as a story, not a character sheet; the storytelling bible lists it among the always-on laws as "no numbers or jargon on screen". Since Milestone 9 the engine owns money: purses, the ledger, the escort's pay, every give, steal and loot is a `ledger` event. Stas asked for the ban to be removed. Without it the DM can name prices, coin, distances, days and counts, and say a game word when it is the plain one.
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

- **The replacement rule for the DM:** every number comes from the engine, never from the DM. The DM names coin, a price, days or a distance only as an engine event, `get_state` or the scene shows it, and never adds, splits, converts or works one out ("six gold, two a day for three days" is the DM's arithmetic, so it is out). A character's purse is owner and DM data (protocol §5), so the DM names it only to that character. The guard can't check arithmetic; the prompt says it, and the narration judge and the audit's "no narration contradicts engine state" (scope §6.3) are where a wrong sum shows.

- `game/src/table/guards.ts`: `numberIn` and `statTermIn` give way to `hiddenNumberIn` and `rollModifiersIn`. `hiddenNumberIn` refuses a number (digits, words, hyphenated words, glued as in AC15) within ten words of a statistic's name in the same clause. Commas and sentence marks end a clause; colons and dashes don't. "Health" and «здоровье» count as Hit Points. A bonus and "to hit" count only with a signed number (+4). `rollModifiersIn` refuses `14 + 5 = 19`, `19 (14 + 5)`, `19 (14 - 1)`, `1d20+5` and `[r7]+5`. "Save bonus" and "CR" count as their long forms.
- The reach is a trade. Ten words catch "The Armor Class of the goblin standing by the door is 15". They also refuse some ordinary prose, such as "Hit points matter little when three wolves circle" or «Бард спел три хита», and each refusal costs the agent a rewrite. So does a bare range in brackets right after a number ("day 2 (3-4)"), which reads like the engine's own negative modifier "19 (14 - 1)". The other way round, a cited roll with a spaced modifier in mid-clause ("[r3] + 5 against the goblin") passes, so that "[r3] + 2 more wolves come" stays prose. Mixed-script words, Latin words in a Russian run, DM-only ids and unknown roll citations are refused as before.
- The DM prompt's "What the table may hear", the narrate and remember tool texts, the AI player's prompt and speak tool, the Russian lines in `game/src/agents/language.ts`, the closing, night, pay and road-card wakes in `game/src/table/loop.ts`, and *Fair in Wend*'s Saltmouth prose stop saying "no numbers"; they say which numbers stay the engine's.
- Unchanged: Rule 3, the visibility table in `contract/protocol.md` (enemy health stays a band), the leak scan, the roll citation rule (Rule 4).
- The storytelling bible's Guardrails list marks "no numbers or jargon on screen" as removed and keeps "hidden values never reach a player (Rule 3)".
- TASKS.md AGT-95; AGT-20 notes that its number and game-term refusals were narrowed by it.

## Revisit when

- A run's leak scan or a reader of a Russian transcript finds a hidden value said without its statistic's name: then the guard needs the scene's actual hidden numbers (DCs, Hit Points, Armor Class from `get_state`) to refuse them by value.
- The narration judge or a Vera test finds the table reading like a character sheet: then the style rule comes back in the prompt, not the guard.

## Sources

- Storytelling bible, thread "Storytelling bible", Stas 2026-11-07 17:22Z.
- CLAUDE.md Rule 3; M6 spec §3.5; TASKS.md AGT-20, AGT-95.
