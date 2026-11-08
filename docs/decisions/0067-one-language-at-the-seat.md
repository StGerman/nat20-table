# 0067. A player's seat shows one language: the run's

- **Status:** Accepted (table #336, 2026-11-08)
- **Date:** 2026-11-08
- **Decided by:** Stas, in the planning thread, 2026-11-08 22:24Z, answering question 2 of the M12 scope: «Переводим строки стола на язык прогона - Да. Вера читает но оба языка вмешаны ломает вайб» ("Yes, translate the table's lines into the run's language. Vera reads both, but mixing the two breaks the mood").
- **Supersedes:** [0038](0038-agents-write-the-run-language.md), in its "the engine and the UI stay English" half. The agents keep writing the run's language, as 0038 decided.

## Context

Decision 0038 put the agents' prose in the run's language (`--lang ru`) and kept every other line English: the engine's event lines, option names, card text and the UI's labels and prompts. It said the mixed screen would show whether more was worth the cost. Its revisit trigger has now fired.

In exit pair 3 of Milestone 11, the Vera fallback on Stas's Russian run stopped at English lines inside the Russian game. AGT-98 lists them:
- `Scene twb_wendmouth loaded in explore mode`;
- `npc:fenn_lusk pays bren 2 gold pieces in wages`;
- `The party loses 240 minutes`;
- `[r56] ... 1d20 (10) = 13, failure`;
- the English card text.

Stas played the same run and wants one language on the screen.

## Options

### A. Keep 0038: English engine lines, options, cards and UI
- Pro: no work.
- Con: a mixed screen. The Vera read and Stas both stop at it.

### B. The UI's labels and prompts in the run's language (0038's B)
- Pro: a few days of TypeScript string work, and no contract change.
- Con: engine lines, option names and card text stay English, so the screen stays mixed where it matters most.

### C. The table renders everything the seat shows in the run's language
The UI strings, the engine's lines, option names, and card and choice text all appear in the run's language. The table renders engine lines from the events' fields, not from the server's English text. The packs carry card and choice text per language. The wire keeps English ids and text, so Rule 1 needs no locale.
- Pro: one language at the seat, with no contract change and no change to core.
- Con: Russian text for every card and choice in both road packs. That is content work with Zoya's board check and a Vera read.
- Con: every engine line the seat shows needs a template in each language.

### D. A locale in the engine contract (0038's C)
- Pro: the server renders every line once, for any client.
- Con: a contract change under Rule 1, plus Russian names for every option, condition and creature in the server. It is the most work for the same screen as C.

## Decision

C, as the target: a player's seat shows one language, the run's. Whether a line is translated, hidden or explained (AGT-98) is decided per line, and "translated" is the default for every line a player needs. Roll lines keep their roll ids, because the audit cites them (Rule 4). The system design for Milestone 12 picks the mechanism inside C: event templates, pack text per language, and what an English run keeps byte for byte.

## Consequences

- **AGT-98** grows from M to L. A new row covers Russian text for the cards and choices of *Fair in Wend* and *The Way Back* (scope `not-a-passenger-scope.md` §7).
- **The own-move line** ("Something else: say it in your own words.") is written in each run language.
- **English runs stay byte for byte**, so prompts stay cached and fixtures replay.
- **The guards** keep 0038's Russian number words and stat terms. Their Latin-word rule (AGT-73) now covers table lines too.
- **The wire, core and the registry ids stay English.** Rule 1 and the contract are unchanged.

## Revisit when

- A third run language is asked for, so per-language pack text becomes a maintenance cost; or
- a non-terminal client is planned (decision [0016](0016-client-contract-deferred.md)) and wants rendered lines from the server, which brings back D.

## Sources

- AGT-98 in `TASKS.md`; the exit pair 3 analysis of Stas's run in the project files, `engine/m11/runs/full-2026-11-08T20-11-16-308Z/analysis.md`.
- Decisions 0016 and 0038, and AGT-73 in `docs/tasks-done.md`.
