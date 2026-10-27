//! The fight-balance sweep (M7 design §3.6, TASKS.md MON-10): a competent scripted party plays
//! The Silent Mill's chain of fights through the engine API, seed after seed, and the sweep counts
//! how often it reaches Scene 6 standing.
//!
//! The chain is Scene 2 (the snare and the lookout checks, which decide the yard's surprise),
//! Scene 3 (the yard fight), Scene 4 (a short rest and the interrogation, which can warn the boss)
//! and Scene 5 (the cellar fight), with the party carried from scene to scene. The flags that change
//! the fights come from rolled checks and the engine places the spawns, so each seed reaches its own
//! variant and nothing is forced (Rule 4). Monsters keep the engine's own policy.
//!
//! The party plays as a sensible table would: the best skill in the party makes each check, a
//! downed ally is healed first (a healing spell, else a Potion of Healing), a member at a third of
//! their Hit Points or less drinks a potion, the Barbarian rages, the Fighter takes Second Wind and
//! Action Surge, the Cleric blesses three allies and keeps her spell slots for healing, the Wizard
//! aims an area spell where it catches two foes and no ally, and everyone attacks the foe in reach
//! with the fewest Hit Points, walking toward the nearest foe as far as movement allows (`move`
//! with `partial`, API-35). Between fights the Cleric heals whoever is down, and the
//! short rest spends Hit Point Dice up to full.

use std::path::Path;

use nat20_api_contract::{
    ActionOption, Aim, Awaiting, CheckSpec, CheckTest, Command, CommandResult, CreatureFull,
    Handle, HitDiceSpend, LifeState, MoveTarget, OptionId, PointFt, PromptId, Response, Sheet,
    Side, State, Targeting, TurnBudget,
};
use nat20_api_server::Server;
use serde::Serialize;

use crate::client::Client;

/// The pregens, in seat order.
pub const PARTY: [&str; 4] = ["bren", "torva", "maren", "ilsa"];

/// The spells that heal the creature they target.
const HEALING_SPELLS: [&str; 2] = ["healing_word", "cure_wounds"];
/// The pregens' spells that harm the creature they target.
const HARMFUL_SPELLS: [&str; 6] = [
    "acid_splash",
    "fire_bolt",
    "guiding_bolt",
    "ice_knife",
    "ray_of_frost",
    "sacred_flame",
];
/// The pregens' area spells that harm what they catch.
const AREA_SPELLS: [&str; 2] = ["burning_hands", "thunderwave"];
/// The flags that change each fight: the yard's surprise; the warned boss and the cellar's layout.
fn fight_flags(encounter: &str) -> &'static [&'static str] {
    match encounter {
        "yard_fight" => &["party_ambushes"],
        "cellar_fight" => &["boss_warned", "knows_cellar_layout"],
        _ => &[],
    }
}
/// Commands a creature may send in one turn before the policy ends it: a refused command never
/// loops.
const COMMANDS_PER_TURN: usize = 16;
/// Turns before a fight counts as a stalemate.
const TURNS_PER_FIGHT: usize = 600;

/// One fight's outcome.
#[derive(Debug, Clone, Serialize)]
pub struct FightResult {
    pub encounter: String,
    /// What made this seed's variant of the fight: the flags and spawns in play.
    pub variant: Vec<String>,
    /// The party won: the other side is down or surrendered.
    pub won: bool,
    /// The fight never ended within the policy's turn budget.
    pub stalemate: bool,
    pub rounds: u32,
    /// Party members dead after the fight.
    pub deaths: u32,
    /// Party members at 0 Hit Points (not dead) after the fight.
    pub down: u32,
    /// The party's Hit Points left, as a share of their maximum.
    pub hp_left: f32,
    pub potions: u32,
}

/// One seed's chain.
#[derive(Debug, Clone, Serialize)]
pub struct ChainResult {
    pub seed: u32,
    pub fights: Vec<FightResult>,
    /// The party reached Scene 6 with someone standing and nobody dead.
    pub reached_scene_6_standing: bool,
    /// Someone in the party is standing at the end, deaths aside.
    pub survived: bool,
}

/// Plays the chain once at `seed` against the scenario pack in `pack`.
pub fn run_chain(pack: &Path, seed: u32) -> ChainResult {
    let mut table = Table {
        client: Client::with_id_prefix(Server::with_data_dir(pack.to_path_buf()), "b"),
        potions: 0,
    };
    table.dm(Command::NewSession { seed: Some(seed) });
    table.load("s1_village_green", &[]);
    table.load("s2_mill_road", &PARTY);
    table.best_check("find_tracks");
    table.best_check("spot_lookouts");
    table.load("s3_mill_yard", &PARTY);
    let mut fights = vec![table.fight("yard_fight")];
    if fights[0].won {
        let captives: Vec<String> = table
            .creatures()
            .into_iter()
            .filter(|c| c.side == Side::Neutral && c.life_state == LifeState::Conscious)
            .map(|c| c.handle.0)
            .collect();
        table.recover();
        let mut party: Vec<&str> = PARTY.to_vec();
        party.extend(captives.iter().map(String::as_str));
        table.load("s4_captured_goblin", &party);
        table.short_rest();
        table.recover();
        // The interrogation needs someone to question.
        if !captives.is_empty() {
            let intimidate = table.best_bonus("interrogate_intimidation");
            let persuade = table.best_bonus("interrogate_persuasion");
            table.best_check(if intimidate >= persuade {
                "interrogate_intimidation"
            } else {
                "interrogate_persuasion"
            });
        }
        table.load("s5_mill_cellar", &PARTY);
        fights.push(table.fight("cellar_fight"));
    }
    let party = table.party();
    let survived = party.iter().any(|c| c.life_state == LifeState::Conscious);
    let dead = party.iter().any(|c| c.life_state == LifeState::Dead);
    ChainResult {
        seed,
        reached_scene_6_standing: fights.len() == 2 && fights.iter().all(|f| f.won) && !dead,
        survived,
        fights,
    }
}

struct Table {
    client: Client,
    potions: u32,
}

impl Table {
    fn dm(&mut self, command: Command) -> Response {
        self.client.send("dm", command)
    }

    fn load(&mut self, scene: &str, party: &[&str]) {
        let response = self.dm(Command::LoadScene {
            scene_id: scene.into(),
            party: party.iter().map(|h| Handle((*h).into())).collect(),
        });
        assert!(response.ok, "load_scene {scene}: {:?}", response.error);
    }

    fn state(&mut self) -> State {
        match self.dm(Command::GetState).result {
            Some(CommandResult::GetState { state }) => state,
            other => panic!("get_state: {other:?}"),
        }
    }

    fn creatures(&mut self) -> Vec<CreatureFull> {
        match self.state() {
            State::Dm { creatures, .. } => creatures,
            State::Player { .. } => unreachable!("the DM's view"),
        }
    }

    fn party(&mut self) -> Vec<CreatureFull> {
        self.creatures()
            .into_iter()
            .filter(|c| PARTY.contains(&c.handle.0.as_str()))
            .collect()
    }

    fn sheet(&mut self, handle: &str) -> Sheet {
        match self
            .dm(Command::GetSheet {
                actor: Handle(handle.into()),
            })
            .result
        {
            Some(CommandResult::GetSheet { sheet }) => sheet,
            other => panic!("get_sheet {handle}: {other:?}"),
        }
    }

    /// The conscious party member with the best bonus for a scene check, and that bonus.
    fn best_for(&mut self, check_id: &str) -> Option<(String, i8)> {
        let State::Dm { checks, .. } = self.state() else {
            unreachable!("the DM's view")
        };
        let test = checks.into_iter().find(|c| c.id == check_id)?.test;
        let up: Vec<String> = self
            .party()
            .into_iter()
            .filter(|c| c.life_state == LifeState::Conscious)
            .map(|c| c.handle.0)
            .collect();
        up.into_iter()
            .map(|handle| {
                let sheet = self.sheet(&handle);
                let bonus = match &test {
                    CheckTest::Skill { skill } => sheet
                        .skills
                        .iter()
                        .find(|s| &s.skill == skill)
                        .map_or(0, |s| s.bonus),
                    CheckTest::Save { ability } => sheet
                        .abilities
                        .iter()
                        .find(|a| &a.ability == ability)
                        .map_or(0, |a| a.save_bonus),
                };
                (handle, bonus)
            })
            .max_by_key(|(_, bonus)| *bonus)
    }

    fn best_bonus(&mut self, check_id: &str) -> i8 {
        self.best_for(check_id).map_or(i8::MIN, |(_, bonus)| bonus)
    }

    /// The scene check, made by the party member best at it. The engine rolls and decides.
    fn best_check(&mut self, check_id: &str) {
        let Some((actor, _)) = self.best_for(check_id) else {
            return;
        };
        let response = self.dm(Command::RequestCheck {
            actor: Handle(actor),
            check: CheckSpec::Scenario {
                check_id: check_id.into(),
            },
        });
        assert!(response.ok, "check {check_id}: {:?}", response.error);
    }

    /// A short rest for every member with Hit Points, spending Hit Point Dice up to full.
    fn short_rest(&mut self) {
        let up: Vec<CreatureFull> = self.party().into_iter().filter(|c| c.hp > 0).collect();
        if up.is_empty() {
            return;
        }
        let mut hit_dice = Vec::new();
        for c in &up {
            let missing = c.hp_max - c.hp;
            if missing == 0 {
                continue;
            }
            let sheet = self.sheet(&c.handle.0);
            let Some(pool) = sheet.hit_dice.first() else {
                continue;
            };
            // A die averages half its size plus a half, and the Constitution modifier adds to it.
            let average = (u32::from(pool.die) / 2 + 1).max(1);
            let count = missing.div_ceil(average).min(pool.remaining);
            if count > 0 {
                hit_dice.push(HitDiceSpend {
                    handle: c.handle.clone(),
                    count,
                });
            }
        }
        let response = self.dm(Command::ShortRest {
            participants: up.iter().map(|c| c.handle.clone()).collect(),
            hit_dice,
        });
        assert!(response.ok, "short_rest: {:?}", response.error);
    }

    /// Out of combat: whoever can heals each member who is down, a spell first, else a potion
    /// (protocol §4.8). Walks up first: explore moves cost nothing.
    fn recover(&mut self) {
        for _ in 0..PARTY.len() {
            let party = self.party();
            let Some(down) = party
                .iter()
                .find(|c| c.hp == 0 && c.life_state != LifeState::Dead)
            else {
                return;
            };
            let down = down.handle.clone();
            let healers: Vec<Handle> = party
                .iter()
                .filter(|c| c.life_state == LifeState::Conscious)
                .map(|c| c.handle.clone())
                .collect();
            let mut healed = false;
            for healer in healers {
                self.dm(Command::Move {
                    actor: healer.clone(),
                    to: MoveTarget::Creature {
                        handle: down.clone(),
                    },
                    prompt_id: None,
                    partial: false,
                });
                let options = self.options(&healer.0).0;
                if let Some((option, potion)) = heal_option(&options, &down)
                    && self.submit(&healer.0, None, &option, vec![down.clone()], None)
                {
                    self.potions += u32::from(potion);
                    healed = true;
                    break;
                }
            }
            if !healed {
                return;
            }
        }
    }

    /// The actor's options and turn budget, and the prompt they answer (each accepted command on a
    /// turn opens a new one).
    fn options(&mut self, actor: &str) -> (Vec<ActionOption>, Option<TurnBudget>, PromptId) {
        match self
            .dm(Command::LegalActions {
                actor: Handle(actor.into()),
            })
            .result
        {
            Some(CommandResult::LegalActions {
                options,
                budget,
                prompt_id,
                ..
            }) => (options, budget, prompt_id),
            _ => (Vec::new(), None, PromptId(String::new())),
        }
    }

    fn submit(
        &mut self,
        actor: &str,
        prompt_id: Option<&PromptId>,
        option: &OptionId,
        targets: Vec<Handle>,
        aim: Option<Aim>,
    ) -> bool {
        let response = self.dm(Command::Submit {
            actor: Handle(actor.into()),
            prompt_id: prompt_id.cloned(),
            option_id: option.clone(),
            targets,
            point: None,
            aim,
            variant: None,
        });
        response.ok && self.settle(response).ok
    }

    /// Answers the reaction prompts `response` leaves pending: the first reaction offered, unless
    /// it answers a party member (an Opportunity Attack on an ally walking away, which the rules
    /// allow and no player takes).
    fn settle(&mut self, mut response: Response) -> Response {
        while let Awaiting::Reaction {
            prompt_id,
            actor,
            trigger,
            ..
        } = response.awaiting.clone()
        {
            let on_ally = PARTY
                .iter()
                .any(|h| trigger.summary.ends_with(&format!(" react to {h}.")));
            response = self.dm(Command::React {
                actor,
                prompt_id,
                choice: if on_ally { None } else { Some(0) },
            });
            if !response.ok {
                break;
            }
        }
        response
    }

    /// Starts the encounter and plays the party until it ends.
    fn fight(&mut self, encounter: &str) -> FightResult {
        let potions_before = self.potions;
        let mut response = self.dm(Command::StartCombat {
            encounter_id: encounter.into(),
        });
        assert!(
            response.ok,
            "start_combat {encounter}: {:?}",
            response.error
        );
        let mut stalemate = true;
        let mut rounds = 0;
        let mut variant = Vec::new();
        for _ in 0..TURNS_PER_FIGHT {
            match response.awaiting.clone() {
                Awaiting::Reaction { .. } => response = self.settle(response),
                Awaiting::Action { prompt_id, actor } => {
                    let State::Dm {
                        encounters,
                        round,
                        flags,
                        spawns,
                        ..
                    } = self.state()
                    else {
                        unreachable!("the DM's view")
                    };
                    rounds = rounds.max(round.unwrap_or(1));
                    variant = flags
                        .into_iter()
                        .filter(|f| fight_flags(encounter).contains(&f.as_str()))
                        .chain(spawns.into_iter().filter(|s| s.placed).map(|s| s.id))
                        .collect();
                    // The DM takes a surrender the engine shows available (AGT-30).
                    if encounters
                        .iter()
                        .any(|e| e.running && e.surrender_available)
                    {
                        response = self.dm(Command::EndCombat {
                            reason: nat20_api_contract::EndCombatReason::Surrender,
                        });
                        continue;
                    }
                    response = self.turn(&actor.0, &prompt_id);
                }
                Awaiting::CombatOver { .. } | Awaiting::Idle | Awaiting::NoSession => {
                    stalemate = false;
                    break;
                }
            }
        }
        if stalemate {
            self.dm(Command::EndCombat {
                reason: nat20_api_contract::EndCombatReason::Scenario,
            });
        }
        let creatures = self.creatures();
        let party: Vec<&CreatureFull> = creatures
            .iter()
            .filter(|c| PARTY.contains(&c.handle.0.as_str()))
            .collect();
        let foes_up = creatures
            .iter()
            .any(|c| c.side == Side::Hostile && c.life_state == LifeState::Conscious);
        let standing = party.iter().any(|c| c.life_state == LifeState::Conscious);
        let hp: u32 = party.iter().map(|c| c.hp).sum();
        let hp_max: u32 = party.iter().map(|c| c.hp_max).sum();
        FightResult {
            encounter: encounter.into(),
            variant,
            won: !stalemate && standing && !foes_up,
            stalemate,
            rounds,
            deaths: party
                .iter()
                .filter(|c| c.life_state == LifeState::Dead)
                .count() as u32,
            down: party
                .iter()
                .filter(|c| c.hp == 0 && c.life_state != LifeState::Dead)
                .count() as u32,
            hp_left: if hp_max == 0 {
                0.0
            } else {
                hp as f32 / hp_max as f32
            },
            potions: self.potions - potions_before,
        }
    }

    /// One party member's turn, by the policy in the module comment. Returns the response that
    /// ends it.
    fn turn(&mut self, actor: &str, first_prompt: &PromptId) -> Response {
        let mut used: Vec<String> = Vec::new();
        let mut walks = 0;
        let mut pending = first_prompt.clone();
        for _ in 0..COMMANDS_PER_TURN {
            let creatures = self.creatures();
            let me = creatures
                .iter()
                .find(|c| c.handle.0 == actor)
                .expect("the actor is in the scene")
                .clone();
            let (options, budget, prompt) = self.options(actor);
            let Some(budget) = budget else { break };
            pending = prompt;
            let prompt_id = &pending;
            let tried = |id: &OptionId, used: &[String]| used.contains(&id.0);

            // A downed ally first: a healing spell or a potion, if one reaches them.
            let downed: Vec<&CreatureFull> = creatures
                .iter()
                .filter(|c| c.side == Side::Party && c.hp == 0 && c.life_state != LifeState::Dead)
                .collect();
            if let Some((option, target, potion)) = downed.iter().find_map(|d| {
                heal_option(&options, &d.handle)
                    .filter(|(id, _)| !tried(id, &used))
                    .map(|(id, potion)| (id, d.handle.clone(), potion))
            }) {
                let option = options.iter().find(|o| o.option_id == option).unwrap();
                if self.attempt(&mut used, actor, prompt_id, option, vec![target], potion) {
                    continue;
                }
            }
            // A third of my Hit Points or less: a potion.
            if me.hp * 3 <= me.hp_max
                && let Some(option) = options.iter().find(|o| {
                    o.item.as_ref().is_some_and(|i| i.id.contains("potion"))
                        && o.targets.iter().any(|t| t.handle == me.handle)
                        && !tried(&o.option_id, &used)
                })
                && self.attempt(
                    &mut used,
                    actor,
                    prompt_id,
                    option,
                    vec![me.handle.clone()],
                    true,
                )
            {
                continue;
            }
            let foes: Vec<&CreatureFull> = creatures
                .iter()
                .filter(|c| c.side == Side::Hostile && c.life_state == LifeState::Conscious)
                .collect();
            if foes.is_empty() {
                break;
            }
            // Rage, Second Wind at half Hit Points or less.
            let feature = |id: &str, used: &[String]| {
                options
                    .iter()
                    .find(|o| o.option_id.0.ends_with(id) && !tried(&o.option_id, used))
            };
            if let Some(rage) = feature("/rage", &used)
                && self.attempt(&mut used, actor, prompt_id, rage, Vec::new(), false)
            {
                continue;
            }
            if me.hp * 2 <= me.hp_max
                && let Some(wind) = feature("/second_wind", &used)
                && self.attempt(&mut used, actor, prompt_id, wind, Vec::new(), false)
            {
                continue;
            }
            // Bless three allies before the first blow, once.
            if me.concentration.is_none()
                && let Some(bless) = options.iter().find(|o| {
                    o.spell.as_ref().is_some_and(|sp| sp.id == "bless")
                        && !tried(&o.option_id, &used)
                })
            {
                let mut allies: Vec<Handle> = bless
                    .targets
                    .iter()
                    .filter(|t| t.side == Side::Party && t.in_range && t.handle != me.handle)
                    .map(|t| t.handle.clone())
                    .collect();
                allies.push(me.handle.clone());
                allies.truncate(bless.max_targets.max(1) as usize);
                if allies.len() >= 3
                    && self.attempt(&mut used, actor, prompt_id, bless, allies, false)
                {
                    continue;
                }
            }
            // An area spell where it catches two foes or more and no ally.
            let side_of = |h: &Handle| creatures.iter().find(|c| &c.handle == h).map(|c| c.side);
            let area = options
                .iter()
                .filter(|o| o.targeting == Targeting::Area && !tried(&o.option_id, &used))
                .filter(|o| {
                    o.spell
                        .as_ref()
                        .is_some_and(|sp| AREA_SPELLS.contains(&sp.id.as_str()))
                })
                .flat_map(|o| {
                    o.area
                        .iter()
                        .flat_map(move |a| a.aims.iter().map(move |aim| (o, aim)))
                })
                .filter(|(_, aim)| {
                    aim.catches
                        .iter()
                        .all(|h| side_of(h) == Some(Side::Hostile))
                        && aim.catches.len() >= 2
                })
                .max_by_key(|(_, aim)| aim.catches.len());
            if let Some((option, aim)) = area {
                used.push(option.option_id.0.clone());
                if self.submit(
                    actor,
                    Some(prompt_id),
                    &option.option_id,
                    Vec::new(),
                    Some(aim.aim.clone()),
                ) {
                    continue;
                }
            }
            // Attack the foe in reach with the fewest Hit Points. A healer keeps its spell slots
            // for healing.
            let healer = options.iter().any(|o| {
                o.spell
                    .as_ref()
                    .is_some_and(|sp| HEALING_SPELLS.contains(&sp.id.as_str()))
            });
            let hp_of = |h: &Handle| {
                foes.iter()
                    .find(|f| &f.handle == h)
                    .map_or(u32::MAX, |f| f.hp)
            };
            let attack = options
                .iter()
                .filter(|o| harms(o) && !(healer && o.cost.spell_slot.is_some()))
                .flat_map(|o| {
                    o.targets
                        .iter()
                        .filter(|t| {
                            t.side == Side::Hostile && t.in_range && hp_of(&t.handle) != u32::MAX
                        })
                        .map(move |t| (o, t.handle.clone()))
                })
                .min_by_key(|(o, t)| (hp_of(t), u8::from(o.spell.is_some())));
            if let Some((option, target)) = attack
                && self.attempt(&mut used, actor, prompt_id, option, vec![target], false)
            {
                continue;
            }
            // Out of actions: Action Surge gives another.
            if budget.action == 0
                && let Some(surge) = feature("/action_surge", &used)
                && self.attempt(&mut used, actor, prompt_id, surge, Vec::new(), false)
            {
                continue;
            }
            // Walk toward the nearest foe as far as movement allows, unless a ranged option
            // already reaches one.
            let reach_ranged = options.iter().filter(|o| harms(o)).any(|o| {
                o.targets
                    .iter()
                    .any(|t| t.side == Side::Hostile && t.in_range)
            });
            if budget.movement_ft >= 5 && budget.action > 0 && !reach_ranged && walks < 2 {
                walks += 1;
                let nearest = foes
                    .iter()
                    .min_by(|a, b| {
                        distance(&me.position_ft, &a.position_ft)
                            .total_cmp(&distance(&me.position_ft, &b.position_ft))
                    })
                    .unwrap();
                if self.walk_toward(actor, prompt_id, nearest) {
                    continue;
                }
            }
            break;
        }
        let (_, _, prompt_id) = self.options(actor);
        self.dm(Command::EndTurn {
            actor: Handle(actor.into()),
            prompt_id: if prompt_id.0.is_empty() {
                pending
            } else {
                prompt_id
            },
        })
    }

    /// Submits one option on the actor's turn and remembers it was tried, so a refused one isn't
    /// tried again this turn.
    #[allow(clippy::too_many_arguments)]
    fn attempt(
        &mut self,
        used: &mut Vec<String>,
        actor: &str,
        prompt_id: &PromptId,
        option: &ActionOption,
        targets: Vec<Handle>,
        potion: bool,
    ) -> bool {
        used.push(option.option_id.0.clone());
        let ok = self.submit(actor, Some(prompt_id), &option.option_id, targets, None);
        if ok && potion {
            self.potions += 1;
        }
        ok
    }

    /// Walks toward `foe`, next to it if the movement left reaches, else as far as it goes
    /// (`partial`, API-35). Whether the route is open is the engine's call.
    fn walk_toward(&mut self, actor: &str, prompt_id: &PromptId, foe: &CreatureFull) -> bool {
        let moved = self.dm(Command::Move {
            actor: Handle(actor.into()),
            to: MoveTarget::Creature {
                handle: foe.handle.clone(),
            },
            prompt_id: Some(prompt_id.clone()),
            partial: true,
        });
        let walked =
            matches!(moved.result, Some(CommandResult::Move { moved_ft, .. }) if moved_ft > 0.0);
        moved.ok && self.settle(moved).ok && walked
    }
}

/// The option that heals `target` from here, and whether it is a potion: a healing spell first.
fn heal_option(options: &[ActionOption], target: &Handle) -> Option<(OptionId, bool)> {
    let reaches = |o: &ActionOption| o.targets.iter().any(|t| &t.handle == target && t.in_range);
    options
        .iter()
        .find(|o| {
            o.spell
                .as_ref()
                .is_some_and(|s| HEALING_SPELLS.contains(&s.id.as_str()))
                && reaches(o)
        })
        .map(|o| (o.option_id.clone(), false))
        .or_else(|| {
            options
                .iter()
                .find(|o| o.item.as_ref().is_some_and(|i| i.id.contains("potion")) && reaches(o))
                .map(|o| (o.option_id.clone(), true))
        })
}

/// Whether an option damages the one creature it targets: a weapon attack or a damaging spell.
fn harms(option: &ActionOption) -> bool {
    if option.targeting != Targeting::Single || !option.variants.is_empty() || option.item.is_some()
    {
        return false;
    }
    match &option.spell {
        Some(spell) => HARMFUL_SPELLS.contains(&spell.id.as_str()),
        None => !option.option_id.0.starts_with("help/"),
    }
}

fn distance(a: &PointFt, b: &PointFt) -> f32 {
    ((a.x_ft - b.x_ft).powi(2) + (a.y_ft - b.y_ft).powi(2) + (a.z_ft - b.z_ft).powi(2)).sqrt()
}

/// The sweep's Markdown report: the share of seeds that reach Scene 6 standing (the target is 90%),
/// then each fight overall and by variant.
pub fn report(results: &[ChainResult]) -> String {
    let n = results.len();
    let pct = |k: usize, of: usize| {
        if of == 0 {
            "n/a".to_string()
        } else {
            format!("{:.0}%", 100.0 * k as f32 / of as f32)
        }
    };
    let reached = results
        .iter()
        .filter(|r| r.reached_scene_6_standing)
        .count();
    let mut out = format!(
        "Reached Scene 6 standing: {reached} of {n} seeds ({}); the target is 90%.\n\n",
        pct(reached, n)
    );
    out.push_str("| Fight | Variant | Seeds | Won | Stalemates | Rounds (mean) | Deaths | Down after | HP left (mean) | Potions |\n");
    out.push_str("|---|---|---|---|---|---|---|---|---|---|\n");
    for encounter in ["yard_fight", "cellar_fight"] {
        let fights: Vec<&FightResult> = results
            .iter()
            .flat_map(|r| &r.fights)
            .filter(|f| f.encounter == encounter)
            .collect();
        let mut variants: Vec<String> = fights.iter().map(|f| variant_name(f)).collect();
        variants.sort();
        variants.dedup();
        let rows = std::iter::once(("all".to_string(), fights.clone())).chain(
            variants.into_iter().map(|v| {
                let of: Vec<&FightResult> = fights
                    .iter()
                    .copied()
                    .filter(|f| variant_name(f) == v)
                    .collect();
                (v, of)
            }),
        );
        for (variant, of) in rows {
            if of.is_empty() {
                continue;
            }
            let k = of.len();
            let mean =
                |f: &dyn Fn(&FightResult) -> f32| of.iter().map(|x| f(x)).sum::<f32>() / k as f32;
            out.push_str(&format!(
                "| {encounter} | {variant} | {k} | {} ({}) | {} | {:.1} | {} | {} | {:.0}% | {} |\n",
                of.iter().filter(|f| f.won).count(),
                pct(of.iter().filter(|f| f.won).count(), k),
                of.iter().filter(|f| f.stalemate).count(),
                mean(&|f| f.rounds as f32),
                of.iter().map(|f| f.deaths).sum::<u32>(),
                of.iter().map(|f| f.down).sum::<u32>(),
                100.0 * mean(&|f| f.hp_left),
                of.iter().map(|f| f.potions).sum::<u32>(),
            ));
        }
    }
    out
}

fn variant_name(fight: &FightResult) -> String {
    if fight.variant.is_empty() {
        "plain".into()
    } else {
        fight.variant.join(" + ")
    }
}
