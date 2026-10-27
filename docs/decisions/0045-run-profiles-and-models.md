# 0045. Run settings live in named JSON profiles; testing runs a Sonnet DM and Haiku players

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas: he proposed the cheaper models (20:18Z) and asked for configs or a Makefile (20:19Z); he accepted D4 and D5 on a decision card in the Milestone 7 design thread (20:53Z)

## Context

Decision 0032 set Opus 5.5 (DM) and Sonnet 5.5 (players) for testing. Every live run spends Stas's plan usage (decision 0036), and Milestone 7 adds full six-scene runs. Priced from the Russian run of 2026-10-27 (21 minutes, Scenes 1 and 3; API-equivalent dollars from the price table in `game/src/usage.ts`):

| Setup | DM | Players | Run |
|---|---|---|---|
| Opus 5.5 medium + Sonnet 5.5 low | $2.31 | $2.18 | $4.49 |
| Opus 5.5 DM + Haiku 5.5 players | $2.31 | $0.11 | $2.42 |
| Sonnet 5.5 DM + Haiku 5.5 players | $1.90 | $0.11 | $2.01 |

A Sonnet DM saves only 18% of the DM's cost: 7.4M of its tokens are cache reads, priced the same on Opus 5.5 and Sonnet 5.5. Haiku 5.5 hadn't played at this table, and Russian speech guards and the hand-raise format are where a weaker model can slip.

The settings of a run (models, efforts, language, seat, scenes) were long command lines, and nothing recorded which of them a run used.

## Options

### Models
- **A. Today's models everywhere.** Pro: known behaviour. Con: full price for every iteration run.
- **B. Haiku players only.** Pro: most of the saving (46%), the DM unchanged. Con: leaves 9 points on the table.
- **C. Sonnet DM and Haiku players for testing and the unattended run; today's models for Stas's run.** Pro: 55% less per run; the discovery run measures it first. Con: the DM is the riskiest role to downgrade.

### Settings
- **A. A Makefile.** Pro: familiar. Con: a second command surface over npm; it can't check a value or record what ran.
- **B. One npm script per combination.** Pro: no new code. Con: grows with every combination; records nothing.
- **C. Named JSON profiles.** Pro: checked before a run starts; each run records the profile and where every setting came from; personal profiles stay outside the repo. Con: a small resolver to write.

## Decision

Models C and settings C. Profile `cheap` (DM Sonnet 5.5 medium, players Haiku 5.5 high) runs the discovery run, every iteration run and Milestone 7's unattended run; profile `demo` (DM Opus 5.5 medium, players Sonnet 5.5 low) runs Stas's run. The discovery run is compared with the Russian run on retries, guard refusals, timeouts and narration flags; if the Sonnet DM does clearly worse, `cheap`'s DM goes back to Opus and the players stay on Haiku. Profiles are JSON with `_comment` in `game/profiles/`, loaded by `--profile`, with `npm run play:cheap` and `play:demo` as shortcuts; flags typed on the command line override them.

## Consequences

- Amends decision 0032 for testing; 0032's beta plan (Sonnet and Haiku) is unchanged.
- Row AGT-14 builds the resolver, the profiles and `run.json`'s record of settings.
- A profile naming a model missing from the price table in `usage.ts` is refused, so cost is always known.

## Revisit when

The discovery run shows the Sonnet DM or the Haiku players doing clearly worse than the Russian run, or the optimisation milestone changes what drives the DM's cost.

## Sources

- `docs/milestones/milestone-7-demo-acceptance.md` §4.1, §6 (D4, D5); `docs/design/demo-acceptance-system.md` §3.1.
- Decisions 0032, 0036.
