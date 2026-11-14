# A live bench before the exit pair

- **Status:** Proposed (for Stas's review; no TASKS.md rows until accepted)
- **Date:** 2026-11-14
- **Decision draft:** `docs/decisions/0080-content-test-layers.md`
- **Asked by:** Stas, 2026-11-14 06:55Z: the process "looks end-to-end, we need something closer to unit or component tests; be bold"

## 1. What exists, and the gap

Tests with no model are already deep. `contract/fixtures/` replays seeded transcripts. `game/test/campaign-loop.test.ts` walks whole contracts with a scripted DM and scripted seats and asserts the verdict rows of `game/src/play/verdict.ts`: after M11's exit pair 2 failed, its failure became the test "Fair in Wend's road always reads one of its own deeds, on the first choices or the last, whatever the dice", and the exit pair itself is scripted (MAP-12). The M12 stack adds scripted own-move tests to the same file. `npm run pack:check` loads every pack through the engine.

The gap is everything a live model decides. How the DM reads a player's words, whether AI players use a tool they are offered, whether a card can hold the plan a person says: each is first tested by a full run and its analysis thread. Between a scripted test and a 9 USD run there is nothing.

## 2. The record

| | M11 (baseline) | M12 so far (2026-11-14) |
|---|---|---|
| Runs on milestone builds | 5 | 10 (3 of them 1-to-2-minute cheap runs) |
| Run cost, USD | 35.45 | 44.29 |
| Exit pairs played / passed | 3 / 1 | 3 / 0 |
| Stas at the table, wall time | 1.09 h in 2 evenings | 3.09 h in 3 evenings (38.3 + 120.0 + 27.2 min; at least 81 of the 120 were the table waiting with no input) |

Sources: `docs/roadmap.md` § Delivery for M11; for M12, `usage.jsonl` and `run.json` of the ten runs `full-2026-11-12T19-02…` to `full-2026-11-14T01-42…` in nat20-runs `master` 65c0e7c; checked by Yan (§8).

| M12 run | What failed | What would see it without a full run |
|---|---|---|
| 11-12 19:02, Stas's trial (2.50 USD, 38 min) | not an exit half: a roster already spent by an earlier session | nothing proposed here |
| 11-13 14:15 and 15:33 (2.19 + 8.54 USD) | 0 AI own moves in 28 card wakes, twice | a live bench of the AI seats on the card wakes alone; decision 0074 has since made this row reported, not gated |
| 11-13 15:26 (8.83 USD) | void: played on a stale checkout with local changes | a run that refuses a dirty checkout (§4) |
| 11-13 16:05 (5.70 USD, 120 min of Stas) | own move 0: Stas's real plan came between cards, where no own move exists, and the DM read all 4 of his card lines correctly. Two build defects also failed gating rows (a creature's name shown in English; a fight started on a neutral spent the retries) | own move: nothing, a person at the seat. The two build defects: scripted loop tests, which exist as a kind |
| 11-14 01:42 (6.95 USD, 27 min of Stas) | `bog_wifes_toll` has no failure the design allows for Stas's plan; `salt_on_credit` has no choice his plan could land on | nothing certain; the plan fuzz of §4 might have |

M11's two structural failures (pairs 1 and 2) are already scripted tests on main, so they are not counted for this proposal.

**The honest tally.** What is proposed here would have saved for certain one run, the void 15:26 (8.83 USD), and no evening of Stas. Both failed M12 exit evenings failed on a plan a person said: 01:42 in a design hole that table #381 proposes to close, 16:05 on a plan said between cards, which nothing proposed anywhere addresses. So this proposal promises neither fewer evenings nor fewer dollars. It offers a place to test what a live model does with one card and one line, in minutes, and one unproven tool aimed at what cost the 01:42 evening.

## 3. The rule

**A defect is caught at the cheapest layer that can see it. A full run confirms; it does not discover.** This is already the practice for structure (§1); the rule makes it explicit and extends it to live behaviour.

1. From the first milestone design written after acceptance, every exit row names the lowest layer that tests it: a scripted test, the live bench, a full run, or "a person". The M12 and M13 designs are not amended.
2. When a full run fails, the analysis names the layer that should have seen it, and the fix's PR adds the failure there as a case. No rerun is held for it.

## 4. What is added

The own-move names below (`card_words`, `own_move`) are from the M12 stack (table #346 to #381), not yet on main.

**A dirty checkout refuses an exit run.** `checkout()` in `game/src/play/record.ts` already computes it, and the verdict marks such a run not eligible after it is played. The exit profiles refuse it before the run starts.

**The DM bench.** One case is a file: card id, the seed and scripted policy that bring a scripted walk to that card, the player's line, and what must hold in the DM's tool calls (answer or own move; a legal skill, DC step, `success` and `failure`; never an outcome with no roll). The harness walks to the card with no model, then hands the live DM its `card_words` wake. Two limits: the live DM starts with no memory of the evening before the card, unlike a recorded run; and handing a scripted walk over to a live agent is new harness code, the main risk in the estimate of §6. The engine has no restore command, and none is proposed. The first cases are Stas's own 13 lines typed on open cards in runs 16:05 and 01:42 (transcripts, Langfuse per decision 0073). Each case runs 3 times and the bench reports raw counts; what counts as a pass is set from its measured rates, not here.

**The plan fuzz.** For each new or changed card, a model writes five plans a person might say that are not a listed choice; the bench gives them to the DM and lists the plans it answered with narration only. "The card waits" is a correct DM answer (M12 design §1.8), so the list is not a count of defects: someone has to read it and say which plans a player would expect to work. That read is Lev's (`play`), before Stas sits down. It is the one tool aimed at `bog_wifes_toll` and `salt_on_credit`, and it is unproven.

**Who runs the bench.** Decision 0036 put the live calls of Milestones 6 and 7 on Stas's Mac under his login, with no API key in the cloud, and practice has kept that. So the bench is one command Stas runs before he starts the all-AI run, the way he starts that run today; it is not a gate on every prompt PR. 0036 also allows a thread to run a live step on that Mac through a Remote Control session Stas approves; the project's notes record that route as blocked in practice. And 0036 names "a run is needed from a cloud thread" as its reason to revisit. Question 2 asks which of the three.

**Considered, not proposed.**
- A seat bench (a card to the live AI players, counting what they do). Its one question so far, "do AI players ever call `own_move`?", stopped gating under 0074. It is the same harness, built when a milestone gates on what AI players do.
- A deck lint beyond today's validator. The one rule ready today (a card has two choices that break no custom, from M12 design §1.4 and §1.8) finds `peddler` on main, does not find `bog_wifes_toll`, and is voided if decision 0079 (table #381) makes an own move's failure optional. Rules from the commandments table #382 proposes may follow once they are accepted.

## 5. Gates

The exit pair's rules do not change: decisions 0043, 0065, 0066 and 0074 and the milestone scopes stand.

The bench and the fuzz run once before the exit pair of one milestone and report. That milestone's close records what they caught, what they missed and what they cost. Whether Stas's evening can move to once a milestone, and whether a fix covered by a bench case can stand without replaying the pair, are for a later decision on that record. Today's record supports neither (§2).

## 6. Cost

Build: 2 to 3 table PRs, no core PR, no wire change.

| | PRs | Notes |
|---|---|---|
| A dirty checkout refuses an exit run | 1, small | `game/src/play/` |
| The DM bench with Stas's 13 lines, and the plan fuzz | 1 to 2 | after the M12 stack is on main; the hand-over from a scripted walk to a live DM is the risk |

They join a review queue of about 20 open table PRs of ours; Stas's review hours a PR have no baseline, so that cost is not priced.

Running, from the two ecd1f9e runs' `usage.jsonl`: a `dm/card_words` wake is about 0.11 USD in a warm session, and a session's first call about 0.4 USD. Unmeasured on a bench; the bench PR measures it.

- The 13 lines 3 times: about 4 USD if the prompt cache serves fresh sessions, about 16 if every sample pays a first call.
- The fuzz on 10 changed cards, 50 plans once: about 6 to 20 USD, plus the calls that write the plans and Lev's read.
- For comparison: an all-AI run is 8.57 USD and an evening of Stas 5.70 to 6.95 USD.

**There is no dollar saving.** A bench pass with the fuzz costs about what an all-AI run costs, or more. It answers a narrower question, in minutes of Stas's Mac, without an analysis thread.

## 7. Questions for Stas

1. Accept the direction: the rule of §3; a dirty checkout refuses an exit run; the DM bench and the fuzz as a report for one milestone; the pair's rules unchanged until that record exists?
2. Who runs the bench: you, by one command on your Mac; a thread through a Remote Control session you approve (0036 allows it; blocked in practice so far); or a cloud thread on an API key with a dollar cap a pass (0036 revisited in its own record)?
3. The bench needs the M12 stack on main. Build it for M12's next exit attempt, or for M13?

## 8. Yan's numbers (fallback agent, extract, 2026-11-14)

The repo's `yan` agent was run from a cloud thread, read-only; it may have seen CLAUDE.md. His saving estimate assumed Stas's evening moves to once a milestone, which §5 does not propose, so it is not quoted.

> Runs 10 against 5 (2.0); USD 44.29 against 35.45 (1.25; target 17.73: 2.50); exit pairs played/passed 3/0 against 3/1; Stas at the table 3.09 h against 1.09 (2.84); days from scope at least 5.15 against 2.12 (2.43).
> Human time: 38.3 + 120.0 + 27.2 = 185.5 min. Of the 120 min at 16:05, 81 were the table waiting on bren and the run then hit the time limit.
> 3 of the 10 runs are 1-to-2-minute cheap runs (1.01 USD together). 15:26 cost 8.83 USD on old build ab59b57 alongside 15:33, and it has no analysis. Write-off candidate.
> 16:05, own move: only e2e. The DM classified 4/4 correctly; Bren's plans came between cards. 01:42, bog_wifes_toll: static lint. salt_on_credit having no success branch: only e2e or design. `remember` with no roll: golden DM set.
> Amendment (proposed, waits on Stas): a lower layer replaces a run only after it has caught a failure that a recorded e2e run also caught. Why: the layers have no recall baseline yet.

On `bog_wifes_toll` this doc differs from Yan: a lint over the data as it stands does not find it (§4).
