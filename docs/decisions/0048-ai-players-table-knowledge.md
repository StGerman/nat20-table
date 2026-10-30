# 0048. AI players get a rules primer and teamwork guidance in their prompt, and nothing about what lies ahead

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decided by:** Stas, in the Milestone 7 implementation thread (2026-10-30, 15:51Z to 16:23Z), on the spec `engine/m7/player-craft-spec.md` (v2)

## Context

In the first `play:unattended` run (`full-2026-10-30T12-54-03-691Z`) the party wiped in the Scene 5 cellar. The cellar is 450 XP, Low to Moderate for four level 2 characters, and people clear it. The AI players lost it through how they played:
- they spent every limited resource in the yard;
- nobody asked for the Short Rest;
- nobody lifted the fallen;
- attacks were spread over four foes;
- nobody ever proposed a plan.

A balance sweep on the same build shows how much this matters. A scripted party that rests and lifts the fallen wins the untuned cellar in 86% of seeds; one that plays as the run did wins in 28%.

The player prompt covered turn mechanics, talk and notes. It never said that the players are a team at a table, gave them the 2024 rules they need, or asked them to decide together.

Stas set four rules for AI players: they know they are at a game table, they know the game rules, they role-play their character, and they work as a team and decide together. He ruled out any knowledge of what lies ahead, such as "the day has two fights".

## Options

### Where the rules knowledge lives

- **A. A primer in the system prompt** (chosen): common rules plus the player's own class block, in our own words from SRD 5.2.1, kept to what the engine does.
  - Pro: it is there on every turn, cached with the prompt, at no extra call.
  - Con: the prompt grows by about 1,000 words.
- **B. A rules lookup tool.**
  - Pro: the prompt stays small.
  - Con: a call, and its latency, every time a player needs a rule, and players would have to know to look.
- **C. Core's action descriptions on `legal_actions` options.** Core holds SRD text for most actions.
  - Con: a contract change (Rule 1), and tokens on every turn.
  - Con: some effects still say "(TODO)", and core is silent where it differs from the SRD (no Arcane Recovery, no Dodge action).

The Player's Handbook itself is WotC's and can't be used (Rule 7).

### How players talk strategy

- **A. Teach the table talk that exists** (chosen): a teamwork section. Players propose, agree and object in the existing party-talk rounds, make calls in a fight, and note what the party decided as their own `plan` notes.
- **B. A huddle any player can call:** the loop gives every AI player the floor once before the DM resolves.
- **C. A shared party plan:** a tool that writes one plan line, shown in every party member's briefing.
- **D. Out-of-character table talk** in a second channel.

## Decision

Option A for both.
- **Sections:** the player's system prompt gets "At the table", "The rules you know" (the common primer, `game/src/agents/primer/rules.md`, and the class block `<class>.md`), "Your character" and "Play as a team".
- **What it says:**
  - it never says how many fights, places or foes the adventure holds, and never names any of them;
  - the character comes first: a party decision is followed unless it goes against what the character believes, and then the character says so aloud;
  - each player keeps its own notes, so two players may remember a decision differently, which Stas wants ("a lot of fun");
  - "Be quick" becomes a three-point check before a combat action.
- **Scope:** every AI player in every profile.

## Consequences

- **Rules text:**
  - the primer states what core does, not the SRD where they differ;
  - the Wizard block says Arcane Recovery isn't in the game yet (CHR-6);
  - the prompt no longer offers Dodge, which core doesn't have.
- **Tests:** a test keeps scenario ids, foes and counts of fights out of the prompt.
- **Revisit:**
  - the run analyses look at how players remember and follow party decisions;
  - option C (a shared plan) is the planned improvement, after that review;
  - option B comes in if the runs show players still don't plan before a fight.
