# 0049. Every raised hand speaks in its talk round

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decided by:** Stas, on the decision card of the cellar thread (19:47Z, "Все руки + DM + отчёт": options A3-M, F1-B and F2-A of the hands-and-check spec). This supersedes the bound of three floor wakes in [0039](0039-party-talk-hand-raise-floor.md); the rest of 0039 stands.

## Context

Decision 0039 let at most three floor wakes follow each other in a talk round: the named player, the speakers and the one hand-off of [0040](0040-every-address-hands-off.md) together. A raised hand still waiting when the bound was reached lapsed. Its line reached only the run log, and neither the DM nor the other players knew someone had wanted to speak. The bound was set against the round's length (a floor wake took about 5.7 s) and against Sonnet at low effort talking for the sake of it.

Three unattended runs measured what it cost:
- **Runs 21-48, 12-54 and 17-35:** the bound cut 17 raised hands in 13 of 23 talk rounds.
- **When it cut:** in 10 of those 13 rounds the DM loaded the next scene in the same turn, so the cut players never spoke at all.

The lines lost included:
- Ilsa's questions for the captured goblin, in two runs;
- Maren's "wait for Ilsa, there's a trap";
- requests to rest before the cellar.

Run 18-45-48 lost a rest the same way. Maren asked for it, her hand lapsed, and the party went into the cellar at 55 of 74 Hit Points.

Both reasons for the bound have weakened:
- **Latency:** Stas gave latency to a separate optimisation milestone.
- **Talking for its own sake:** the hand itself holds that now. In 17-35, 10 of 36 hands were PASS, and 48% of seats stayed silent, against a target of at least 30%.

## Options

### A. Carry a cut hand to the next round, as an address is carried
- Pro: the bound stays, and the change is a few lines.
- Con: in 10 of 13 cases the next round is already in the next scene. It works only together with a `load_scene` reminder, which the Opus DM at low effort sidesteps with a second call (runs 12-54 and 18-45-48, for the rest reminder).

### B. Every raised hand speaks in its round
- Pro: the DM resolves a round having heard everyone, and nothing is asked of the DM.
- Pro: the rule is simpler to state.
- Con: a round where all four AI players raise their hands runs one or two floor wakes longer: about six more wakes, 30 s and $0.20 a run.

### C. A bound of four
- Pro: one constant.
- Con: the hand-off still cuts the last speaker, and a table with a human (three AI players) changes nothing.
- Con: a magic number.

## Decision

B. Every named player and every raised hand gets one floor wake in its talk round, however many there are, and the round keeps its one hand-off (0040). Only B gets every line said before the DM moves on, with no reminder for the DM to ignore.

## Consequences

- **`game/src/table/floor.ts`:** loses `FLOOR_BOUND`.
- **`game/src/table/loop.ts`:**
  - `talkRound` loses the `floorBound` option and the lapse branches;
  - the named players beyond three speak too;
  - an address made after the hand-off to a player whose hand is up is answered on that player's own floor in the round;
  - only an address to a player with no floor still to come is carried.
- **The run report:**
  - shows floor wakes per round (p50 and the maximum);
  - keeps "hands lapsed" as a guard that must read 0, since only a table that ends mid-round leaves a hand without its floor.
- **Docs:** `docs/design/party-talk.md` §4.2.5 and §4.4 describe the new rule.
- **Unchanged:**
  - one hand-off a round;
  - a fight drops what was carried;
  - a player the human's line names speaks first.
- **Contract and visibility:** the engine contract and Rule 3 are untouched.
- **TASKS.md:** row AGT-55.
- **What follows:** the next unattended run (Milestone 7) and Stas's run go on the build that includes this.

## Revisit when

- A run shows the talk rounds getting long because players talk with nothing to add: the floor wakes' p50 or maximum climbs, or the silent share falls below 30%. A cheaper pre-filter (0039's option R) comes back then, not the bound.
- A table with more AI players than the demo's four is planned.

## Sources

- The hands-and-check spec, `/mnt/project-files/engine/m7/hands-and-check-spec.md` §2 (the counts in §2.2 and the options in §2.3).
- Runs `full-2026-10-29T21-48-17-288Z`, `full-2026-10-30T12-54-03-691Z`, `full-2026-10-30T17-35-35-676Z` and `full-2026-10-30T18-45-48-638Z` in StGerman/nat20-runs.
- [`docs/design/party-talk.md`](../design/party-talk.md) §4.2 and §4.4.
