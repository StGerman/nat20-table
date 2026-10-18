# The Demo Run: scope

Status: accepted by Stas, 2026-10-16. Owner: Stas.
Milestone 1 (accepted 2026-10-16): build E1 and drive one Fighter vs one Goblin Warrior through it, with every roll in the engine log. In progress in its own project thread.
Inputs: Nat20 checked at commit of 2026-09-27 (`docs/PROGRESS.md`, `assets/registries/`, `core/src`); SRD 5.2.1 data in `/mnt/project-files/dnd-wiki/`; mechanics backlog in `/mnt/project-files/engine/mechanics-backlog.md`.

## 1. Bottom line

1. **Run an original scenario, not a DMs Guild one.** DMs Guild adventures are licensed for personal use. Stas can run one privately to test, but anything we show or ship needs text we own or CC-BY text. Section 3 has a ready outline: *The Silent Mill*, 4 level 2 characters, 2 fights, 1 social beat, 1 exploration beat, about 90 minutes.
2. **Nat20 is a good skeleton, not a near-complete engine.** It builds cleanly and its core suite passes (`cargo test -p nat20_core`: 338 passed, 0 failed). It has the right architecture for AI agents (engine raises a prompt, an actor submits a decision, the engine validates it). Content coverage is thin: 4 classes (2 of them stubs), 22 spells out of 339 (about 6%), 1 species, and **no monster stat blocks at all**. The only monster is a test fixture goblin whose HP is a placeholder (`10 × CR`). The "69% of spells mechanical" figure from earlier research does not hold up against the repo.
3. **The demo is feasible on Nat20 if we fit the party and monsters to what it already does.** Fighter, Barbarian and Wizard at level 2 are mostly covered. Cleric (healing), 4 SRD monsters, a Human species, 5 items and a headless JSON API are the must-build pieces.
4. **Space model conflict.** Nat20 uses continuous 3D geometry with a navmesh (polyanya, parry3d, meters), not the hidden 5-ft grid we agreed on. For the demo, keep Nat20's model and expose named anchor points per room ("millstone", "loft ladder") so neither the human nor the AI ever deals in coordinates. Revisit in the fork-vs-borrow trial.

## 2. Scenario search results

Searched DMs Guild best-of lists (M.T. Black's top 20 free, EverOn's top 30) and adventure indexes. DMs Guild blocks automated page fetches, so details come from secondary listings.

| Candidate | Level | Length | Price | Fit | Verdict |
|---|---|---|---|---|---|
| **A Most Potent Brew** (Winghorn Press, R. Jansen-Parkes) | 1 | One session, 4 pages, ~5 rooms | PWYW | Rat-infested cellar leading to a ruined wizard tower; social, exploration, combat, a puzzle. Giant Rat and Giant Centipede are SRD; the boss (Giant Inferno Spider) is custom and needs swapping for the SRD Giant Spider. 2014 rules. | **Best for Stas's private test run** |
| Death Pit of Moloch (CJ Leung) | 1 | ~2 h | Free | Written for beginner DMs. Monster list not verified. | Runner-up |
| The Wealthy Merchant (Joel Tannas) | 0 | ~1 h | Free | Built for absolute beginners, too little combat to test the engine. | Runner-up for a smoke test only |
| Wolves of Welton, Moon over Graymoor, The Delian Tomb | 1-3 | 3-6 h | Free/PWYW | Too long for a 1-2 h slot. | Ruled out |
| WotC free PDFs (Grammy's Country Apple Pie, Death House) | - | - | Free | WotC-owned text, same redistribution problem. | Ruled out for the demo |

**Licensing, plainly:** a DMs Guild adventure can drive Stas's own private test runs. It cannot appear in a demo we show, record, or ship, and its text must not go into the repo, the RAG index, or prompts that leave Stas's machine. The structure of a "cellar clean-out turns into a bigger threat" one-shot is a genre convention and free to reuse; the wording, names, maps and custom monsters are not.

## 3. Recommended scenario: *The Silent Mill* (original)

Written by us, so we can license it as we like (CC-BY-4.0 suggested). Uses only SRD 5.2.1 monsters.

**Party:** 4 pregenerated level 2 characters. Level 2 rather than the backlog's level 3 because subclasses arrive at level 3 and Nat20 has not implemented Berserker, Evoker or any Cleric subclass. Level 2 still gets Action Surge and Reckless Attack, which Nat20 has, and is less swingy than level 1.

| Seat | Character | Why this class | Nat20 status |
|---|---|---|---|
| Human player (default) | Human Fighter, longsword + shield | Simplest to learn, best-covered class | Fighting Style, Second Wind, Action Surge, Tactical Mind done; Weapon Mastery missing |
| AI player 1 | Human Cleric, mace + shield | The party needs healing or a 90-minute run ends in a wipe | **Class not implemented** |
| AI player 2 | Dragonborn Wizard | All needed spells exist | Spellcasting done; Arcane Recovery missing |
| AI player 3 (optional) | Human Barbarian, greataxe | Durable, simple choices | Rage, Unarmored Defense, Reckless Attack done; Danger Sense, Weapon Mastery missing |

With only 2 AI players, drop the Barbarian, not the Cleric.

**Encounter budget** (SRD 5.2.1, 4 characters at level 2: Low 400 XP, Moderate 600, High 800).

| # | Scene | Beat | Content | Target time |
|---|---|---|---|---|
| 1 | Hook at the village green | Social | The reeve asks the party to find the miller's apprentice; the mill wheel stopped two days ago. Insight and Persuasion checks unlock extra details (goblin tracks seen, the miller owes money). | 10 min |
| 2 | Road to the mill | Exploration | Survival DC 12 finds the tracks and avoids a snare (DEX save DC 12, 1d6). Perception DC 13 spots lookouts and lets the party start Fight 1 with surprise. | 10 min |
| 3 | Mill yard | Fight 1 (Low) | 4 Goblin Warriors + 3 Wolves = 350 XP. Teaches attack, move, spell, Second Wind. | 25 min |
| 4 | The captured goblin | Social | One goblin surrenders. Intimidation or Persuasion DC 13 gets the cellar layout and the boss's name; failure means the boss is warned and gets one extra Goblin Warrior. Short rest offered. | 10 min |
| 5 | Mill cellar | Fight 2 (between Low and Moderate) | Goblin Boss + 3 Goblin Warriors + 2 Wolves = 450 XP. Apprentice tied to the millstone. Engine-side lever: 2 Giant Rats join on round 3 if no PC has dropped below half HP. | 30 min |
| 6 | Wrap-up | Narrative | Reward, epilogue, hook for a next session. | 5 min |

Total about 90 minutes, leaving 30 minutes of slack within the 2-hour cap.

**Monsters needed (all SRD 5.2.1):** Goblin Warrior, Goblin Boss, Wolf, Giant Rat. Bugbear was ruled out because it needs grappling.

## 4. What each part must do

### 4.1 Engine (Nat20 + our wrapper)
The engine owns every number. Nothing the AI says changes state unless the engine accepts it.

1. Keep the authoritative state: HP, conditions, resources, positions, initiative, death saves.
2. Decide when a roll is required and roll it: attacks, saves, damage, skill checks, death saves. Scenario data sets the DCs; the AI DM cannot invent or waive a roll.
3. Run initiative and the action economy, and list the legal actions for the acting creature.
4. Validate every submitted decision and return a readable error on rejection.
5. Raise reaction prompts (Opportunity Attack, Shield, Redirect Attack) to the right actor.
6. Run monster turns with a scripted policy (Nat20's AI controller registry), not an LLM, for speed and cost.
7. Emit a structured event log (who, what, roll, target number, result) that the DM narrates and the UI shows.
8. Expose all of this through a headless JSON API (stdio or local HTTP): `load_scene`, `get_state`, `legal_actions(actor)`, `submit(decision)`, `request_check(actor, skill, check_id)`, `short_rest`, `events(since)`.

**Build list (Nat20 gaps for this scenario):**

Strategy (Stas, 2026-10-16; superseded 2026-10-18 by `docs/decisions/0023-long-lived-fork.md`: nothing goes upstream, and "Upstream" below now means fork `demo`): fork Nat20 and contribute generic work back upstream. "Upstream" items are generic SRD content or engine features and go as small PRs to Nat20; "Ours" items are scenario- or product-specific and stay in our fork or our own repo.

| # | Item | Size | Where |
|---|---|---|---|
| E1 | Headless JSON API binary around `nat20_core` (today it is a library plus an ImGui debug GUI) | L | Upstream as an optional `nat20_server` crate if the maintainer agrees; otherwise ours |
| E2 | Monster stat-block format plus importer from our SRD 5.2.1 JSON, and the 4 monsters | L | Upstream (format and monsters); open an issue first, it is a design decision for him |
| E3 | Monster mechanics: Multiattack, Pack Tactics, bonus damage on Advantage, Prone on hit, Nimble Escape (Disengage only), Redirect Attack reaction | M | Upstream |
| E4 | Cleric levels 1-2: Spellcasting, Divine Order (Protector), Channel Divinity (Divine Spark); spells Sacred Flame, Guidance, Cure Wounds, Healing Word, Bless, Guiding Bolt | M | Upstream |
| E5 | Human species (Skillful, Versatile; Resourceful needs Heroic Inspiration, so stub it) | S | Upstream (without the stub) |
| E6 | Items: Shield, Mace, Leather Armor, Chain Shirt, Potion of Healing (drink and administer actions) | S | Upstream |
| E7 | Two flat combat maps (mill yard, cellar) with named anchor points | S | Ours (anchor-point support itself could go upstream) |
| E8 | Out-of-combat checks: skill check against a scenario-defined DC, group check, Help action | S | Upstream |
| E9 | Four pregenerated character files | S | Ours |

**Fork workflow** (superseded 2026-10-18 by `docs/decisions/0023-long-lived-fork.md`: upstream declines AI-authored contributions, so nothing goes upstream; `demo` is synced from upstream `main` by merge, never rebased; CLAUDE.md Rule 6 has the current workflow)
1. Fork to `StGerman/nat20`. Keep `main` identical to upstream; do demo work on a `demo` branch on top of it and rebase it regularly.
2. Each upstream item is its own branch and PR off upstream `main`, matching his conventions: JSON in `assets/registries`, Lua only where logic needs it, a test in `core/tests`, a row in `docs/PROGRESS.md`, regenerated schemas.
3. Open an issue before the large items (E1, E2). One maintainer means his roadmap wins; ask before building.
4. Never block the demo on a merge. The `demo` branch carries our patches until upstream takes them.
5. Contributions go under Nat20's MIT licence. Scenario text, pregens and lore stay in our own repo, outside the fork.

Already in Nat20 and needed: d20 checks, attacks, damage, death saving throws, short rest, Opportunity Attacks, Shield, Magic Missile, Burning Hands, Thunderwave, Fire Bolt, Ray of Frost, Ice Knife, Dash, Disengage, conditions including Prone, factions.

### 4.2 AI Dungeon Master
1. Narrate scenes, results and NPC dialogue from the scenario file and the engine event log, in 2-4 sentences per beat.
2. Translate the human's free text into an engine intent, and ask a clarifying question when the intent is ambiguous rather than guessing.
3. Pick which scenario-defined check applies when a player tries something; if none fits, use the SRD difficulty ladder (DC 10/15/20) through the engine, never a free-form ruling.
4. Never state a number (HP, damage, DC outcome) the engine did not produce.
5. Pace the session against the scene time targets and cut or skip optional content when behind.
6. Voice NPCs, including the captured goblin's negotiation.

### 4.3 AI players
Each AI player is a **dedicated agent with its own context window**, not a role the DM plays (Stas, 2026-10-16). The orchestrator runs one DM agent plus one agent per AI player; they talk only through the orchestrator.

**What each player agent sees (and only this)**
- Its own character sheet and resources, from the engine.
- A personality card: goal, temperament, one quirk, how it treats the party.
- What its character perceives: the DM's narration addressed to the table or to it, public engine events (rolls, hits, conditions it can see), and what other characters say aloud.
- Its own private notes, which it writes itself (suspicions, plans, what it promised the goblin).

**What it never sees:** the scenario file, DCs, monster HP and stat blocks, the DM's private reasoning, and other players' sheets or notes beyond what is visible at the table. This is what stops AI players from metagaming, and it is the main reason to separate them from the DM.

**Tools each player agent gets:** `my_sheet`, `legal_actions` (on its turn only), `submit_decision`, `react(yes/no)` for reaction prompts, `say(text)` for in-character speech, and `note(text)` for private memory. Only `submit_decision` and `react` change state, and the engine validates both.

**Behaviour**
1. In combat, pick one option from its legal actions, plus at most one line of in-character speech.
2. Out of combat, declare at most one intent per exploration round and join conversation without talking over the human.
3. Defer to the human on party decisions (which door, whether to spare the goblin) and say so in character.
4. Answer reaction prompts with a yes/no within the engine's prompt window.

**Context management:** the session runs about 90 minutes, so each player agent keeps a rolling summary of older events plus the current scene verbatim, refreshed at each scene change. Its notes always stay in context.

**Cost of this choice:** 3 extra context windows and their tokens, plus per-player latency. Out of combat, the orchestrator asks all player agents in parallel and orders their answers after the human's. In combat, only the acting player's agent is called.

### 4.4 Turn loop

**Exploration and social mode**
1. DM narrates the scene and its exits or options.
2. Human types an action or a line of dialogue.
3. All AI player agents are asked in parallel for one optional declaration; the orchestrator orders them after the human's.
4. DM maps declarations to engine calls (`request_check`, movement to an anchor, scene transition).
5. Engine resolves and returns events.
6. DM narrates the outcome. Repeat until the scene's exit trigger fires.

**Combat mode** (engine-driven)
1. Engine rolls initiative and announces the order.
2. On a PC's turn the engine returns the legal actions.
   - Human: the DM shows the options in plain text; the human answers in natural language; the DM turns it into a decision; the engine validates it, and a rejection goes back to the human with the reason.
   - AI player: the orchestrator wakes that player's own agent with its legal actions; it decides inside its own context and submits via `submit_decision`.
3. On a monster's turn the engine runs the scripted policy.
4. Reactions interrupt the queue and go to whoever owns the reacting creature.
5. After each turn the DM narrates the event log in 1-3 sentences. Consecutive monster turns are narrated together.
6. The engine ends combat when one side is down, fled or surrendered (surrender is a scenario trigger for the goblins at 25% strength).

### 4.5 Human interface
A text chat in the terminal or a single web page. Free text plus five commands:
- `/sheet` shows the character's HP, AC, slots and resources.
- `/where` lists creatures, anchors and distances in feet for the current room.
- `/options` lists legal actions this turn.
- `/log` shows recent engine rolls, so every result is checkable.
- `/pause` stops AI players from acting until resumed.

Every roll is shown inline, for example "Goblin Warrior attacks Bren: 17 vs AC 18, miss".

## 5. Out of scope
Character creation and level-up; long rests; loot economy and shops; lighting, vision and darkvision (the cellar is lantern-lit); Hide and Stealth; grappling; Weapon Mastery; Heroic Inspiration; magic items beyond Potions of Healing; maps or graphics; voice; more than one human; saving and resuming a campaign; subclasses.

## 6. Acceptance criteria
1. Three internal playthroughs finish from Scene 1 to Scene 6 in 120 minutes or less without manual intervention.
2. Zero rule outcomes produced by an LLM: every roll in the transcript appears in the engine log.
3. Zero narration contradicting engine state (HP, death, positions), checked against the log after each playthrough.
4. AI player turn latency at p95 is 10 seconds or less; DM narration at p95 is 6 seconds or less.
5. Every rejected human or AI decision recovers within 2 retries.
6. A first-time player finishes without opening a rules page, using only `/options` and `/sheet`.

## 7. Risks
1. **Nat20 is one maintainer with no releases.** Pin a commit and fork for the demo; upstream fixes where possible.
2. **The headless API is the largest unknown.** Nat20's prompt/decision model fits, but nothing outside the GUI drives it today. Build E1 first and drive one Fighter vs one Goblin Warrior through it before anything else.
3. **AI DM drift.** LLMs grant success on persuasion roughly 10% of the time and far more under pressure. Mitigation is structural: the DM has no tool that sets an outcome.
4. **Latency and cost stacking.** Four separate agent contexts (DM plus 3 players), each growing over 90 minutes, can blow the time and token budget. Rolling summaries keep contexts bounded. Use a fast model for AI players, keep monster turns scripted, and batch narration.
5. **Space model.** Named anchors hide Nat20's 3D geometry for this demo, but the project-wide grid decision still needs settling in the fork-vs-borrow trial.

## Sources
- Nat20: https://github.com/MadsWedendahlKruse/nat20 (`docs/PROGRESS.md`, `assets/registries/`, `core/src/test_utils/fixtures.rs`)
- M.T. Black, Top 20 Free D&D Adventures: https://www.mtblackgames.com/blog/top-20-free-dnd-adventures
- EverOn Games, Top 30 D&D One-Shots: https://everongames.com/top-30-free-dd-one-shots-5e-2026/
- Adventure Lookup, A Most Potent Brew: https://adventurelookup.com/adventures/a-most-potent-brew
- SRD 5.2.1 encounter budget and monster stat blocks: `/mnt/project-files/dnd-wiki/wiki/gm-toolbox/combat-encounters.md`, `/mnt/project-files/dnd-wiki/data/srd-5.2.1-monsters.json`
