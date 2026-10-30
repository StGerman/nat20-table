# 0050. The DM sees who still waits for the floor

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decided by:** Stas, on the decision card of the cellar thread (19:47Z, "Все руки + DM + отчёт": options A3-M, F1-B and F2-A of the hands-and-check spec). This record is F2-A; F1-B is [0049](0049-every-hand-speaks.md).

## Context

With every raised hand speaking in its round (0049), only one kind of line can still wait: an address carried by the one hand-off a round ([0040](0040-every-address-hands-off.md)). A player answered, a companion answered back, and that answer waits for the next round. Its addressee has the floor first then. But the DM resolves the round without knowing anyone is waiting, so it can load the next scene first.

The DM had three nudges towards the exit and none away from it:
- its `table_turn` wake says only "The table has spoken (above). Resolve it";
- its `pacing` craft says "When the players have what the scene is for, move on";
- `load_scene` checks only the short rest, once a scene (AGT-46).

In run 17-35, three carried addresses went into the next scene unanswered: Bren to Ilsa and Torva to Bren in Scene 2, and Maren to Bren in Scene 3. One of them waited only because of the bound that 0049 removes. They were table talk, not decisions, so the DM, who heard each line, is the one to judge whether it holds the scene.

## Options

### A. The DM's wake names who waits
The `table_turn` wake adds one line while someone waits: who, and who spoke to each. `pacing` gets one paragraph on what to do about it.
- Pro: nothing is scripted, and the DM decides, as a live DM sees who still has a hand up.
- Pro: one line in a wake, and no extra model call.
- Con: it is only prompt text, and the Opus DM at low effort may not follow it.

### B. A, plus a reminder in `load_scene`
The first `load_scene` in a turn where someone waits returns a reminder, without costing a retry, as the rest reminder does.
- Pro: it lands at the moment of the exit.
- Con: it fires on remarks too, and costs a DM call.
- Con: a second call goes past it, which the DM did with the rest reminder in runs 12-54 and 18-45-48.

### C. A hard hold
No scene exit while someone waits.
- Pro: a guarantee.
- Con: a script, and a stuck player holds the scene.

## Decision

A. The `table_turn` wake ends with "Still waiting for the floor: bren (spoken to by torva). They speak first in the next round." while someone waits, and `game/dm-craft/skills/pacing/SKILL.md` says that an unanswered question, proposal or objection belongs to the scene, while a passing remark can wait for the road. The line names no pronoun: the loop doesn't know them.

## Consequences

- **`game/src/table/loop.ts`:**
  - the carried addresses keep who spoke to each;
  - both `table_turn` wakes, with and without the human, add the line;
  - a scene left while someone waits records them in `run.json` (`left_waiting`) and logs it on the run channel.
- **The run report:** "scene exits with someone waiting: N", next to the hand-offs and the carried addresses.
- **Unchanged:**
  - one hand-off a round, and a fight still drops what was carried;
  - `load_scene` checks only the rest;
  - the engine contract and Rule 3: the DM already hears every line.
- **TASKS.md:** row AGT-56.

## Revisit when

- A run's report shows scenes left with someone waiting, and the lines left were questions, proposals or objections: B comes back.
- The hand-off rule (0040) changes, since it is what makes a line wait.

## Sources

- The hands-and-check spec, `/mnt/project-files/engine/m7/hands-and-check-spec.md` §3.
- Run `full-2026-10-30T17-35-35-676Z` in StGerman/nat20-runs.
- [`docs/design/party-talk.md`](../design/party-talk.md) §4.4.
