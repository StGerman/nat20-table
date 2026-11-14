# Content test layers and milestone gates

- **Status:** Proposed (for Stas's review; no TASKS.md rows until accepted)
- **Date:** 2026-11-14
- **Decision draft:** `docs/decisions/0080-content-test-layers.md`
- **Asked by:** Stas, 2026-11-14 06:55Z: the process "looks end-to-end, we need something closer to unit or component tests; be bold"

## 1. The problem, in numbers

Today a card, a DM prompt line and a player prompt line are first tested by a whole playthrough: the exit pair, then an analysis thread.

| | M11 (baseline) | M12 so far (2026-11-14) |
|---|---|---|
| Full runs on milestone builds | 5 | 10 (3 of them 1-to-2-minute cheap runs) |
| Run cost, USD | 35.45 | 44.29 |
| Exit pairs played / passed | 3 / 1 | 3 / 0 (one all-AI half passed under 0074) |
| Stas at the table | 1.09 h in 2 evenings | 3.09 h in 3 evenings (38 + 120 + 27 min) |
| Days from scope | 2.12 | 5.15 and open |

Sources: `docs/roadmap.md` § Delivery for M11; for M12, `usage.jsonl` and `run.json` of the ten runs `full-2026-11-12T19-02…` to `full-2026-11-14T01-42…` in nat20-runs `master` 65c0e7c; checked by Yan (§8).

What the failed runs found, and the cheapest place each could have been found:

| Run | What failed | Cheapest layer that sees it |
|---|---|---|
| M11 pair 1, both halves (13.61 USD, 39 min of Stas) | every *Fair in Wend* arrival needs a deed, so 0 arrivals; no card reads a deed *The Way Back* writes | L1: a scripted walk of the contract, no model |
| M12 11-13 14:15 and 15:33 (10.73 USD) | 0 AI own moves in 28 card wakes, twice | L3: the same 28 card wakes alone |
| M12 11-13 16:05 (5.70 USD, 120 min of Stas) | own move 0: Stas's real plan came between cards, where no own move exists; the DM read all 4 of his card lines correctly | nothing below a person at the seat |
| M12 11-14 01:42 (6.95 USD, 27 min of Stas) | (a) `bog_wifes_toll` has no failure the design allows; (b) the DM ruled an outcome with no roll; (c) `salt_on_credit` has no choice Stas's plan could land on | (a) L0, but only once choices carry the "deliberate act" mark of §3, which nobody had written; as the data stood, a person; (b) L2; (c) a person, or L2's plan fuzz |

Counted honestly: the layers would have caught M11 pair 1 and the two M12 runs with 0 AI own moves, four of the six failed runs above: 24.34 USD and 39 minutes of Stas. Both of Stas's own M12 evenings failed on things a person found. The layers do not replace Stas's run; they keep the runs before it from being spent on what a script can see.

## 2. The rule

**A defect is caught at the cheapest layer that can see it. A full run confirms; it does not discover.** Two consequences:

1. Every exit row of a milestone names its lowest layer, in a table in that milestone's design doc. A row may gate on a full run only when no lower layer can see it.
2. Every failure a full run finds becomes a case at a lower layer before the next full run starts. The one exception is a row only a person can rule: it has no lower layer, the design doc says so beside the row, and Stas's evening is played again.

## 3. The layers

| Layer | What it runs | Model | Where | Catches |
|---|---|---|---|---|
| L0 Deck lint | rules over deck, pack and world JSON | none | CI, every PR | holes in the content's structure |
| L1 Contract walk | engine, scripted DM and scripted seats through a whole contract, many seeds | none | CI, every PR | unreachable cards, exit rows that cannot pass, loop order |
| L2 DM bench | one card, a fixed party state, one player line, to the live DM | 1 DM wake a sample | Stas's Mac, one command | the DM's reading of words; an outcome with no roll |
| L3 Seat bench | one card to the live AI players, N samples | 1 wake a seat a sample | Stas's Mac, one command | whether AI players do the thing at all, as a rate |
| L4 Confirming run | one all-AI full run on the exit build | full | Stas's Mac | integration: order, timeouts, pacing, the judge, the audit |
| L5 Stas's evening | Stas plays once, at milestone close | full | Stas's Mac | what only a person can rule: is it readable, is it a game |

The own-move names below (`card_words`, `own_move`) are from the M12 stack (table #346 to #381), not yet on main.

### L0 Deck lint

`npm run pack:check` already loads a pack through the engine. L0 adds rules that today live only in Zoya's bible and in design prose, each with the line it enforces in its message:

- **Own move has room.** M12 design §1.4: a failure never lands on a choice that breaks a custom, nor on a deliberate act the words did not ask for; §1.8: success and failure are two different choices. So for every choice taken as the success, another choice must be able to be the failure. The custom half is in the data: a throwaway script over the 44 cards on main finds `peddler` (`share`, and `send_off` which breaks `bread_shared`: a plan that lands on `share` has no failure). The "deliberate act" half is not in the data ("nothing can test it", §1.4), and it is the half `bog_wifes_toll` failed on in run 01:42: the lint sees that card only if choices get one optional mark, written by the card's author. Decision 0079 (table #381), if accepted, changes the rule and may remove the need.
- **A world card fits every quest** (Story-space commandment 8 as table #382 proposes it): a card in `worlds/<id>/deck/` names no client, cargo or destination id of any `campaign.json`. It has hits on main today (`missing_sack` and `oddas_mark` name Odda and her wheat).
- **A chain has no dead stretch and one path falls** (Consequence commandment 5 as table #382 proposes it): over the deed graph, no path of three cards in a row where the choice taken moves neither money nor standing, and at least one path loses and goes on.
- **Deeds come back** (Consequence 2): deeds written and never read, as a number per pack. Reported, not gated: the board owns the debt.

Every L0 rule starts as a report, not a gate: its first run lists what main already breaks, Stas rules each hit (fix the card, or the rule is wrong), and only then the rule turns red in CI. Zoya's board check stays, for what code cannot read: whether the consequence is worth having.

### L1 Contract walk

The scripted DM and scripted seats exist (`game/src/table/scripted.ts`, `game/test/stand-in.ts`), and CI already replays seeded fixtures with no model. L1 walks each contract end to end over a set of seeds, with seats that vote by a fixed policy (first choice, last choice, seeded random), and asserts on the run record:

- for every structural exit row (journeys, pay, cards decided, an arrival card met, a deed written and later read), the share of seeds on which it passes under each policy. A row at 0 is red; a low share is a warning in the report;
- every card of the deck is drawn on at least one seed, or is listed as unreachable;
- the order rules the loop owns: no card before its narration, the scene opens after the road card.

M11 pair 1 was a row at 0: no arrival card could be met on any path. Own move is not in it for free: M12 design §1.8 fixes that the scripted DM never calls `own_move`, so fixtures replay unchanged. A walk of the own-move path needs a second scripted DM policy, used by the walk only, that answers `card_words` with a fixed skill and DC; it is the second L1 PR in §5 and waits for the M12 stack to reach main.

### L2 DM bench

One case is a file: card id, party state (a saved roster, or the state a walk reaches by seed), the player's line, and what must hold in the DM's tool calls. The harness loads the state, sends the DM its `card_words` wake as the loop does, and checks the calls, not the prose:

- answer only, or own move;
- for a move: the skill is one of a listed set, the DC within one ladder step of the expected, `success` and `failure` legal for this card;
- never: an outcome narrated with no roll, a `remember` of an unrolled outcome, hidden values in text.

The first golden set is Stas's own words: the 13 lines he typed on open cards in runs 16:05 (4) and 01:42 (9), recorded with their DM inputs (transcripts, Langfuse per decision 0073). By the two analyses, eleven are questions, jokes or a listed choice in other words, and two are real plans. Replay from traces is folded in here: a trace is not replayed whole, its wake becomes a case.

A model is not deterministic, so each case runs 3 times: 3 of 3 for the "never" rules, 2 of 3 for the reading. The bench reports raw counts. The set stays small, about 20 cases. Three samples see a defect the DM makes most of the time; one it makes 1 time in 5 slips through about half the time, and stays L4's and L5's to find.

**Plan fuzz (reported, never gated; the first thing to cut).** For a new or changed card, a model writes five plans a person might say that are not a listed choice, and the bench counts the plans with no legal landing. It is the only layer below Stas that can find a `salt_on_credit`.

### L3 Seat bench

The same harness with the AI players on the other end: a card wake to each seat with its personality card, counting what they do. It answers rate questions ("do AI players ever call `own_move`?") without a DM, fights or narration. It reports a rate; a milestone may set a floor or only report it, as decision 0074 did.

### L4 and L5: what stays end to end

No lower layer sees pacing over an hour, DM timeouts under real load, the narration judge's flags over a long context, the audit of rolls across a session, or whether a first-time reader gets through (Vera on the run's sample). Those keep one all-AI confirming run on the exit build.

Stas's run changes meaning. It is no longer the first live test of a mechanism; L1 to L3 did that. He plays once, when L0 to L4 are green, to rule what only he can. If his run finds a mechanics defect, rule 2 of §2 applies.

## 4. Gates, before and after

"Today" is decision 0043 (both runs on one commit; after a fix the unattended run is repeated, and Stas's run only if it was the one that failed) as the M12 scope §4 applies it: "A fail in run 2 means a fix and both runs again on the new build."

| | Today | Proposed |
|---|---|---|
| Content PR (card, deck, pack) | CI, Zoya, Vera | the same, with L0 and L1 in CI |
| DM or seat prompt PR | CI (scripted), then a full run | the L2 or L3 report quoted in the PR |
| Milestone exit | a pair on one build: the all-AI run, then Stas | L0 and L1 green; L2 and L3 at their thresholds; one all-AI run and one evening of Stas, both started on the exit build |
| A fix after Stas's run | a new build and both runs again | a lower-layer case and the fix; the layers again on the fix commit, and the milestone closes there; the all-AI run again only if the fix touches the loop, the contract or the engine; Stas again only for a row only he can rule |

If accepted, this supersedes 0043's one-commit rule for fixes that a lower-layer case covers, and "a fail in run 2: fix, both runs again" in the scopes that state it (M12 §4, M13), from the milestone question 5 names. The price is stated in §6: a prompt fix closes the milestone on a commit no full run has played. Rules 3 and 4, the audit and the judge do not change.

## 5. Cost

Build: 5 to 6 table PRs, no core PR, no contract change expected.

| | PRs | Notes |
|---|---|---|
| L0 lint | 1 | TS in `game/src/pack/`, in `pack:check` and CI |
| L1 walk | 2 | seat policies and assertions; then the own-move DM policy, after the M12 stack |
| L2 DM bench with Stas's 13 lines, and L3 | 1 to 2 | one harness, `npm run bench:dm` and `bench:seat` |
| The layers as a short CLAUDE.md section, and bench passes in the roadmap's Delivery columns | 1 | docs only, with the decision accepted |

Running, from the two ecd1f9e runs' `usage.jsonl` (means of warm-session wakes, not measured on a bench): a `dm/card_words` wake is about 0.11 USD and a seat's `card` wake about 0.10; a cold session pays about 0.4 USD once.

- One L2 pass, 20 cases 3 times: about 7 USD. One L3 pass, 28 wakes: about 3 USD.
- One all-AI run: 8.57 USD. One evening of Stas: 5.70 to 6.95 USD.
- A milestone with three bench passes of each kind, one run and one evening: about 47 USD.

That figure assumes every sample is a fresh session and the prompt cache still serves its shared prefix. If the cache does not, a sample costs about 0.4 USD, an L2 pass about 24, and the milestone about 100 USD. The bench PR measures it before any gate uses a bench.

**There is no dollar saving.** M11 cost 35.45 USD and M12 so far 44.29; the proposal costs about the same at best and twice that at worst. What changes is Stas's evenings: M12 took three (3.09 h) and has not passed; under the proposal he plays one. The four recorded evenings that ended on their own ran 26 to 39 minutes; one ran to the 120-minute limit. On a milestone whose first pair would have passed anyway, the layers save nothing and cost the bench passes.

The 5 to 6 PRs join a review queue of about 20 open table PRs of ours; Stas's review hours a PR have no baseline, so that cost is not priced.

## 6. Risks

- **The layers have no recall record yet** (Yan). So each layer first runs in shadow: it reports beside the exit pair of the next milestone, under today's rules, and joins a gate only after it has caught a defect that a full run also showed, or caught it first. Replaying the recorded failures on their old builds would prove the same and cost a backport of each harness onto squashed stack commits; shadow costs only the bench passes. Rule 2 of §2 needs no shadow: it adds a case and removes nothing.
- **A fix can close a milestone unplayed.** A prompt fix after Stas's evening, covered by an L2 case, closes on a commit no full run has played; what only L4 sees (pacing, judge flags, timeouts) is unconfirmed there. Precedent: 2026-11-08, a style-only flag went to a backlog row with no rerun.
- **One human run can still fail.** Two of the M12 findings needed a person; that evening is then played again.
- **A bench is a live model call.** Decision 0036 put the live calls of Milestones 6 and 7 on Stas's Mac under his login, with no API key in the cloud environment, and practice has kept that since. So a bench is a command Stas runs, and it draws on the subscription. 0036 names "a run is needed from a cloud thread" as a reason to revisit; question 2 asks whether this is it.
- **Golden sets rot.** A set grows only by rule 2 of §2 and from Stas's real lines.
- **L1 policies are not players.** A walk proves a row can pass, not that it will with a person.
- **Green layers can make Stas's evening feel optional.** No layer rules whether it is a game.

## 7. Questions for Stas

1. Accept the rule of §2 (a full run confirms; every full-run failure becomes a lower-layer case before a rerun)?
2. Benches run on your Mac by one command. Do you want a cloud option instead (an API key in the cloud environment, a dollar cap a pass, 0036 revisited in its own record), so a thread can run a bench without you?
3. Your evening once at milestone close, not a half of every pair attempt, once the layers have their shadow milestone behind them: yes?
4. A fix after your evening that a lower-layer case covers does not void the runs: yes?
5. Start now, with L0 as a report and the DM bench on your 13 lines in shadow beside M12's next exit attempt, or after M12 closes?

## 8. Yan's numbers (fallback agent, extract, 2026-11-14)

The repo's `yan` agent was run from a cloud thread, read-only; it may have seen CLAUDE.md. His saving estimate priced the benches at one sample a case; §5 re-prices them at three, so that estimate is not quoted.

> Runs 10 against 5 (2.0); USD 44.29 against 35.45 (1.25; target 17.73: 2.50); exit pairs played/passed 3/0 against 3/1; Stas at the table 3.09 h against 1.09 (2.84); days from scope at least 5.15 against 2.12 (2.43).
> 1 AI pass: 21:16 passed under 0074. 3 of the 10 runs are 1-to-2-minute cheap runs (1.01 USD together). 15:26 cost 8.83 USD on old build ab59b57 alongside 15:33, and it has no analysis. Write-off candidate.
> 16:05, own move: only e2e. The DM classified 4/4 correctly; Bren's plans came between cards. 01:42, bog_wifes_toll: static lint. salt_on_credit having no success branch: only e2e or design. `remember` with no roll: golden DM set.
> Amendment (proposed, waits on Stas): a lower layer replaces a run only after it has caught a failure that a recorded e2e run also caught. Why: the layers have no recall baseline yet.
