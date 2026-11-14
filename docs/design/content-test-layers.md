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
| Exit pairs played / passed | 3 / 1 | 3 / 0 |
| Stas at the table | 1.09 h in 2 evenings | 3.09 h in 3 evenings (38.3 + 120.0 + 27.2 min) |

Sources: `docs/roadmap.md` § Delivery for M11; for M12, `usage.jsonl` and `run.json` of the ten runs `full-2026-11-12T19-02…` to `full-2026-11-14T01-42…` in nat20-runs `master` 65c0e7c; checked by Yan (§7).

What each failed run found, and what could have found it sooner:

| Run | What failed | What sees it without a full run |
|---|---|---|
| M11 pair 1, both halves (7.74 + 5.87 USD, 39 min of Stas) | no arrival card could be met; no card reads a deed *The Way Back* writes | a scripted walk of the contract (L1). The human half is already saved by the rule that Stas plays only after the all-AI half has passed (M12 scope §9 item 1, carried by decision 0066) |
| M11 pair 2, all-AI half (8.82 USD) | 9 deeds written, 0 read by a later card: on the way down no card on the route could read them | the same walk (L1): the row "a deed written and later read" at 0 |
| M12 11-12 19:02, Stas's trial (2.50 USD, 38 min) | not an exit half: a roster already spent by an earlier session | nothing proposed here |
| M12 11-13 14:15 and 15:33 (2.19 + 8.54 USD) | 0 AI own moves in 28 card wakes, twice | a seat bench (the card wakes alone), which §3 does not propose: decision 0074 has since made this row reported, not gated |
| M12 11-13 15:26 (8.83 USD) | void: played on the wrong checkout | a build check before the run starts (§3) |
| M12 11-13 16:05 (5.70 USD, 120 min of Stas) | own move 0: Stas's real plan came between cards, where no own move exists; the DM read all 4 of his card lines correctly | nothing; a person at the seat |
| M12 11-14 01:42 (6.95 USD, 27 min of Stas) | `bog_wifes_toll` has no failure the design allows for Stas's plan; `salt_on_credit` has no choice his plan could land on | nothing certain; the plan fuzz of §3 might have |

**The honest tally.** Against today's rules (the all-AI half first, and 0074), what is proposed here would have saved for certain two all-AI runs in M11 (7.74 + 8.82 = 16.56 USD), the void run in M12 (8.83 USD), and no evening of Stas. Both of his failed M12 exit evenings failed on a plan a person said: 01:42 in a design hole that table #381 proposes to close; 16:05 on a plan said between cards, which nothing proposed anywhere addresses. So this proposal does not promise fewer evenings or fewer dollars. It offers three things: structural holes found in CI for nothing; the DM's reading of a player's words tested on one card in minutes, not in a run and an analysis thread; and one unproven tool, the plan fuzz, aimed at what cost him those two evenings.

## 2. The rule

**A defect is caught at the cheapest layer that can see it. A full run confirms; it does not discover.**

1. Every exit row of a milestone names its lowest layer, in a table in that milestone's design doc. A row with no lower layer says "a person".
2. When a full run fails, the analysis names the layer that should have seen it. If that layer is built, the fix's PR adds the failure there as a case. The rerun is not held for it: the pair's rules stay as they are (§4).

Both apply from the first milestone design written after acceptance; the M12 and M13 designs are not amended.

## 3. The layers

| Layer | What it runs | Model | Where | Red or report |
|---|---|---|---|---|
| Build check | the checkout against the commit the run is meant for | none | the run command | refuses to start |
| L0 Deck lint | rules over deck JSON | none | `pack:check`, CI | a report first; a rule gates after Stas has ruled its first hits |
| L1 Contract walk | engine, scripted DM and scripted seats through a whole contract, many seeds | none | a command, as `pack:check` is; later a test | a report first; a row at 0 gates after Stas has ruled what main shows today |
| L2 DM bench, with the plan fuzz | one card, one player line, to the live DM | live | Stas's Mac, one command | a report, in shadow for one milestone |
| Exit pair | as today | live | Stas's Mac | as today |

The own-move names below (`card_words`, `own_move`) are from the M12 stack (table #346 to #381), not yet on main.

**Build check.** A full run takes the commit it is meant for and refuses a different or dirty checkout. Stas's Mac has two checkouts, and run 15:26 was played on the wrong one. `npm run preflight` prints the checkout as a note today (`game/src/play/preflight.ts`); the check turns it into a refusal when the run is given the commit it expects.

**L0 Deck lint.** The deck's semantics live in `crates/nat20-world/src/deck.rs`, which already emits warnings (`route_warnings`, `untagged_fight_warnings`) that reach `npm run pack:check` as `deck:` lines. L0 adds warnings there, not a second reading of the deck in TypeScript. `game/test/pack-check.test.ts` today fails on any repo-pack warning outside two known shapes, so each rule's PR lists its hits on main and either fixes the cards or adds the shape to that list, as Stas rules. Candidate rules, each written against the design and bible in force when its PR is written:

- Own move has room: a card has at least two choices that break no custom. On main's M12 design (`docs/design/m12-system-design.md` §1.4 and §1.8: success and failure are two different choices, and a failure never lands on a choice that breaks a custom) a plan that lands on a card's only non-breaking choice has no failure to fall to. A throwaway script over the 44 cards finds one such card, `peddler` (`share`, and `send_off` which breaks `bread_shared`). It does not find `bog_wifes_toll`, which failed on §1.4's other half, "a deliberate act the words did not ask for": that is not in the data. Decision 0079 (table #381, Proposed) makes the failure optional; if it is accepted, this rule is dropped or rewritten against it.
- The two commandments table #382 proposes (a world card fits every quest; a chain has no dead stretch), written with Zoya.

L0 is the thinnest layer today: one rule that 0079 may void, and two that depend on table #382. Its worth is decided by the rules Zoya's bible can state as code, not by this doc.

**L1 Contract walk.** The scripted DM and scripted seats exist (`game/src/table/scripted.ts`, `game/test/stand-in.ts`), and CI already replays seeded fixtures with no model. L1 is a command that walks each contract over a set of seeds, with seats that vote by a fixed policy (first choice, last choice, seeded random), and prints for every structural exit row (journeys, pay, cards decided, an arrival card met, at least one deed written and later read) the share of seeds it passes on, and every card never drawn. A row at 0 is the finding: M11 pairs 1 and 2 were each a row at 0. The L1 PR prints what main shows today and how long the walk takes; a test that fails on a row at 0 joins `check:ts` after Stas has read that. Own move is not in it: M12 design §1.8 fixes that the scripted DM never calls `own_move`; walking that path would need a second scripted DM policy, and is not proposed now.

**L2 DM bench.** One case is a file: card id, the seed and scripted policy that bring a walk to that card, the player's line, and what must hold in the DM's tool calls (answer or own move; a legal skill, DC step, `success` and `failure`; never an outcome with no roll). The harness walks to the card with no model, then hands the live DM its `card_words` wake. Two limits: the live DM starts with no memory of the evening before the card, unlike the recorded run; and handing a walk over to a live agent is new harness code, the main risk in the estimate of §5. The engine has no restore command, and none is proposed. The first cases are Stas's own 13 lines typed on open cards in runs 16:05 and 01:42 (transcripts, Langfuse per decision 0073). Each case runs 3 times and the bench reports raw counts; what counts as a pass is set from its measured rates, not here.

**The plan fuzz.** For each new or changed card, a model writes five plans a person might say that are not a listed choice; the bench gives them to the DM and lists the plans it answered with narration only. "The card waits" is a correct DM answer (M12 design §1.8), so the list is not a count of defects: someone has to read it and say which plans a player would expect to work. That read is Lev's (`play`), before Stas sits down, and it is not priced here. It is the one layer aimed at `bog_wifes_toll` and `salt_on_credit`, and it is unproven.

**Not proposed: a seat bench.** The same harness could ask the AI players a card and count what they do. Its one question so far, "do AI players ever call `own_move`?", stopped gating under 0074. It is built when a milestone gates on what AI players do.

**Who runs the bench.** Decision 0036 put the live calls of Milestones 6 and 7 on Stas's Mac under his login, with no API key in the cloud, and practice has kept that. So the bench is one command Stas runs before he starts the all-AI run, the way he starts that run today; it is not a gate on every prompt PR. 0036 also allows a thread to run a live step on that Mac through a Remote Control session Stas approves; the project's notes record that route as blocked in practice. And 0036 names "a run is needed from a cloud thread" as its reason to revisit. Question 2 asks which of the three.

## 4. Gates

The exit pair's rules do not change: decisions 0043, 0065 and 0074 and the milestone scopes stand.

Added: the build check; L0 and L1 as reports, where each rule or row gates once Stas has ruled what it finds on main. The bench and the fuzz run once before the exit pair of one milestone and report; that milestone's close records what they caught, what they missed and what they cost.

Whether Stas's evening can move to once a milestone, and whether a fix covered by a lower-layer case can stand without replaying the pair, are for a later decision, on that record. Today's record does not support either (§1).

## 5. Cost

Build: 4 to 5 table PRs, no core PR, no wire change.

| | PRs | Notes |
|---|---|---|
| Build check | 1, small | in the run command |
| L0 | 1 | warnings in `crates/nat20-world/src/deck.rs` |
| L1 | 1 | seat policies and the command; the test later |
| L2 with Stas's 13 lines, and the plan fuzz | 1 to 2 | the hand-over from a walk to a live DM is the risk |

They join a review queue of about 20 open table PRs of ours; Stas's review hours a PR have no baseline, so that cost is not priced.

Running, from the two ecd1f9e runs' `usage.jsonl`: a `dm/card_words` wake is about 0.11 USD in a warm session, and a session's first call about 0.4 USD. Unmeasured on a bench; the bench PR measures it.

- The 13 lines 3 times: about 4 USD if the prompt cache serves fresh sessions, about 16 if every sample pays a first call.
- The fuzz on 10 changed cards, 50 plans once: about 6 to 20 USD, plus the calls that write the plans.
- For comparison: an all-AI run is 8.57 USD and an evening of Stas 5.70 to 6.95 USD.

**There is no dollar saving.** A bench pass with the fuzz costs about what an all-AI run costs, or more. It answers a narrower question, in minutes of Stas's Mac, without an analysis thread.

## 6. Questions for Stas

1. Accept the direction: the rule of §2; the build check; L0 and L1 as reports; the DM bench and the fuzz as a report for one milestone; the pair's rules unchanged until that record exists?
2. Who runs the bench: you, by one command on your Mac; a thread through a Remote Control session you approve (0036 allows it; blocked in practice so far); or a cloud thread on an API key with a dollar cap a pass (0036 revisited in its own record)?
3. Start now (the build check, L0 and L1 can land beside M12; the bench needs the M12 stack on main), or after M12 closes?

## 7. Yan's numbers (fallback agent, extract, 2026-11-14)

The repo's `yan` agent was run from a cloud thread, read-only; it may have seen CLAUDE.md. His saving estimate assumed Stas's evening moves to once a milestone, which §4 does not propose, so it is not quoted.

> Runs 10 against 5 (2.0); USD 44.29 against 35.45 (1.25; target 17.73: 2.50); exit pairs played/passed 3/0 against 3/1; Stas at the table 3.09 h against 1.09 (2.84); days from scope at least 5.15 against 2.12 (2.43).
> Human time: 38.3 + 120.0 + 27.2 = 185.5 min. 3 of the 10 runs are 1-to-2-minute cheap runs (1.01 USD together). 15:26 cost 8.83 USD on old build ab59b57 alongside 15:33, and it has no analysis. Write-off candidate.
> 16:05, own move: only e2e. The DM classified 4/4 correctly; Bren's plans came between cards. 01:42, bog_wifes_toll: static lint. salt_on_credit having no success branch: only e2e or design. `remember` with no roll: golden DM set.
> Amendment (proposed, waits on Stas): a lower layer replaces a run only after it has caught a failure that a recorded e2e run also caught. Why: the layers have no recall baseline yet.

On `bog_wifes_toll` this doc differs from Yan: the lint as the data stands does not find it (§3, L0).
