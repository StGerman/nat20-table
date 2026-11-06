# 0060. Milestone 9 closes on the exit pair on one build, e730916

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Stas, in the "M9 exit run 2" thread: the all-AI run without a roster counts as the pair's first run (2026-11-06 14:19Z); «Мой вердикт PASS!» ("My verdict: PASS!", 14:56Z), dismissing judge flag n28-1

## Context

The Milestone 9 exit (scope `docs/scope/living-world-scope.md` §5, TASKS.md AGT-81) asks for two runs of *Fair in Wend* on one build, one all AI and one with Stas as a Hired Blade. In each run: 3 game days in 120 minutes; at least 2 journeys, the escort contract done with the pay in the ledger, 1 road event and 1 fight outside a scene; the party arrives with the previous run's roster; every roll cited, the ledger trial balance and the roster hash chain hold; 0 leaks; p95 reported against the phase 0 baseline, not gated.

Exit run 1, `full-2026-11-05T20-35-06-078Z` on table #276, failed only on the fight row: no road card led to a fight. Stas fixed the Millbeck bridge as a stop that always comes up (table #282, B8/B9). Fixes B1 to B7 and B10 to B13 from his 2026-11-05 run are table #270 to #281. Run `2026-11-05T21-54-16` on the same build is void, because it hit the plan's usage limit.

The pair, both on table e730916 (head of table #282, top of the stack table #223 to #282), clean tree, engine 3220a7f, contract 1.0.0-dev.57, in StGerman/nat20-runs:

| Run | Command, seats | Result |
|---|---|---|
| `full-2026-11-06T07-29-50-016Z` | `play:unattended`, all AI (DM Opus 5.5 low, players Sonnet 5.5 medium), seed 1992336017, no roster | **PASS**: D1 16:00 to D3 07:40 in 11.6 min; 4 legs; 8 `wage` entries from `npc:odda_vell`, 6 gp each, `escort_settled`; 4 cards; fight on the Millbeck card (argue failed, 2 Bandits); 32 of 32 rolls cited; `m9-ledger` pass; 0 leaks; 0 judge flags; 4 retries, 0 fallbacks |
| `full-2026-11-06T14-21-09-933Z` | `play:demo`, Stas as the human's character, seed 2999792424, roster `wend` | **PASS**: contract settled on day 3 in 26.1 min; 4 legs; 6 gp each; 4 cards; fight on the night card `night_wolves`; roster loaded 375a84da2a03 (saved by exit run 1), chain held, saved 49e55c5770fd; 27 of 27 rolls cited; `m9-ledger` pass; 0 leaks; 2 retries, 0 fallbacks; judge flag n28-1 dismissed by Stas |

p95 against the phase 0 baseline (AGT-77 on 2026-11-01: players 9.4 s, DM 9.8 s): AI player combat p95 8.2 s and 4.2 s, DM narration p95 2.7 s and 2.4 s. The talk round p95 was 45.5 s and 24.5 s, against a 20 s target.

## Options

### A. Close Milestone 9 on this pair
- Pro: every gating row passes on both runs, on one build, each judged by Stas. The roster row holds where a roster can be carried: the human run continued exit run 1's roster with the chain intact. The verdict code allows the pair's first run to start a new party.
- Con: the all-AI run carried no roster, so scope §5 item 3 holds in one run of the two. n28-1 (the DM tells Odda's arrival pay twice, the engine pays once) is a narration slip that Stas dismissed rather than fixed.

### B. Replay the all-AI half with `--roster wend`
- Pro: meets item 3 in both runs.
- Con: one more run on an old head while 59 PRs wait. It tests nothing that the human run's chain has not already shown.

### C. Confirm n28-1, fix the double pay on the stack, and replay the pair
- Pro: a stricter standard on row 3. The Demo confirmed n71-1 on the same grounds.
- Con: a fix and two runs for one line of prose. The cause (the `road` wake narrates `wage` events again) is not proven from the record.

## Decision

A. Stas counted the all-AI run without a roster as the pair's first run (2026-11-06 14:19Z) and ruled the human run PASS with n28-1 dismissed (14:56Z). Milestone 9, Living world, is done.

## Consequences

- **Merge:** the stack table #223 to #282 and this record merge bottom-up, with no new commits on the stack. Findings from the exit runs do not go into the stack.
- **`TASKS.md`:** AGT-81 is done, and so are the other Milestone 9 rows built in the stack. Each keeps its "Left:" note as a known gap. Six rows were not needed by the exit and leave Milestone 9 without a new milestone, until the next milestone's spec takes them or Stas places them:
  - AGT-25 and AGT-68: the phase 0 latency levers. The DM's p95 is now 2.4 to 2.7 s against the 6 s target, so the reason for both is gone for now.
  - AGT-73: English in a Russian run. It is partly covered by table #280, which rejects an AI player line with no Cyrillic in a Russian run.
  - AGT-74, AGT-75, AGT-76.
- **Post-merge findings, no rows yet** (regulate first):
  - F1: the Millbeck argue choice says the brothers swing first, which gives away the outcome and is not enforced. This is the card-text rule of the Faces of the Road deck.
  - F2: the world clock stands still in place scenes.
  - F3: `say` to an NPC is refused on the first try.
  - F4: «оилскиновый плащ» should be «промасленный плащ».
  - F5: n28-1, the `road` wake narrates `wage` events again.
  - F6: Russian place names drift.
  - F7: Latin in a Russian intent.
  - F8: «Брентом».
  - F9: the merchant overrides a unanimous vote on the mud card with no hint to the human.

  Each is proposed to Stas before it gets a row.
- **Talk round p95** (45.5 s and 24.5 s against 20 s) is reported, as Milestone 10 follow-ups are. It gates nothing here.
- **`CLAUDE.md`:** Milestone 9 reads done and cites this record.
- **Scope and design** (`docs/scope/living-world-scope.md`, `docs/design/m9-system-design.md`) stay as written.

## Revisit when

A later milestone loads a roster that an all-AI run saved and the chain breaks, or the double-pay narration (F5) recurs in a run whose verdict Stas confirms. Either one reopens item 3 or row 3 for the living world.

## Sources

- StGerman/nat20-runs: `runs/full-2026-11-06T07-29-50-016Z/`, `runs/full-2026-11-06T14-21-09-933Z/` (each with `verdict.json`; the second with `confirmations.json`, nat20-runs #5); exit run 1 `runs/full-2026-11-05T20-35-06-078Z/`.
- Table #223 to #282 (the Milestone 9 stack); table #276 (exit run 1's build); table #282 (the Millbeck bridge).
- Decisions 0043, 0056, 0057, 0058, 0059.
