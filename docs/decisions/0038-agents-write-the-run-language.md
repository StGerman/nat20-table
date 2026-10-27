# 0038. The agents write the table's prose in the run's language; the engine and the UI stay English

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas, on a decision card in the Milestone 6 implementation thread ("Agents speak Russian")

## Context

Stas asked for Russian as the main output language for every participant, starting with the scripted terminal run (`npm run play:scene -- --seat ink --dm scripted --players scripted`). Nothing in that run is written by a model. Every line comes from one of four English sources:

- the engine's event text, rendered in Rust by the server;
- the option names, from core's registry;
- the scripted DM's fixed lines;
- the terminal UI's labels, help and prompts.

In a model run, most of the prose comes from the DM's narration and the AI players' speech. The narration and speech guards (AGT-20) caught digits in any language, but they caught number words and game-stat terms only in English.

## Options

### A. The agents write Russian (`--lang ru`)
- Pro: small, and ready before the exit run. A prompt section for the DM and for each AI player, plus Russian number words and stat terms in the guards.
- Pro: the English run is unchanged byte for byte, so prompts stay cached and fixtures replay.
- Con: a mixed screen. Russian narration and speech next to English engine lines, option names and UI.
- Con: scripted runs stay English.

### B. A, plus the terminal UI in Russian
- Pro: everything the human reads around the game lines is Russian.
- Con: a few days of TypeScript string work. Engine lines and option names stay English.

### C. Everything in Russian
- Pro: one language on screen, scripted runs included.
- Con: large. It needs a locale in the engine contract (Rule 1), Russian rendering of every event in the server, and Russian names for every option, condition and creature. It would push the exit run back.

### D. English until after the exit run
- Pro: no work now.
- Con: Stas can't play in Russian.

## Decision

A. It is the cheapest way to get Russian prose into the exit run. The mixed screen will show whether B or C is worth its cost.

## Consequences

- `play:scene`, `play:exit` and `play:ai-party` take `--lang en|ru`, default `en`. The report says the language when it isn't English.
- `game/src/agents/language.ts` holds the prompt sections. English adds nothing to a prompt.
- The guards check Russian number words from ten up and Russian stat terms in every run. English text is unaffected.
- Tool inputs stay the ids the tools take. The engine's lines, options and the UI stay English. The human may type in either language: the DM maps the words.

## Revisit when

- The exit run in Russian reads badly because of the mixed screen. B or C then comes back.
- Someone other than Stas plays (beta), and the language becomes a product choice rather than a run flag.

## Sources

- Decision card in the Milestone 6 implementation thread, 2026-10-27.
- `game/src/table/guards.ts` (AGT-20); M6 spec §3.5.
