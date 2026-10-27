# Exit run, 2026-10-27, Russian: findings

`npm run play:exit -- --lang ru` on Stas's Mac. Seed 1895774112. Scenes 1 and 3 of The Silent Mill. The DM ran at medium effort; Torva, Maren and Ilsa ran on the player model at low effort; Stas played Bren in the terminal.

This folder holds the run's records: `report.md`, `transcript.jsonl`, `engine-log.jsonl`, `session-log.jsonl`, `inputs.jsonl` (what every seat was given) and `usage.jsonl`. Model identifiers are replaced by `dm-model` and `player-model`, and `engine-stderr.log` is left out because it holds a local path. The causes below were checked against the engine log, and the run replays exactly on core 59bc67b (883 requests, 0 divergences).

To check it again: `cargo run -p nat20-duel --bin nat20-audit -- --pack scenarios/the_silent_mill docs/milestones/m6-exit-run-2026-10-27`.

## Outcome: the Milestone 6 exit run passed

- Both scenes were played. Scene 2 was passed over, as planned.
- The party won the yard fight: six rounds, eleven creatures. Maren dropped once, and Torva's potion brought her back.
- The last goblin surrendered and became the captive (goblin_4, "Снитт"). The run stopped at Scene 4, as planned.
- **Audit: 72 engine rolls, 72 cited, 0 problems** (894 transcript lines).
- **Leak scan: 657 inputs to the four seats, 19 DM-only ids, 0 leaks.**
- The prose was Russian throughout, and the engine lines stayed English (decision 0038).
- The engine refused none of the human's decisions.

## Numbers against the acceptance targets (scope §6)

| Measure | This run | Target | |
|---|---|---|---|
| DM narration p50 / p95 | 4.1 s / 5.96 s (44 narrations) | p95 ≤ 6 s | met, at medium effort |
| AI player turn p50 / p95 | 7.7 s / 14.8 s (26 turns); Torva p50 11 s, max 18 s | p95 ≤ 10 s | missed |
| Retries / fallbacks | 3 / 5 | every rejection recovers within 2 retries | 3 retries are API-35; the fallbacks are below |
| DM timeouts (12 s) | 4: Scene 1 opening, the table turn that loaded Scene 3, two mappings of Bren's words | none | each timed out on its closing model call, after its tools had run. The report calls them "skipped", but the work was done. One cost: the yard was described twice |
| Run length / API-equivalent | about 31 min / $5.55 | Demo Run ≤ 120 min | — |

## Findings

| # | What happened | Cause (from the engine log) | Row | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | The DM narrated Bren next to a goblin he wasn't next to, four times. (a) Round 4: Dash and a move, narrated "встаёт вплотную". (b) Round 5, opening Bren's turn: "ты стоишь вплотную", which the DM then took back itself ("Поправка к прошлому"). (c) Round 6: "подходит через весь двор, приседает" after 4 ft of walking. (d) "остаётся над гоблином" at 21 ft. | The DM prompt didn't say that positions are the engine's. Every one of these moves was cut short by #2 or #4, and the DM narrated the intent instead of the result. | AGT-9 | table #125, merged: no narrated move without `move`. The structural check stays AGT-9. | done / M |
| 2 | Moves cut short with nobody provoked. Round 4: Bren Dashes (60 ft) and moves to goblin_4; the engine answers `moved_ft: 4.2, provoked: []`. Round 5: Torva Dashes and moves 6.4 ft. The DM's first `move` to goblin_4 was refused whole twice, on "Not enough movement left" (API-35). | API-35 for the refusals. The short walks were explained by a replay: all 883 requests were replayed on core 59bc67b with seed 1895774112, with 0 divergences. Core stops a walk where it leaves an ally's reach (Torva's for Bren; Ilsa's for Torva) because `calculate_opportunity_attack` skips the line-of-sight check. Then `collect_reactions` does need line of sight, and the reactor can't see the mover past a creature, so no window opens and the walk simply ends. | API-35, ENG-22 | The refusals are API-35. The short walks are fixed with ENG-22: a walk goes on after a reaction window, and also when no window opened. | M |
| 3 | When no foe is within reach this turn, "Longsword attack…" opens a list of party members only (torva, maren, ilsa), twice. Stas then typed his intent. | `choices.ts`: quick lines take hostile targets. The engine lists only targets reachable this turn, so with no hostile, the follow-up pick holds only allies. | new | Ours, small: with no foe in reach, don't offer an attack that lists only allies. Show the foes beyond reach with "Dash or Move first". | S |
| 4 | **Every reaction window in the fight was party against party: 10 of 10.** Bren was offered an Opportunity Attack on Torva. The AI players were asked 9 times, about each other, and each answer is a model call (5 to 14 s). Seven walk-first options were dropped: Torva's potion; Maren's Sacred Flame three times; Ilsa's Fire Bolt twice, which cost her the round 7 turn; and Bren's attack in round 6. Bren's round 5 and 6 walks stopped at Ilsa, Maren and Torva in turn. | Core treats every combat participant as a potential reactor, allies included (`get_potential_reactors`). A walk stops where it provokes (protocol §4.1, ENG-18). The walk-first option is dropped (API-31). In SRD 5.2.1 an Opportunity Attack may target any creature, and the mover goes on after it. | API-31, ENG-18 | Two parts, needs a spec. (a) Our seats decline a reaction against an ally with no model call, as table #120 did for the scripted seat; the human keeps the choice. (b) After a reaction window closes, the walk goes on and takes the option it carried. That needs core (fork) plus protocol §4.1. The non-RAW alternative is core skipping allies as reactors. | M |
| 5 | Words that were only talk on Bren's combat turn ("ask the goblin what they're doing here"). The DM answered in fiction and asked a question, and then the table said "Not understood: I didn't get that; pick from /options". | `loop.ts mapHumanWords` falls back whenever the DM took no engine action, even when it narrated or asked. It also counts as a fallback (1 of the 5), which skews acceptance §6.5. | new | Ours, small: no "Not understood" and no fallback when the DM narrated or asked. | S |
| 6 | The goblin surrendered in the DM's narration in round 6 while the fight went on. Next turn it used Nimble Escape and shot Bren. Bren's list still had only attacks, with no line to accept the surrender, so Stas typed it ("принимаю его сдачу", then `goblin_4 surrenders`). | The engine offers the surrender (API-22: `surrender_available`). The DM narrated the offer and asked Bren. The engine still plays the goblin as hostile until `end_combat`. | API-22 (done) | Design: while a surrender is offered, the goblin holds, and Bren's list gets "Accept the surrender of goblin_4". Needs a spec. | M |
| 7 | Dead creatures still get turn lines ("goblin_2's turn ends." after it died; the same for wolf_1, wolf_2, wolf_3). | Core keeps the dead in the initiative order; the server logs their empty turns. | new | Ours: don't show a dead creature's turn lines. | S |
| 8 | "Встать в боевую стойку и приготовиться к защите" is the Dodge action. It isn't on offer. This time the action had already gone to Dash, so it changed nothing. | Core has no Dodge. | ENG-19 | As planned. | S |
| 9 | The AI players answer the human in parallel, each as if alone: no replies to each other, no silence, no reactions to what others do. | M6 design: one declaration per player per wake. | design thread | "Design party talk: players react to each other". | — |
| 10 | A DM wake that does several tool calls times out at 12 s on its closing call. That happened 4 times, and each is reported as "skipped" although its tools had run. | The 12 s budget covers the whole wake, including the closing model call. | AGT-10 | Count a timeout after the narration as done, not skipped. Drop the closing call (the M7 lever already noted). | S |

## What was decided (Stas, 2026-10-27)

- The findings were accepted. Latency (AI player p95) moves to a later optimisation milestone, which will also cover streaming.
- The fix order: AGT-27 and ENG-22 (spec) for #4; the API-35 replay for #2; AGT-28, AGT-29 and API-37 for #3, #5 and #7; AGT-30 (spec) for #6. All of these rows are in `TASKS.md`.
- Milestone 6's exit criterion holds.
