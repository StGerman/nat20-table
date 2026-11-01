# 0056. Milestone 10 closes on a cheap run with Stas at the table

- **Status:** Accepted
- **Date:** 2026-11-01
- **Decided by:** Stas, in the Milestone 10 implementation thread (21:26Z): "Закрываем M10 и добавляем баги к M9" ("Close M10 and add the bugs to M9")

## Context

The Milestone 10 exit criterion (spec `docs/design/m10-spec.md`) is one `play:unattended` run on the milestone's last build. That run has every character played by an AI, the DM on Opus and the players on Sonnet. It must pass M7 rows 1, 2, 3 and 5, report AI player combat turn p95 of 10 s or less and DM narration p95 of 6 s or less, and cost no more than about $11.50 API-equivalent.

Runs on the M10 builds:
- **`full-2026-10-31T12-05-14-265Z`** (`play:cheap`, all AI, main 58294a1): Scenes 1 to 5, then the whole party went down in the cellar. p95 13.6 s players, 12.0 s DM. The DM miss came from a bug: Claude Code folds a message that arrives mid-turn into the running turn, so 22 of 80 narrations timed out with no API call. Table #195 fixed it.
- **`full-2026-11-01T19-50-27-980Z`** (`play:cheap`, Stas as Bren in the full-screen seat, build 96a460a, clean): Scenes 1 to 6 in 65.9 min, and nobody died. The audit cited 186 of 186 rolls, and the leak scan found nothing. There was one fallback (`unanswered`). p95 was 6.5 s players and 4.9 s DM, and the cost was about $5.5 API-equivalent. The judge raised 14 flags, almost all about positions, which Stas has not yet ruled on.
- The other uploads from 31 October and 1 November played no full adventure. `18-27-13` reached the 120-minute limit with Stas at the human seat, with about 12 minutes of model time. `20-27-44`, `19-47-21`, `19-47-46` and `19-48-53` stopped before Scene 1.

No `play:unattended` run was made on an M10 build.

## Options

### A. Run `play:unattended` first, then close
- Pro: meets the criterion as written, and measures latency on the models the demo uses. Opus is slower than Sonnet, and Sonnet is slower than Haiku.
- Con: one more run of about 70 minutes on Stas's Mac and his plan, for numbers that already pass with margin on the cheap profile.

### B. Close now on 19-50-27
- Pro: the run played the whole adventure on the last build, through the new full-screen seat, with Stas judging it as a player. Both latency targets hold with room to spare (6.5 s of 10 s, 4.9 s of 6 s).
- Con: the cheap profile does not prove the targets hold on the demo models, and the run had a human at the table, not an all-AI table.

### C. Fix the two P1 bugs from the run (AGT-71, AGT-72) first, then run `play:unattended` and close
- Pro: the closing run would also check the fixes.
- Con: it puts new work into a milestone whose goal (speed) is met.

## Decision

B. Milestone 10 is done on `full-2026-11-01T19-50-27-980Z`. The latency check on the demo models becomes its own row (AGT-77). The bugs the runs found go to Milestone 9 (AGT-71 to AGT-76).

## Consequences

- **`TASKS.md`:**
  - Milestone 10 is done (2026-11-01).
  - AGT-77 runs `play:unattended` once on a later build and reports p95 against the same targets. AGT-25 (pipelined narration) and AGT-68 (effort retune) stay conditional on it.
  - AGT-71 to AGT-77 are listed under Milestone 9.
- **`CLAUDE.md`:** the milestone list names Milestone 10 and this record.
- **Row 3 of 19-50-27** stays as Stas rules its flags in the run's `confirmations.json`.

## Revisit when

AGT-77's run misses either p95 target on the demo models. Then AGT-25 or AGT-68 comes in before the friends-and-family testing of acceptance criterion 6.

## Sources

- Runs in StGerman/nat20-runs: `runs/full-2026-11-01T19-50-27-980Z/`, `runs/full-2026-10-31T12-05-14-265Z/`.
- Spec `docs/design/m10-spec.md`, system design `docs/design/m10-system-design.md` §3.2 (the correction after the first run).
- Table #193, #194, #195 (fixes after the first run).
