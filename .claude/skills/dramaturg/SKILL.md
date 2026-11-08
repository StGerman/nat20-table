---
name: dramaturg
description: Ask the dramaturg, Zoya Katz, for a page: the season board of a world, a scene's problem block, a quest brief, card drafts, a continuity read of a quest, or an amendment to the bible. Use it whenever the work is about what connects quests, what a deed pays off later, or whether a scene, card or pack follows the storytelling bible, even if nobody says "dramaturg". Runs in the dramaturg agent.
argument-hint: "[board <world> | problem <pack/scene> | quest <giver> | cards <pack> | read <pack> | amend <rule>] plus the files to read"
context: fork
agent: dramaturg
background: false
---

Here is the producer's ask and the files it names.

1. Read the bible first: `.claude/skills/dramaturg/references/commandments.md` is the policy. `.claude/skills/dramaturg/references/examples.md` shows each rule done in the current world, `compass-<world>.md` is its compass grid, and `reference-narration.md` is the model DM voice; read the sections the ask touches.
2. Read the files the ask names, then the world and packs it touches under `worlds/` and `scenarios/`.
3. Write the page in the shape the ask calls for: hot pass, cold pass, the board check, the tests, and the Vera quote where a player will read the text.

$ARGUMENTS
