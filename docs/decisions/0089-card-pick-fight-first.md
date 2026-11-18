# 0089. The DM picks a card that can come to a fight first

- **Status:** Accepted
- **Date:** 2026-11-18
- **Decided by:** Stas, project chat 2026-11-18 07:08Z (the rule) and 19:43Z (option 1 of the run-monitoring thread's card: «Моя формулировка, правится только промпт»)

## Context

The DM's pick rule (`game/src/agents/dm.ts`, "Pick a road card"; Milestone 11 design decision 12 and its Q6) put continuity first, then the clearest problem for the human's character, and a fight only as the tie-break. In the all-AI run of *Fair in Wend* on 2026-11-17 (`full-2026-11-17T21-50-53-659Z`, the exit run of row 9 of `allies-in-fights-system-design.md` §11) the third night offered `night_wolves`, `rufus_offer` and `drovers`, and the DM picked `rufus_offer` ("follows from rufus_got_ahead"), as the rule says. The run had no fight, so the allies the milestone built never stood at the wagon. Only one lowland night and one slopes leg fit in a four-day contract, so a full run has about three chances at a fight.

## Options

### A. Fight first, in the prompt only (Stas's wording)
A card that can come to a fight; failing that, continuity; failing that, the clearest problem. Between two fight cards, the one that continues what the party did.
- Pro: one line of the prompt; the DM judges what "can come to a fight" means, as Stas wants the agents to judge more and fixed rules to do less.
- Con: by Lev's estimate (run-monitoring thread, 2026-11-18 07:21Z), `rufus_offer`, which shares the one lowland night with the wolves, drops from about three contracts in four to one in four, and its deeds (`told_odda_of_rufus`, `took_the_old_place`) with it. Odda dies at the wolves in about 7% of fights (ENG-48's table, 200 seeds).

### B. Fight first until the party has fought once on the contract (Lev)
- Pro: one fight a contract, then the road follows the party again; costs `rufus_offer` less.
- Con: needs a fight count in the DM's wake, which is code beside the prompt.

### C. B, plus `rufus_offer` moved off the wolves' night through Zoya
- Pro: keeps the bribe's pay-off.
- Con: a deck change and Zoya's page on top of B.

### D. Keep continuity first
- Pro: no change.
- Con: the exit run may show no ally in a fight again.

## Decision

A, in Stas's wording, prompt only. No fight counter, and no change to `rufus_offer`'s night.

## Consequences

- `game/src/agents/dm.ts`: the "Pick a road card" line; its test in `game/test/dm-agent.test.ts`. "Never pick a card to spare the party a fight" stays.
- Replaces the pick order of Milestone 11 design decision 12 and Q6 (`docs/design/m11-system-design.md`, which stays as written).
- No contract, engine or deck change. Tested only by a live run: no test without a model sees which card a DM picks. The rerun of exit row 9, which the bench change (AGT-131) already moves the build for under decision 0043, plays this rule too.

## Revisit when

A run shows the cost Lev named: `rufus_offer` gone from most contracts, or a contract that is one fight after another. Then B or C.

## Sources

- Run-monitoring thread, 2026-11-18: the night-3 draw (seq 166 to 168 of `full-2026-11-17T21-50-53-659Z`, `/mnt/project-files/engine/allies/runs/full-2026-11-17T21-50-53-659Z/langfuse-monitor.md`), the spec, Yan's timing and Lev's read
- `docs/design/m11-system-design.md` decision 12; `docs/design/allies-in-fights-system-design.md` §11 rows 9 and 12; ENG-48's wagon table (`/mnt/project-files/engine/allies/wagon-table-2026-11-17.md`)
