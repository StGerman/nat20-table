# Content test layers before the exit pair

- **Status:** Proposed (for Stas's review; no TASKS.md rows until accepted)
- **Date:** 2026-11-14
- **Decision draft:** `docs/decisions/0080-content-test-layers.md`
- **Asked by:** Stas, 2026-11-14 06:55Z: the process "looks end-to-end, we need something closer to unit or component tests; be bold"

## 1. The record

Today a card, a DM prompt line and a player prompt line are first tested by a whole playthrough: the exit pair, then an analysis thread.

| | M11 (baseline) | M12 so far (2026-11-14) |
|---|---|---|
| Runs on milestone builds | 5 | 10 (3 of them 1-to-2-minute cheap runs) |
| Run cost, USD | 35.45 | 44.29 |
| Exit pairs played / passed | 3 / 1 | 3 / 0 (one all-AI half passed under 0074) |
| Stas at the table | 1.09 h in 2 evenings | 3.09 h in 3 evenings (38 + 120 + 27 min) |

Sources: `docs/roadmap.md` § Delivery for M11; for M12, `usage.jsonl` and `run.json` of the ten runs `full-2026-11-12T19-02…` to `full-2026-11-14T01-42…` in nat20-runs `master` 65c0e7c; checked by Yan (§7).

What each failed run found, and what could have found it sooner:

| Run | What failed | What sees it without a full run |
|---|---|---|
| M11 pair 1, both halves (13.61 USD, 39 min of Stas) | no arrival card could be met; no card reads a deed *The Way Back* writes | a scripted walk of the contract (L1) |
| M12 11-12 19:02, Stas's trial (2.50 USD, 38 min) | not an exit half: a roster already spent by an earlier session; 0 AI own moves in 9 card wakes | the AI own-move rate: the card wakes alone (L3) |
| M12 11-13 14:15 and 15:33 (10.73 USD) | 0 AI own moves in 28 card wakes, twice | the card wakes alone (L3) |
| M12 11-13 15:26 (8.83 USD) | void: played on the wrong checkout | no layer; a build check before the run starts |
| M12 11-13 16:05 (5.70 USD, 120 min of Stas) | own move 0: Stas's real plan came between cards, where no own move exists; the DM read all 4 of his card lines correctly | nothing; a person at the seat |
| M12 11-14 01:42 (6.95 USD, 27 min of Stas) | `bog_wifes_toll` has no failure the design allows for Stas's plan; `salt_on_credit` has no choice his plan could land on | nothing certain; the plan fuzz of §3 might have |

**The honest tally.** Layers below a full run would have caught, for certain, M11 pair 1 and the two M12 exit runs that showed 0 AI own moves: 24.34 USD of the two milestones' runs and one 39-minute evening of Stas. They would not, for certain, have saved either of his two failed M12 exit evenings: both failed on a plan a person said. So this proposal does not promise fewer evenings. It promises that no full run is spent on what a script or thirty model calls can show, and it adds one unproven tool, the plan fuzz, aimed at what cost him those two evenings.

## 2. The rule

**A defect is caught at the cheapest layer that can see it. A full run confirms; it does not discover.**

1. Every exit row of a milestone names its lowest layer, in a table in that milestone's design doc. A row with no lower layer says "a person".
2. When a full run fails, the analysis names the layer that should have seen it. If that layer is built, the failure becomes a case there before the rerun. If it is not, the rerun is not held for it.

## 3. The layers

| Layer | What it runs | Model | Where |
|---|---|---|---|
| L0 Deck lint | rules over deck JSON | none | CI, every PR |
| L1 Contract walk | engine, scripted DM and scripted seats through a whole contract, many seeds | none | CI, every PR |
| L2 DM bench, with the plan fuzz | one card, a fixed party state, one player line, to the live DM | live | Stas's Mac, once before the all-AI run |
| L3 Seat bench | one card to the live AI players | live | the same command |
| Exit pair | as today: the all-AI run, then Stas | live | Stas's Mac |

The own-move names below (`card_words`, `own_move`) are from the M12 stack (table #346 to #381), not yet on main.

**L0 Deck lint.** The deck's semantics live in `crates/nat20-world/src/deck.rs`, which already emits warnings (`route_warnings`, `untagged_fight_warnings`) that reach `npm run pack:check` as `deck:` lines. L0 adds warnings there, not a second reading of the deck in TypeScript. The first rule, from M12 design §1.4 and §1.8: for every choice taken as an own move's success, another choice must be able to be its failure, and a failure never lands on a choice that breaks a custom. A throwaway script over the 44 cards on main finds one hit: `peddler` (`share`, and `send_off` which breaks `bread_shared`). It does not find `bog_wifes_toll`: that card failed on §1.4's other half, "a deliberate act the words did not ask for", which is not in the data. Further rules (a world card fits every quest, a chain has no dead stretch: the commandments table #382 proposes) are written with Zoya in the L0 PR. Every rule starts as a warning; it becomes an error only after Stas has ruled its first hits.

**L1 Contract walk.** The scripted DM and scripted seats exist (`game/src/table/scripted.ts`, `game/test/stand-in.ts`), and CI already replays seeded fixtures with no model. L1 walks each contract over a set of seeds, with seats that vote by a fixed policy (first choice, last choice, seeded random), and reports for every structural exit row (journeys, pay, cards decided, an arrival card met, a deed written and later read) the share of seeds it passes on, and every card never drawn. A row at 0 is red: M11 pair 1 was a row at 0. Own move is not in it for free: M12 design §1.8 fixes that the scripted DM never calls `own_move`. Walking that path needs a second scripted DM policy, used by the walk only; it waits for the M12 stack to reach main.

**L2 DM bench.** One case is a file: card id, party state, the player's line, and what must hold in the DM's tool calls (answer or own move; a legal skill, DC step, `success` and `failure`; never an outcome with no roll). The first cases are Stas's own 13 lines typed on open cards in runs 16:05 and 01:42, recorded with their DM inputs (transcripts, Langfuse per decision 0073): a trace is not replayed whole, its wake becomes a case. A model is not deterministic, so each case runs 3 times and the bench reports raw counts. It is a report first; what count is a pass is set from its measured rates, not here.

**The plan fuzz.** For each new or changed card, a model writes five plans a person might say that are not a listed choice; the bench gives them to the DM and counts the plans that find no legal landing. A report, read before Stas sits down. It is the one layer aimed at `bog_wifes_toll` and `salt_on_credit`, and it is unproven.

**L3 Seat bench.** The same harness with the AI players on the other end: a card wake to each seat with its personality card, counting what they do. It answers "do AI players ever call `own_move`?" without a DM, fights or narration.

**Who runs the benches.** Decision 0036 put the live calls of Milestones 6 and 7 on Stas's Mac under his login, with no API key in the cloud, and practice has kept that. So L2 and L3 are one command Stas runs before he starts the all-AI run, the way he starts that run today; they are not a gate on every prompt PR. 0036 names "a run is needed from a cloud thread" as its reason to revisit: question 2.

## 4. Gates

Nothing in the exit pair's rules changes with this proposal. The pair stays as decisions 0043 and 0065 and the milestone scopes state it.

What is added before it: L0 and L1 green in CI, and one bench pass read, before any full run starts. For one milestone the benches and the walk run in shadow: they report beside the pair, and the milestone's close records what each layer caught, what it missed and what it cost.

Whether Stas's evening can move to once a milestone, and whether a fix covered by a lower-layer case can stand without replaying the pair, are for a later decision, on that record. Today's record does not support either (§1).

## 5. Cost

Build: 4 to 5 table PRs, no core PR, no wire change expected.

| | PRs | Notes |
|---|---|---|
| L0 | 1 | warnings in `crates/nat20-world/src/deck.rs`; the first rule, then Zoya's |
| L1 | 1 to 2 | seat policies and the report; then the own-move DM policy, after the M12 stack |
| L2 with Stas's 13 lines, the plan fuzz, L3 | 2 | one harness, one command |

They join a review queue of about 20 open table PRs of ours; Stas's review hours a PR have no baseline, so that cost is not priced.

Running, from the two ecd1f9e runs' `usage.jsonl`: a `dm/card_words` wake is about 0.11 USD and a seat's `card` wake about 0.10, in a warm session; a session's first call is about 0.4 USD. One bench pass (20 DM cases 3 times, 28 seat wakes) is about 10 USD if the prompt cache serves fresh sessions, and about 35 USD if every sample pays a first call. Unmeasured: the bench PR measures it. An all-AI run is 8.57 USD and an evening of Stas 5.70 to 6.95 USD.

**There is no dollar saving.** A bench pass costs about what an all-AI run costs. It answers a narrower question on more samples, without an analysis thread, and it adds minutes of Stas's Mac, not an evening.

## 6. Questions for Stas

1. Accept the direction: the rule of §2, and L0, L1 and the benches built and run in shadow for one milestone, with the pair's rules unchanged until that record exists?
2. Benches run on your Mac by one command. Do you want a cloud option instead (an API key in the cloud environment, a dollar cap a pass, 0036 revisited in its own record), so a thread can run a bench without you?
3. Start now (L0's first rule and L1 can land beside M12; the benches need the M12 stack on main), or after M12 closes?

## 7. Yan's numbers (fallback agent, extract, 2026-11-14)

The repo's `yan` agent was run from a cloud thread, read-only; it may have seen CLAUDE.md. His saving estimate assumed Stas's evening moves to once a milestone, which §4 no longer proposes, so it is not quoted.

> Runs 10 against 5 (2.0); USD 44.29 against 35.45 (1.25; target 17.73: 2.50); exit pairs played/passed 3/0 against 3/1; Stas at the table 3.09 h against 1.09 (2.84); days from scope at least 5.15 against 2.12 (2.43).
> 1 AI pass: 21:16 passed under 0074. 3 of the 10 runs are 1-to-2-minute cheap runs (1.01 USD together). 15:26 cost 8.83 USD on old build ab59b57 alongside 15:33, and it has no analysis. Write-off candidate.
> 16:05, own move: only e2e. The DM classified 4/4 correctly; Bren's plans came between cards. 01:42, bog_wifes_toll: static lint. salt_on_credit having no success branch: only e2e or design. `remember` with no roll: golden DM set.
> Amendment (proposed, waits on Stas): a lower layer replaces a run only after it has caught a failure that a recorded e2e run also caught. Why: the layers have no recall baseline yet.

On `bog_wifes_toll` this doc differs from Yan: the lint as the data stands does not find it (§3, L0).
