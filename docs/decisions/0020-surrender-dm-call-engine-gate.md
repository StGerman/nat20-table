# 0020. Surrender: the DM decides, within a scene condition the engine enforces

- **Status:** Accepted
- **Date:** 2026-10-17
- **Decided by:** Stas set the direction in the Milestone 3 spec thread ("the DM decides", with scene surrender conditions such as 25% of the goblin pack's health) and delegated the decision to the coordinator session, which decided it on 2026-10-17

## Context

The Silent Mill has goblins surrender in both fights, and scope §4.4.6 lists surrender as a way combat ends. Someone has to decide when they give up. Scope §7.3 names the risk: LLM DMs drift toward rescuing the party. A DM that can end a fight at will can end one the party is losing. Fixtures and the audit also need every state change to come from a request or an engine rule.

## Options

### A. The DM decides freely
- Pro: it fits the story (a goblin gives up when the boss dies or after a threat), and it's how real tables play.
- Con: the engine has nothing to check the call against, so the drift risk stays open.

### B. Automatic engine trigger
- Pro: deterministic, replayable, impossible to abuse.
- Con: rigid; the threshold is our own invention; no surrender that the story sets up.

### C. The DM decides, within a scene condition the engine enforces
- Pro: the call stays with the DM; the condition closes the drift risk; the call is a request, so it replays and is audited.
- Con: scene authors must write a condition for every encounter that can surrender.

## Decision

C. Each encounter in the scene file may declare a surrender condition built from three predicates, any of which can hold:
- the pack's HP fraction at or below a threshold (0.25 for the mill fights unless the scenario says otherwise);
- at most N creatures standing;
- a named leader down.

The engine evaluates the condition every turn and shows `surrender_available` in the DM view only. The DM ends the fight with `end_combat{reason:"surrender"}`, which the engine accepts only while the condition holds. The engine never surrenders on its own; it still ends combat by itself only when a side is down. Surrendered creatures turn `neutral` and stay in the scene for the interrogation.

## Consequences

- Contract, all additive:
  - the DM-view field `surrender_available`;
  - the error code `surrender_not_available`, not retryable;
  - the `surrendered` event.

  `end_combat`'s `surrender` reason already exists.
- The condition and anything derived from it are DM-only data (Rule 3).
- Milestone 6 (AGT-4, the DM prompt and personality card) gives the DM its guidance on balancing story and engagement. A never-surrender DM persona simply never calls it, and the gate keeps such personas safe.
- Spec: `docs/milestones/milestone-3-exploration-and-checks.md` §3, §4, D5; TASKS.md API-9 and API-22.

## Revisit when

Playtests show the DM never calls a surrender, or the three predicates can't express a scene's condition.

## Sources

- Milestone 3 spec thread, Stas 2026-10-17 11:48Z; nat20-table PR #6.
- `docs/scope/demo-run-scope.md` §3, §4.4, §7.3; decision [0005](0005-engine-rolls.md).
