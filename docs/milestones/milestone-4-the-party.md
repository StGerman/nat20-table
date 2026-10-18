# Milestone 4: the party

- **Status:** Proposed (spec only; nothing here is built yet)
- **Date:** 2026-10-18
- **Owner:** Stas
- **Depends on:** Milestone 3 done (2026-10-18, main 4d6bde7). The fork's `demo` is pinned at 031f7a2 and carries U1 (registry root), so registry content can land as fork items.
- **Exit criterion** (`TASKS.md` § Milestones): the 4 pregens load with correct AC and HP; the Cleric heals in and out of combat; reactions tested.

Milestone 3 gave the engine scenes, checks, rests and encounters, all played by one test character, Bren (`fighter_l2`): a Dragonborn Fighter with no shield and AC 17. This milestone builds the real party of *The Silent Mill* and everything it needs to act: the Cleric and its spells, the Human species, shields and the missing weapons and armour, Potions of Healing, area spells, reactions, and actions out of combat.

## 1. Goal and non-goals

**Goal.** The four level 2 pregens of scope §3 load from the engine with SRD 5.2.1 numbers, and everything they can do in *The Silent Mill* resolves in the engine and replays from a seed:
- the Human Fighter (longsword and shield, AC 19), the Human Cleric (mace and shield), the Dragonborn Wizard, and the optional Human Barbarian (greataxe);
- the Cleric's cantrips, prepared spells and Channel Divinity, in a fight and out of one;
- concentration (Bless, Guidance, Shield of Faith) and its end;
- Potions of Healing, drunk or given, in a fight and out of one;
- area spells (Burning Hands, Thunderwave) and the Dragonborn's Breath Weapon, aimed by an agent;
- reactions answered by a client: Opportunity Attack and the Wizard's Shield;
- the conditions core already models, shown in state.

**Non-goals** (each has its own milestone or row):
- Monsters and their mechanics: Prone, Pack Tactics, Redirect Attack, fractional CR (Milestone 5, MON-*, ENG-2). Redirect Attack is the Goblin Boss's reaction, so ENG-1 covers it in Milestone 5.
- Personality cards (CHR-5) and anything agent-side (Milestone 6).
- Turn Undead: the adventure has no Undead, and it needs Frightened, which core does not model. Divine Spark is the Cleric's only Channel Divinity option in the demo.
- Subclasses, level-up, long rests, loot, magic items beyond Potions of Healing (scope §2).
- Wizard Arcane Recovery (CHR-6, P2) and Barbarian Danger Sense (CHR-7, P2).
- The Human trait Resourceful: it grants Heroic Inspiration, which is out of scope.
- Rest interruption (ENG-9) and creatures that keep walking into a fight (ENG-11): unchanged.

## 2. What core already does, checked against the pinned rev

Findings at fork `demo` 031f7a2 (the rev table pins):

| Need | Core today | Consequence |
|---|---|---|
| Healing in the action pipeline (ENG-3) | `ActionPayloadComponent::Healing` with a dice expression (`2d8 + spell_level`), used by Second Wind; `systems::health::heal` caps at max HP and revives a creature at 0 HP; spells exclude dead targets through `allowed_targets` | **Mostly done.** ENG-3 shrinks to a regression test in `core/tests/` (cap, revive from 0 HP and from Stable, dead excluded). Size S. |
| Spellcasting for a prepared caster | `SpellAccessModel::EntireClassList` (its doc names Cleric), `CastingReadinessModel::Prepared`, spell slots, concentration (one at a time, the save after damage), `spell_level`, `character_level` and `<ability>.modifier` in expressions | **Ours plus data.** The Cleric is a class JSON and spell JSON, no engine code |
| Cleric class | No `class.cleric` | **Fork item U9 (CHR-1)**: class JSON levels 1 and 2, Divine Order as a level 1 prompt (Protector and Thaumaturge as feats, as Fighting Style is), Channel Divinity resource, Divine Spark action with variants (heal, radiant, necrotic) |
| Channel Divinity regains one use on a Short Rest | `RechargeRule` is `Turn`, `Rest(kind)`, `Daily` or `Never`; nothing regains one use | **Fork item U10**: a partial recharge rule. The same gap is ENG-10 (Second Wind); one item fixes both. A new registry format, so an upstream issue at Milestone 8 before the PR |
| Cleric spells | None of Sacred Flame, Guidance, Spare the Dying, Cure Wounds, Healing Word, Bless, Guiding Bolt, Shield of Faith exist | **Fork item U11 (CHR-2)**. Cure Wounds, Healing Word and Sacred Flame are plain JSON. Shield of Faith is an `on_armor_class` buff. Guiding Bolt reuses the pattern of Help's assist attack (core #7). Spare the Dying reuses `systems::health::stabilize`. Bless and Guidance add a d4 to a d20 test, which static modifiers can't (they take flat bonuses), so each needs a Lua hook, as Tactical Mind's 1d10 does. Guidance also needs a skill variant (action variants exist: Hex) |
| Human species | Only `species.dragonborn` | **Fork item U12 (CHR-3)**. Skillful and Versatile are choices, and the species format has no `prompts` (only classes and feats do), so this adds `prompts_by_level` to species: a format addition (Milestone 8 issue first) |
| Origin feats | Every background's feat is a placeholder, `feat.fighting_style.archery` (`_comment: "Placeholder feat"`); no origin feat exists | **Fork item U13 (CHR-8, new)**: Savage Attacker and Skilled. Magic Initiate and Alert only if D5 needs them |
| Background data | Soldier lists Strength, Constitution, Charisma (SRD 5.2.1: Strength, Dexterity, Constitution); Sage lists Wisdom, Intelligence, Charisma (SRD: Constitution, Intelligence, Wisdom); Criminal lists Dexterity, Intelligence, Charisma (SRD: Dexterity, Constitution, Intelligence) | **Same item U13**: data fix |
| Shield | No shield item kind; `EquipmentSlot` has no shield slot; armour proficiencies are light, medium, heavy only; the Goblin Warrior carries `effect.item.shield_stopgap` (+2 AC) | **Fork item U14 (ITM-1)**: a Shield that occupies the off hand (a versatile weapon then rolls its one-handed die, which `is_wielding_weapon_with_both_hands` already does), +2 AC, and shield training. `shield_stopgap` stays until MON-2 replaces it |
| Mace, Chain Shirt | Neither item exists; Chain Mail does | **Fork item U15 (ITM-2, ITM-3)**: item JSON. ITM-3 only if D3 keeps the Chain Shirt. Leather Armor (ITM-5) gets its test and PROGRESS row in the same item |
| Potions | No consumable item kind, no item-granted action, no quantity spent on use | **Fork item U16 (ITM-4)**: a consumable item with an action (Bonus Action; drink, or give to a creature within 5 feet, SRD 5.2.1 "Using a Potion"), used up on use. Format addition: Milestone 8 issue first |
| Dragonborn Breath Weapon | `species/dragonborn.json`: `"_comment": "Missing breath weapon, darkvision and draconic flight!"` | **Fork item U17 (CHR-9, new)** if D6 says build: an action that replaces one attack of the Attack action, 15-foot cone or 30-foot line, Dexterity save, 1d10 of the ancestry's type, uses equal to the Proficiency Bonus per Long Rest |
| Area spells | `TargetingKind::Area { fixed_on_actor }` for Burning Hands (cone) and Thunderwave; table's `legal_actions` skips every area option (`TargetingKind::Area { .. } => continue`) and `submit.point` answers `not_implemented` | **Ours (API-10)**, no core change. TASKS.md lists it as `Up?`, Gate Y; §8 moves it to `Ours`, Gate N |
| Reactions | Opportunity Attack and the Shield spell exist; table's `react` serves Tactical Mind (fixture `help_combat.jsonl`) and scripted opportunity attacks (`explore.jsonl`) | **Ours (ENG-1)**: a client answering an Opportunity Attack and the Wizard's Shield, and `trigger.event_seq` pointing at the triggering event instead of the log head. TASKS.md lists ENG-1 as `Up`, Gate Y; §8 moves it to `Ours`, Gate N |
| Conditions | Effects exist for Incapacitated, Paralyzed and Poisoned only; Unconscious comes from the life state | **Ours (API-20)**: map those four. Prone and Frightened come with Monsters (MON-4) |
| Event order across core's two logs (API-16) | Core event ids are random UUIDs, so the table cannot interleave the encounter log and the global log | **Fork item U18**: a sequence number on core events. Engine plumbing, so no PROGRESS row |
| Time passing between scenes | `systems::time::advance_time(engine, entity, step)` exists | **Ours**, if D9 says time passes |

**Result:** the Cleric, Human, origin feats, Shield, items, Potion, partial recharge, Breath Weapon and event sequence are fork items (U9 to U18), all going upstream at Milestone 8 (Rule 6). ENG-3 shrinks to a test. API-10, ENG-1 and API-20 need no core change.

## 3. The pregens

Ability scores are the SRD 5.2.1 standard array assignment for each class (Character Creation, "Standard Array by Class"), plus the background's +2 and +1. HP is the hit die maximum plus the Constitution modifier at level 1, then core's fixed `hp_per_level` plus the modifier at level 2. These numbers are the exit fixture's assertions. They assume the recommended D3, D4 and D5.

| Pregen | Species, background, feats | STR DEX CON INT WIS CHA | AC | HP | Equipment |
|---|---|---|---|---|---|
| Fighter (human seat) | Human (Skillful: Insight; Versatile: Skilled); Soldier (Savage Attacker); Fighting Style: Defense | 17 14 14 8 10 12 | 19 = Chain Mail 16, Shield 2, Defense 1 | 20 = 10+2, 6+2 | Longsword, Shield, Chain Mail, 1 Potion of Healing |
| Cleric | Human (Skillful: Persuasion; Versatile: Skilled); Soldier (Savage Attacker); Divine Order: Protector | 15 8 15 10 15 12 | 18 = Chain Mail 16, Shield 2 | 17 = 8+2, 5+2 | Mace, Shield, Chain Mail, 1 Potion of Healing |
| Wizard | Dragonborn (red, fire); Soldier (Savage Attacker) | 8 13 15 15 14 10 | 11 = 10, Dex 1 | 14 = 6+2, 4+2 | Quarterstaff, 1 Potion of Healing |
| Barbarian (optional) | Human (Skillful: Survival; Versatile: Skilled); Soldier (Savage Attacker) | 17 13 15 10 12 8 | 13 = 10, Dex 1, Con 2 | 23 = 12+2, 7+2 | Greataxe, 1 Potion of Healing |

- **Cleric spells** (D4): cantrips Guidance, Sacred Flame, Spare the Dying; prepared Bless, Cure Wounds, Guiding Bolt, Healing Word, Shield of Faith; 3 level 1 slots; Channel Divinity 2. Spell save DC 12, spell attack +4 (Wisdom 15).
- **Wizard spells**: cantrips Fire Bolt, Ray of Frost, Acid Splash; prepared Magic Missile, Shield, Burning Hands, Thunderwave, Ice Knife; 3 level 1 slots. Spell save DC 12, spell attack +4 (Intelligence 15). All exist in core.
- Skills, the Wizard's spellbook and the starting gold are in the pregen files, not here.
- One Potion of Healing each is our default, since loot is out of scope and nothing else hands them out.
- With D5 = A (Acolyte and Sage with Magic Initiate), the Cleric's Wisdom is 17 (DC 13, +5) and the Wizard's Intelligence 17 (DC 13, +5), and each knows two more cantrips and one more level 1 spell.

## 4. Contract changes (Rule 1)

Each change lands in the PR that serves it (§7), with its fixture and a CHANGELOG line, from `1.0.0-dev.17` on. Breaking changes are allowed before v1 and are marked **breaking**.

### 4.1 Pregen files (D1)
- New module `pregen.rs` in `nat20-api-contract`, exported as a third schema `generated/nat20-pregen.schema.json` with TS types. The schema hash in `hello` covers it, as it covers the scene schema.
- Files live in `pregens/` (CLAUDE.md layout: our content, CC-BY-4.0). A scene's `SceneCreature.pregen` names one by id; an unknown id is a `bad_scene` error naming the known ids.

```text
PregenFile { id, name, species, subspecies?, background, class, level,
             ability_scores: {strength..charisma}, choices[]: {prompt_id, pick},
             skills[], spells?: {cantrips[], prepared[], spellbook[]},
             equipment[]: {item, quantity, equip?: slot}, money }
```
- `choices` answers the level-up prompts core asks (`choice.fighting_style`, the Divine Order, Skillful, Versatile); the server feeds them to `apply_level_up_decision` in order and fails the load if core asks something the file does not answer.
- Equipping an item that displaces another keeps the displaced one in the inventory (fixes the CHR-4 note that the greatsword is lost).

### 4.2 Commands

| Command | Change | Visibility of the result |
|---|---|---|
| `legal_actions` | Served in explore mode too (D7): the options the actor could take on a turn, with no `prompt_id` (empty) and `can_end_turn: false`. Spell options carry a new optional `spell: {id, level, concentration}` and a stable id `cast/<spell>/<slot level>` (cantrips `cast/<spell>`). Area options are listed (`targeting: "area"`, new) with `area: {shape, size_ft}` and, per aim, the creatures the area would catch (D8). Potion options carry `item: {id, remaining}`. Additive, except **breaking**: the new `Targeting::area` variant (a new enum value is not on Rule 2's additive list; allowed before v1) | the actor's agent, DM for the human |
| `submit` | Served in explore mode (D7): `prompt_id` is ignored, as for `move`. Each explore submit first starts the actor's next turn, as `help` does (§4.7 of the protocol): its action and Bonus Action come back, and whatever lasted until the start of its turn ends. `aim: {handle} \| {anchor} \| {point}` (new, optional) aims an area option; `point` stays accepted for an area option and means the same as `aim.point` | `action` event public, rolls as any roll |
| `get_sheet` | Gains `spellcasting: [{class, ability, save_dc, attack_bonus}]`, `spells: [{id, name, level, prepared, concentration}]`, `concentration?: {spell}` and `effects: [{id, name, source}]`. `equipment` already carries `quantity`. Additive | owner and DM (§5) |
| `get_state` | Creature views gain `conditions` filled (API-20) and, in the DM view only, `effects` and `concentration`. Additive | conditions: everyone (as today); effects and concentration: DM only in state, owner on the sheet |
| `load_scene` | When D9 = A, carried creatures pass 10 minutes: effects and concentration with a shorter duration end, logged as `effect_ended` and `concentration_ended` | `State` |
| `help` | Unchanged. It stays as the dedicated Help command; explore `submit` could replace it later | as today |

### 4.3 Events, errors, roll view
- New event kinds, all additive:
  - `concentration_started{actor, spell}` and `concentration_ended{actor, spell, reason: replaced|failed_save|incapacitated|expired|ended}`, public (a caster visibly maintains a spell);
  - `effect_started{target, effect, source}` and `effect_ended{target, effect}`, owner and DM. Bless and Guiding Bolt are said at the table, but their numbers are not, so players learn them from the `action` event and the narration;
  - `item_used{actor, item, target}`, public.
- `condition_added` and `condition_removed` start being logged (they exist in v1, unused until now).
- **Changed meaning:** a reaction prompt's `trigger.event_seq` names the event that triggered it (the `moved` event for an Opportunity Attack, the attack `roll` for Shield), not the log head (ENG-1).
- `DcSource` gains `spell_save_dc`: the caster's spell save DC (Sacred Flame, Divine Spark, Burning Hands). The Breath Weapon's DC is `rule` (8 + Constitution + Proficiency Bonus). Additive.
- New `RejectReason`s, additive: `no_item_left` (a potion option after the last one is gone), `area_empty` (an aim that catches no creature, refused so no slot is spent on nothing).

### 4.4 Protocol text
`contract/protocol.md` changes in the same PRs:
- §2: time between scenes (D9).
- §4: `legal_actions` and `submit` in explore mode; spell, area and item options; aiming.
- §4.2: the sheet's spell lines; "Dice bonuses such as Bless are left out" stays true.
- §5: rows for spell save DC and spell attack bonus (owner and DM), effects and concentration.
- §6: the new event kinds; `DcSource::spell_save_dc`.
- The status paragraph: `submit.point` is served; conditions are filled.

## 5. What the engine resolves and what the agents decide

| Decision | Engine | Agents |
|---|---|---|
| Which spell, slot level, target or aim | Lists what is legal, refuses the rest | The caster's agent picks (the DM for the human) |
| Healing, damage, saves, spell DC | Yes, from the caster's sheet | Never |
| Who an area catches | Yes, from the aim and the map; allies included | Sees the preview before choosing |
| Concentration end | Yes: a new concentration spell, a failed save, 0 HP, duration | Narrates it |
| Casting out of combat | Resolves it as an explore action (D7) | The DM decides that the fiction allows it and calls `submit`; a player agent asks through the orchestrator |
| Potion: drink or give | Bonus Action, 5 feet, used up | Picks the target |
| Reaction: take or decline | Offers it with its trigger | The reactor's agent answers `react` |
| Time between scenes | Applies 10 minutes per scene change (D9 = A) | Narrates it |

## 6. Fork and upstream items

Fork rules (Rule 6): one branch per item off upstream `main`, in the maintainer's style (registry JSON over code, Lua only where logic needs it, a test in `core/tests/`, a PROGRESS row for SRD content, regenerated `.schemas`, `cargo test --locked` green), merged into `demo`, pinned in its own table PR. All go upstream at Milestone 8; the format additions (U10, U12, U16) start as upstream issues then, under Stas's account.

| Item | Change in core | Row | Size |
|---|---|---|---|
| U9 Cleric | `class.cleric` levels 1 and 2: d8, Wisdom and Charisma saves, skills, Light and Medium armour and Shields, Simple weapons, full Wisdom caster with the entire class list, 3 cantrips, 4 then 5 prepared; Divine Order prompt (Protector: Martial weapons, Heavy armour; Thaumaturge: one cantrip, Wisdom bonus to Arcana and Religion, at least +1); Channel Divinity (2 uses) and Divine Spark (1d8 + Wisdom, 30 feet; heal, or Constitution save for Radiant or Necrotic, half on a success) | CHR-1 | M |
| U10 Partial recharge | `RechargeRule` regains N uses on a rest kind; Channel Divinity regains one on a Short Rest, all on a Long Rest; Second Wind likewise (ENG-10) | ENG-10, CHR-1 | S |
| U11 Cleric spells | Sacred Flame, Guidance (Lua, skill variant), Spare the Dying, Cure Wounds, Healing Word, Bless (Lua), Guiding Bolt, Shield of Faith; plus the ENG-3 healing test | CHR-2, ENG-3 | M |
| U12 Human | `species.human` (Medium or Small, 30 feet); species `prompts_by_level`; Skillful (one skill), Versatile (one Origin feat). Resourceful omitted (Heroic Inspiration) | CHR-3 | S |
| U13 Origin feats and backgrounds | Savage Attacker (once per turn, roll the weapon's damage dice twice and keep the higher), Skilled (three skills); background ability lists per SRD 5.2.1; Soldier's feat becomes Savage Attacker. With D5 = A also Magic Initiate (feat-granted spells and a free cast per Long Rest) and the cantrips it needs; with D5 = C, Alert | CHR-8 | S (A: L) |
| U14 Shield | Shield item kind in the off hand, +2 AC, shield training in armour proficiencies | ITM-1 | S |
| U15 Weapons and armour | Mace; Chain Shirt (only if D3 keeps it); Leather Armor test and PROGRESS row | ITM-2, ITM-3, ITM-5 | S |
| U16 Potions | Consumable item kind with an action, quantity spent on use; Potion of Healing (2d4 + 2, Bonus Action, self or a creature within 5 feet) | ITM-4 | M |
| U17 Breath Weapon | Dragonborn Breath Weapon (D6 = A) | CHR-9 | S |
| U18 Event sequence | A monotonic sequence number on core events so a client can interleave both logs | API-16 | S |

## 7. Ordered task breakdown

Each step is one PR (Rule 8, one concern), green on all CI jobs, with its contract change, fixture, CHANGELOG line and TASKS.md row update. A fork step is two or three PRs: the core item, its pin bump, then the table change. Steps marked † re-record fixtures that include Bren; each says so in its PR.

| # | PR | Rows | Needs | Size |
|---|---|---|---|---|
| 1 | Pregen files: `pregen.rs` in the contract, schema and TS, `pregens/fighter_l2.json` with Bren exactly as today (fixtures unchanged), the loader in `adapter/pregen.rs` | API-26 (new), CHR-4 | | M |
| 2 | Fork U14 Shield and U15 Mace and Chain Shirt; pin bump | ITM-1, ITM-2, ITM-3, ITM-5 | | S + S |
| 3 | Fork U12 Human and U13 origin feats and backgrounds; pin bump † (Soldier's feat changes Bren's damage rolls) | CHR-3, CHR-8 | | M + S |
| 4 | Fighter and Barbarian pregens; Bren becomes the demo Fighter (D2) † ; fixture `pregens.jsonl`: both sheets show the §3 AC and HP | CHR-4 | 1-3 | S |
| 5 | Fork U10 partial recharge; pin bump; Second Wind regains one use on a short rest (`rest.jsonl` †) | ENG-10 | | S + S |
| 6 | Fork U9 Cleric and U11 Cleric spells; pin bump | CHR-1, CHR-2, ENG-3 | 5 | M + M + S |
| 7 | Cleric pregen; sheet `spellcasting`, `spells`, `concentration`; spell option ids and `spell`; `DcSource::spell_save_dc`; concentration events; fixture `cleric_combat.jsonl`: Healing Word lifts a downed ally, Bless adds a d4, concentration ends on a failed save | CHR-4, API-27 (new) | 4, 6 | M |
| 8 | Actions out of combat: `legal_actions` and `submit` in explore mode (D7), time between scenes (D9); fixture `explore_actions.jsonl`: Cure Wounds and Guidance out of combat, Second Wind, Bless carried into a fight, a scene change ends it | API-28 (new) | 7 | M |
| 9 | Fork U16 Potions; pin bump; potion options, `item_used`, `no_item_left`; fixture `potion.jsonl` in and out of combat | ITM-4 | 8 | M + S + S |
| 10 | Area targeting: area options, previews, `aim`, `point` served, `area_empty`; fork U17 Breath Weapon and pin bump (D6); Wizard pregen; fixture `area.jsonl`: Burning Hands catching an ally, Thunderwave, Breath Weapon | API-10, CHR-9, CHR-4 | 4 | M + S + S |
| 11 | Reactions: `trigger.event_seq` names the trigger; fixture `reactions.jsonl`: a client takes and declines an Opportunity Attack, the Wizard casts Shield and the attack misses | ENG-1 | 10 | S |
| 12 | Conditions and effects in state and on the sheet, `effect_started` / `effect_ended`, `condition_added` / `condition_removed` | API-20 | 7 | S |
| 13 | Fork U18 event sequence; pin bump; the session interleaves both logs by it | API-16 | | S + S |
| 14 | Exit fixture `m4_party.jsonl`: the four pregens' sheets, one fight with healing in it, a short rest, healing out of combat, a potion, Shield and an area spell, from one seed; the `nat20-duel` audit covers healing, concentration and spell save rolls | API-29 (new) | 1-13 | S |

Fork steps (2, 3, 5, 6, 9, 13) can run beside table steps once their predecessors are merged. Realistic total: about 4 to 5 weeks of single-thread work; the Cleric (step 6) and the explore actions (step 8) carry the risk.

## 8. TASKS.md changes made with this spec

- New rows:
  - API-26: pregen files in the contract;
  - API-27: spells on the sheet and in options, concentration;
  - API-28: actions out of combat, time between scenes;
  - API-29: Milestone 4 exit fixture;
  - CHR-8: origin feats and SRD background data;
  - CHR-9: Dragonborn Breath Weapon (per D6).
- Dest and Gate corrected per §2: API-10 and ENG-1 to `Ours`, `N`. ENG-3 resized to S (core has the healing pipeline; only its test is missing).
- ITM-3 Chain Shirt: P2 if D3 = A.
- ENG-10 joins Milestone 4 (U10 fixes it with Channel Divinity).
- The Milestone 4 row lists the rows above and points here.

## 9. Test and fixture plan

| Fixture (`contract/fixtures/`) | Shows |
|---|---|
| `pregens.jsonl` | Each pregen's sheet: AC, HP, saves, skills, slots, resources and equipment as §3; another player's `get_sheet` answers `not_visible` |
| `cleric_combat.jsonl` | Sacred Flame (`dc_source: spell_save_dc` in the DM view, none in the player view); Guiding Bolt then an ally's attack with Advantage; Healing Word on a creature at 0 HP (`life_state` conscious); Bless's d4 on an attack; concentration ends on a failed save; Divine Spark heal and damage variants; a spent slot on the owner's sheet only |
| `explore_actions.jsonl` | Explore `legal_actions` (no prompt id); Cure Wounds out of combat; Guidance then a scenario check with its d4; an explore submit gives the action back; Bless cast before `start_combat` still applies in round 1; a scene change ends it (D9) |
| `rest.jsonl` (re-recorded) | Second Wind and Channel Divinity each regain one use on a short rest |
| `potion.jsonl` | Drink in combat as a Bonus Action; give to a downed ally within 5 feet; out of combat; `no_item_left` |
| `area.jsonl` | Burning Hands options with previews; aiming at a creature, an anchor, a point; an aim that catches an ally; `area_empty`; Breath Weapon replacing an attack |
| `reactions.jsonl` | A client's Opportunity Attack taken and declined; Shield raising AC after the attack roll; `trigger.event_seq` equals the triggering event's `seq` |
| `m4_party.jsonl` | The exit run, byte-identical replay |

Other tests:
- **Visibility scan** (CI job `visibility`): no player-projected line contains `save_dc`, `attack_bonus`, `spellcasting`, `effects`, `concentration` of another creature, an `effect_started`/`effect_ended` event for another creature, or `spell_save_dc` as a `dc_source`.
- **Fork tests** in `core/tests/`: U9 Divine Spark heal, damage and half on a save; U10 one use back per short rest; U11 each spell's numbers, Bless and Guidance d4 once per roll, Guiding Bolt Advantage spent by the first attack; U12 Human prompts; U13 Savage Attacker once per turn and keeping the higher roll; U14 Shield AC and the one-handed versatile die; U16 potion used up; U17 Breath Weapon save and uses; U18 sequence order across both logs; ENG-3 heal cap, revive, dead excluded.
- **Server unit tests:** pregen load fails on an unanswered prompt; every pregen's AC and HP equal §3.
- **Audit:** `nat20-duel` audits `m4_party` and fails on any uncited healing roll, spell save, concentration save or potion roll.

## 10. Acceptance, tied to the demo criteria

| Demo criterion (scope §6) | What this milestone proves |
|---|---|
| 1. Scene 1 to 6 unattended | The real party exists; a Cleric keeps it standing between the two fights (healing out of combat and a short rest) |
| 2. Every roll in the engine log | Spell attacks, saves against a spell save DC, healing, concentration saves, potions and Breath Weapon all carry `rN` ids; the audit passes on `m4_party` |
| 3. No narration contradicts state | Concentration, effects and conditions are engine state in the DM view, so the narration check (AGT-9) can read them |
| 4. Latency | Area previews add path probes; `legal_actions` time with four PCs and six monsters is logged in the exit run as a baseline for API-17 |
| 5. Recovery within 2 retries | `area_empty`, `no_item_left` and `needs_variant` (Guidance, Divine Spark) each carry a sentence and `retryable` |
| 6. First-time player | `/sheet` shows the Fighter's AC 19, HP, Second Wind and potion |

**Done when:** the exit criterion holds on nat20-table `main` with CI green, `m4_party.jsonl` replays byte-identically, every Milestone 4 row is `done` or explicitly moved, and the TASKS.md milestone row shows the date.

## 11. Decisions for Stas

Each needs one word. Work continues on the recommended answer; the first implementation PR records the accepted ones in `docs/decisions/` (next number 0023).

| # | Question | Recommend | Options | Why |
|---|---|---|---|---|
| D1 | Pregen format | **JSON** | **JSON**: files in `pregens/`, format in the contract crate (a third schema) · **Rust**: keep them as code in `adapter/pregen.rs` | The layout already reserves `pregens/` for content; a scene names a pregen by id, so the loader can say which ids exist; four characters as data are reviewable without reading Rust. Costs one M step |
| D2 | What happens to Bren (`fighter_l2`) | **Replace** | **Replace**: Bren becomes the Human demo Fighter with a shield, and Bren's fixtures re-record once · **Keep**: Bren stays as a test character beside a new demo Fighter | Step 3 re-records Bren's fixtures anyway (Soldier's real feat changes his damage rolls). Two Fighters double the fixtures to maintain |
| D3 | Cleric armour | **Chain Mail** | **Chain Mail**: Protector, Chain Mail and Shield, AC 18; Chain Shirt (ITM-3) drops to P2 · **Chain Shirt**: Protector, Chain Shirt and Shield (the SRD starting kit), AC 14 with Dex 8 · **Thaumaturge**: Chain Shirt, AC 14, one more cantrip | Protector's Heavy armour training is wasted under a Chain Shirt; the Cleric's Strength 15 meets Chain Mail's 13; one item fewer to build. Decision 0014 named the Chain Shirt, so the ADR supersedes that line |
| D4 | Cleric spells | **Yes** | **Yes**: cantrips Guidance, Sacred Flame, Spare the Dying; prepared Bless, Cure Wounds, Guiding Bolt, Healing Word, Shield of Faith · **No**: say which to swap | The SRD recommends Thaumaturgy as the third cantrip; it has no effect the engine resolves, and Spare the Dying keeps a downed ally from dying at range. The rest are the SRD's recommended four plus Healing Word |
| D5 | Background feats for the casters | **Soldier** | **Soldier**: all four pregens are Soldiers (Savage Attacker); the casters keep Wisdom and Intelligence 15 · **Acolyte**: Cleric Acolyte and Wizard Sage with Magic Initiate, as the SRD pairs them: a new feat format for granted spells, a free cast per Long Rest and four more cantrips (L instead of S); casting stats 17 · **Criminal**: casters take Criminal and Alert (initiative bonus; the swap is never offered); the Wizard's Intelligence can reach 17, the Cleric's Wisdom stays 15 | Every SRD background with Wisdom or Intelligence carries Magic Initiate, the costliest feat in the list, for one free spell a day and two cantrips the agents won't need. A war priest and an army mage are rules-correct and cost nothing beyond Savage Attacker, which the Fighter needs anyway. Cost: spell save DC 12 instead of 13 |
| D6 | Dragonborn Breath Weapon | **Build** | **Build**: fork item U17, S, rides on the area targeting of step 10 · **Omit**: the Wizard plays without a species feature · **Human**: make the Wizard Human and drop Dragonborn | It is a level 1 trait of a pregen the scope names; once area targeting exists it is a small JSON action. Omitting it ships a character missing a rule |
| D7 | Spells and potions out of combat | **Explore submit** | **Explore submit**: `legal_actions` and `submit` work in explore mode, each submit a turn of the actor's · **Commands**: dedicated `cast` and `use_item` explore commands, as `help` is | One path for every action in both modes (Cure Wounds, Guidance, potions, Second Wind); the player agent's tools (`legal_actions`, `submit_decision`) need no explore twin. `help` stays as it is |
| D8 | Aiming an area | **Aim plus preview** | **Aim plus preview**: aim at a creature, anchor or point, and `legal_actions` lists who each aim catches · **Point**: `submit.point` only, the agent works out the geometry | Agents can't see the map; a preview stops friendly fire by accident and keeps rejected decisions under 2 retries (acceptance §6.5) |
| D9 | Time between scenes | **10 minutes** | **10 minutes**: each `load_scene` passes 10 minutes for carried creatures, ending Bless, Guidance and Shield of Faith · **None**: no time passes, buffs carry over indefinitely · **DM says**: `load_scene` takes an elapsed time from the DM | Without time passing, a Bless cast in Scene 2 lasts the whole adventure. A fixed step keeps the DM from ruling on numbers; 10 minutes is the shortest gap any scene transition in *The Silent Mill* implies |

Not asked, because already settled: fork items go upstream at Milestone 8 (Stas, 2026-10-17); scenario and pregen formats never go upstream (design §6); 2024 rules over 2014 (decision 0009).

## Sources

- `TASKS.md` (project copy `/mnt/project-files/engine/TASKS.md`) § Milestones and rows CHR, ITM, ENG, API.
- `docs/scope/demo-run-scope.md` §2, §3, §6; decisions 0009, 0014.
- `contract/protocol.md` §4, §5, §6; `crates/nat20-api-contract/src/{state,events,vocab}.rs`; `crates/nat20-api-server/src/adapter/{game,pregen}.rs`.
- Fork `StGerman/nat20` at 031f7a2: `core/src/systems/{health,time}.rs`, `core/src/components/{class,resource}.rs`, `core/src/components/actions/{action,execution,targeting}.rs`, `core/src/components/items/equipment/{slots,loadout,armor}.rs`, `core/src/registry/serialize/dice.rs`; `assets/registries/{classes,species,backgrounds,feats,items,spells}/`, `assets/registries/.schemas/`.
- SRD 5.2.1 (CC-BY-4.0) via `/mnt/project-files/dnd-wiki/`: Cleric, Human, Dragonborn, Acolyte, Criminal, Sage, Soldier, Alert, Magic Initiate, Savage Attacker, Skilled, Cure Wounds, Healing Word, Bless, Guiding Bolt, Sacred Flame, Guidance, Shield of Faith, Spare the Dying, Thaumaturgy, Potions of Healing, Magic Item Categories ("Using a Potion"), Character Creation ("Standard Array by Class").
