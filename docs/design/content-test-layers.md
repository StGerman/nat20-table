# Content test layers and milestone gates

- **Status:** Proposed (for Stas's review; no TASKS.md rows until accepted)
- **Date:** 2026-11-14
- **Decision draft:** `docs/decisions/0080-content-test-layers.md`
- **Asked by:** Stas, 2026-11-14 06:55Z: the process "looks end-to-end, we need something closer to unit or component tests; be bold"

## 1. The problem, in numbers

Today a card, a DM prompt line and a player prompt line are first tested by a whole playthrough: the exit pair (decision 0043), then an analysis thread.

| | M11 (baseline) | M12 so far (2026-11-14) |
|---|---|---|
| Full runs on milestone builds | 5 | 10 (3 preflight-size, 7 full) |
| Run cost, USD | 35.45 | 44.29 |
| Exit pairs played / passed | 3 / 1 | 3 / 0 (one all-AI half passed under 0074) |
| Stas at the table | 1.09 h | 3.09 h (38 + 120 + 27 min; 81 of the 120 were the table waiting on his seat) |
| Days from scope | 2.12 | 5.15 and open |

Sources: `docs/roadmap.md` § Delivery for M11; for M12, `usage.jsonl` and `run.json` of the ten runs `full-2026-11-12T19-02…` to `full-2026-11-14T01-42…` in nat20-runs `master` 65c0e7c; checked by Yan (fallback agent, 2026-11-14), quoted in §8.

What each failed run actually found, and the cheapest place it could have been found:

| Run | What failed | Found by | Cheapest layer that sees it |
|---|---|---|---|
| M11 pair 1, both halves (13.61 USD, 39 min of Stas) | every *Fair in Wend* arrival needs a deed, so 0 arrivals; no card reads a deed *The Way Back* writes | 2 full runs | L1: a scripted walk of the contract, no model |
| M12 11-13 14:15 and 15:33 (10.73 USD) | 0 AI own moves in 28 card wakes, twice | 2 full runs | L3: the same 28 card wakes alone |
| M12 11-13 16:05 (5.70 USD, 120 min of Stas) | own move: 0, because Stas's real plan came between cards, where no own move exists (the DM read all 4 card lines correctly). Also an English good name, a fight started on a neutral, a `remember` refused after the answer | Stas's run | own move: **nothing below a person at the seat**; the other three: L0, L2, L2 |
| M12 11-14 01:42 (6.95 USD, 27 min of Stas) | `bog_wifes_toll` has no failure the design allows; `salt_on_credit` has no choice the plan could land on, and the DM ruled the outcome with no roll | Stas's run | L0 for the first (a rule over the deck JSON); L2 for the ruling; the missing branch only by a plan nobody wrote down beforehand (L2's plan fuzz, §3, or a person) |

Most of these needed one card, one state and one line, not an hour of play. Two did need a person: a plan said between cards, and a plan no card had a branch for. The layers do not replace Stas's run; they stop it from being spent on the rest.

## 2. The rule

**A defect is caught at the cheapest layer that can see it. A full run confirms; it does not discover.** Two consequences:

1. Every exit row of a milestone names its lowest layer in the design doc. A row may gate on a full run only when no lower layer can see it.
2. Every failure a full run does find becomes a case at a lower layer before the next full run starts. A rerun without a new lower-layer case is not allowed: it is how M12 spent four runs on one row.

## 3. The layers

The own-move names below (`card_words`, `own_move`, `own_move_or_answer`) are from the M12 stack (table #346 to #381), not yet on main.

| Layer | What it runs | Model calls | Where | Cost a run | Catches |
|---|---|---|---|---|---|
| L0 Deck lint | rules over deck, pack and world JSON | none | CI, every PR | 0 | holes in the content's structure |
| L1 Contract walk | engine + scripted DM + scripted seats through a whole contract, many seeds | none | CI, every PR | 0 | unreachable cards, exit rows that cannot pass, loop order |
| L2 DM bench | one card + a fixed party state + one player line, to the live DM | 1 DM wake a case | on demand, one command | about 0.11 USD a case | the DM's reading of words: question or move, skill, DC band, branch, no outcome without a roll |
| L3 Seat bench | one card to the live AI players, N samples | 1 wake a seat a sample | on demand, one command | about 0.10 USD a wake | whether AI players do the thing at all, as a rate |
| L4 Confirming run | one all-AI full run on the exit build | full | Stas's Mac | about 8.5 USD, 15 min | integration: order, timeouts, pacing, the narration judge, the audit |
| L5 Stas's evening | Stas plays once, at milestone close | full | Stas's Mac | about 6 USD, 30 to 120 min of Stas | what only a person can rule: is it readable, is it a game |

Per-wake costs are means from `usage.jsonl` of the two ecd1f9e runs (`dm/card_words` 0.11, `<seat>/card` 0.10 to 0.11), in a warm session; a cold bench pays one cache write (about 0.4 USD on Opus) first.

### L0 Deck lint

`npm run pack:check` already loads a pack through the engine. L0 adds rules that today live only in Zoya's bible and in design prose, as code, with the commandment or design line each one enforces in its message:

- **Own move has room** (M12 design §1.8, as amended by decision 0079 in table #381 if accepted): for every card, the pair the design needs exists. On main's rule (two different choices, the failure never custom-breaking) a 20-line script over the 44 cards finds `peddler` today: 2 choices, 1 of them breaking. `bog_wifes_toll` needs the "deliberate act not asked for" mark that the design says "nothing can test"; the lint makes it testable by one optional boolean on a choice, or 0079 removes the need.
- **A world card fits every quest** (bible, Story-space commandment 8 as table #382 proposes it): a card in `worlds/<id>/deck/` names no client, cargo or destination id of any `campaign.json`.
- **A chain has no dead stretch and one path falls** (Consequence commandment 5 as table #382 proposes it): over the deed graph, no path of three cards in a row where the choice taken moves neither money nor standing, and at least one path loses and goes on.
- **Deeds come back** (Consequence 2): the list of deeds written and never read, as a number per pack. Reported, not gated: the board owns the debt. A throwaway count today: 122 written, 26 read by an `if` or `unless`.
- **A choice names the action** and **2 or 3 choices**: shape rules the engine or Zoya's card test already has stay where they are; L0 only adds what no code checks.

Zoya's board check stays, for what code cannot read: whether the consequence is worth having. L0 takes the countable half off her page.

### L1 Contract walk

The scripted DM and scripted seats exist (`game/src/table/scripted.ts`, `game/test/stand-in.ts`), and CI already replays seeded fixtures with no model. L1 walks each contract end to end over a set of seeds, with seats that vote by a fixed policy (first choice, last choice, seeded random, own move on every card that allows it), and asserts on the run record:

- every structural exit row can pass on at least one seed and fails on none for a structural reason: journeys, pay, cards decided, an arrival card met, a deed written and later read, an own move decided with its roll and deed;
- every card of the deck is drawn on at least one seed, or is listed as unreachable;
- the order rules the loop owns: no card before its narration, the scene opens after the road card.

This is the layer that would have stopped M11 pair 1 before anybody ran anything. It is also the test bed for a new mechanism: "own move on a card" is first proven here, by a scripted seat, not by Stas's first sentence.

### L2 DM bench

One case is a file: card id, party state (a saved roster or the state a walk reaches by seed), the player's line, and what must hold in the DM's tool calls. The harness loads the state, sends the DM its `card_words` wake exactly as the loop does, and checks the calls, not the prose:

- classification: answer only, or own move;
- for a move: the skill is one of a listed set, the DC within one ladder step of the expected, `success` and `failure` are legal ids for this card;
- never: an outcome narrated with no roll, a `remember` of an unrolled outcome, hidden values in text (the visibility scan runs on the output).

The first golden set is Stas's own words: the 13 lines he typed on open cards in runs 16:05 (4) and 01:42 (9), already recorded with their DM inputs (transcripts, Langfuse per decision 0073, `langfuse-own-move-or-answer.json`). By the two analyses, eleven are questions, jokes or a listed choice in other words, and two are real plans. Replay from traces is folded in here: a trace is not replayed whole, its wake becomes a case.

A model is not deterministic, so a case passes on k of n samples (proposed: 3 of 3 for "never" rules, 2 of 3 for the reading). The set is small on purpose: about 20 cases, about 2.5 to 7 USD a pass at 1 or 3 samples.

**Plan fuzz (reported, never gated).** For each card, a model writes five plans a person might say that are not a listed choice; the DM bench runs them and counts the plans with no legal landing. It is the only layer below Stas that can find a `salt_on_credit`: a card whose obvious own plan has nowhere to go. About 0.6 USD a card, so it runs on new or changed cards only.

### L3 Seat bench

The same harness with the AI players on the other end: a card wake to each seat with its personality card, N samples, counting what they do. It answers rate questions ("do AI players ever call `own_move`?") in minutes: 28 wakes cost about 3 USD and no DM, no fights, no narration. It reports a rate; a milestone may set a floor for it or only report it, as decision 0074 already did for AI own moves.

### L4 and L5: what stays end to end

Honest list of what no lower layer sees: pacing over an hour, DM timeouts and drains under real load, the narration judge's flags over a long context, the audit of rolls across a whole session, and whether a first-time reader gets through (Vera on the run's sample). Those keep one all-AI confirming run on the exit build.

Stas's run changes meaning. It is no longer the first live test of a mechanism; L1 to L3 did that. He plays once, when L0 to L4 are green, to rule what only he can: readable, fun, his verdicts on flags. If his run finds a mechanics defect, rule 2 of §2 applies: a lower-layer case, the fix, the layers green again. He replays only if the failed row is one only a person can rule.

## 4. Gates, before and after

| | Today (0043, 0065, 0074) | Proposed |
|---|---|---|
| Content PR (card, deck, pack) | CI + Zoya + Vera | + L0 and L1 in CI |
| DM or seat prompt PR | CI (scripted) and then a full run | + L2 or L3 report quoted in the PR |
| Milestone exit | a pair on one build: all-AI run, then Stas | L0, L1 green in CI; L2, L3 at their thresholds; one all-AI run; one evening of Stas, all on the exit build |
| A fix after Stas's run | new build, both halves again | a lower-layer case + the fix; layers re-run; the all-AI run again only if the fix touches the loop, the contract or the engine; Stas again only for a row only he can rule |
| Same build | both halves, always | the confirming run and Stas's evening start on one build; a later fix covered by a lower-layer case does not void them |

If accepted, this supersedes the "same build, both halves again" consequence of 0043 and narrows the exit pair of 0065. Rules 3 and 4, the audit and the judge do not change.

## 5. Cost

| | PRs | Notes |
|---|---|---|
| L0 lint | 1 | TS in `game/src/pack/`, in `pack:check` and CI; no contract change |
| L1 walk | 1 to 2 | policies for the scripted seats; the report's structural rows reused as assertions |
| L2 DM bench + Stas's 13 lines | 1 | new `npm run bench:dm`; cases as JSON beside the pack |
| L3 seat bench | 1 | same harness |
| Gates into CLAUDE.md, the roadmap's Delivery columns, the design-doc template | 1 | docs only, with the decision accepted |
| **Total** | **5 to 6 table PRs** | no core PR, no contract change expected |

Yan's estimate (§8), per milestone, with three bench passes of each kind paid back (about 14 USD):

| Shape | Run cost today | Proposed | Stas at the table today | Proposed |
|---|---|---|---|---|
| M11 (3 pairs, 1 passed) | 35.45 USD | about 27 USD | 1.09 h | about 0.45 h |
| M12 so far (3 pairs, 0 passed) | 44.29 USD | about 29 USD | 3.09 h | about 0.45 h |

The saving in dollars is small: 8 to 15 USD a milestone. The saving that matters is Stas's hours (three evenings become one) and the calendar: a bench answers in minutes and needs nobody at the seat. The price is 5 to 6 more PRs in a review queue that already holds 22 open table PRs; Stas's review hours a PR have no baseline, so that cost is not priced.

## 6. Risks

- **The layers have no recall record yet** (Yan). Until they do, they cannot replace a run. So the first PRs are a backtest: L0, L1 and L2 must catch the recorded M11 and M12 failures of §1 on the builds that had them. A layer earns its place in a gate only after it catches a failure a recorded run also caught.
- **One human run can still fail.** Two of the M12 findings needed a person. If Stas's evening fails on a row only he can rule, it is played again: 0.5 to 2 h and a day each time.

- **A bench is a model call, so it draws on the subscription** (decision 0036) and cannot run in CI. Where it runs is question 2.
- **Golden sets rot.** A set is only as good as the lines in it; it grows only by rule 2 of §2 and from Stas's real lines, never by invented cases beyond a first handful.
- **k of n hides a flaky prompt.** The bench reports the raw counts, not only pass or fail.
- **L1 policies are not players.** A walk proves a row can pass, not that it will with a person. That is why L4 and L5 stay.
- **Green layers can make Stas's evening feel optional.** It is not: no layer rules whether it is a game.

## 7. Questions for Stas

1. Accept the rule of §2 (a full run confirms; every full-run failure becomes a lower-layer case before a rerun)?
2. Where do benches run: on your Mac by one command (as full runs do today), or may a cloud thread run them on the API key in the environment, with a dollar cap a pass (proposed: 10 USD)?
3. Stas's evening once at milestone close, not a half of every pair attempt: yes?
4. A fix after your evening that a lower-layer case covers does not void the runs (supersedes 0043's same-build consequence): yes?
5. Start now, inside M12, with L0 and the DM bench on your 13 lines before the next exit attempt, or after M12 closes?

## 8. Yan's numbers (fallback agent, verbatim extract, 2026-11-14)

The repo's `yan` agent was run from a cloud thread, read-only; it may have seen CLAUDE.md.

> Runs 10 against 5 (2.0); USD 44.29 against 35.45 (1.25; target 17.73: 2.50); exit pairs played/passed 3/0 against 3/1; Stas at the table 3.09 h against 1.09 (2.84); days from scope at least 5.15 against 2.12 (2.43).
> 1 AI pass: 21:16 passed under 0074. 3 of the 10 runs are 1-to-2-minute cheap runs (1.01 USD together). 15:26 cost 8.83 USD on old build ab59b57 alongside 15:33, and it has no analysis. Write-off candidate.
> 16:05, own move: only e2e. The DM classified 4/4 correctly; Bren's plans came between cards. 01:42, bog_wifes_toll: static lint. salt_on_credit having no success branch: only e2e or design. `remember` with no roll: golden DM set.
> 18 M12 PRs open (+7,481 / −1,509 lines); 22 of our table PRs are open in all, plus 3 Dependabot. Your layers would add 5 to 6 more, +28 to 33% of the queue.
> Saving at M11 shape: net about 8 USD and 0.65 h per milestone. Saving at M12 shape so far: 44.29 → about 14.6 USD [before layer runs], 3.09 → about 0.45 h. Net about 15 USD and 2.6 h, and 3 evenings at the table become 1.
> Amendment (proposed, waits on Stas): a lower layer replaces a run only after it has caught a failure that a recorded e2e run also caught. Why: the layers have no recall baseline yet.
