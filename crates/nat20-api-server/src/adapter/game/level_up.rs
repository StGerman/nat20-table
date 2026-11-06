//! Experience and level-ups in play (API-44): the XP a won fight earns (ENG-31) and core's
//! `LevelUpSession`, asked one choice at a time of the levelling character's player.

use nat20_api_contract::{LevelUpChoice, PromptId, RosterChoice};
use nat20_core::{
    components::{level::CharacterLevels, level_up::LevelUpPrompt},
    systems::level_up::{LevelUpDecision, LevelUpSession},
};

use super::*;
use crate::adapter::choices::{self, Offer};

/// A level-up in progress: core's session and the choice the player is asked.
pub(super) struct OpenLevelUp {
    entity: Entity,
    handle: String,
    /// The level it reaches.
    level: u8,
    session: LevelUpSession,
    /// The choice asked now, with core's options in wire order.
    asked: Option<Asked>,
}

impl OpenLevelUp {
    /// The levelling character.
    pub(super) fn handle(&self) -> &str {
        &self.handle
    }
}

struct Asked {
    choice: LevelUpChoice,
    /// The prompt as offered, with core's options.
    offer: Offer,
}

impl Game {
    /// A fight the party won earns each of its characters an even share of the XP of every
    /// hostile creature in it (SRD 5.2.1). Applies it through core and returns the
    /// `xp_awarded` entries (owner and DM), to log after `combat_over`. They carry no round:
    /// the fight is over when they are logged.
    pub(super) fn award_xp(
        &mut self,
        participants: &[Entity],
        winner: Option<Side>,
    ) -> Vec<Pending> {
        if winner != Some(Side::Party) {
            return Vec::new();
        }
        let foes: u32 = participants
            .iter()
            .filter(|e| self.side_of(**e) == Some(Side::Hostile))
            .map(|e| systems::experience::worth(&self.engine.world, *e))
            .sum();
        let party: Vec<Entity> = participants
            .iter()
            .copied()
            .filter(|e| self.side_of(*e) == Some(Side::Party))
            .filter(|e| self.engine.world.get::<&CharacterLevels>(*e).is_ok())
            .collect();
        if foes == 0 || party.is_empty() {
            return Vec::new();
        }
        let share = systems::experience::award(&mut self.engine, &party, foes);
        party
            .iter()
            .map(|e| {
                let handle = Handle(self.handle_of(*e));
                Pending {
                    round: None,
                    visibility: Visibility::Owner {
                        handle: handle.clone(),
                    },
                    kind: EventKind::XpAwarded {
                        actor: handle,
                        xp: share,
                        total: systems::experience::experience(&self.engine.world, *e),
                        can_level_up: systems::experience::can_level_up(&self.engine.world, *e),
                    },
                }
            })
            .collect()
    }

    /// `level_up`: opens a level-up for a character with the XP for its next level, out of
    /// combat, and returns the first choice its player makes; `None` once it is done. Sent
    /// again while it is open, it returns the open choice.
    pub fn level_up(&mut self, handle: &str) -> Result<Option<LevelUpChoice>, ApiError> {
        let entity = self.entity(handle)?;
        if let Some(open) = &self.level_up {
            if open.entity == entity {
                return Ok(open.asked.as_ref().map(|a| a.choice.clone()));
            }
            return Err(rejected(
                RejectReason::LevelUpOpen,
                format!(
                    "{}'s level-up is open; one character levels up at a time.",
                    open.handle
                ),
            ));
        }
        if self.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "A fight is running; level up once it is over.",
            ));
        }
        let (points, next, ready, level) = {
            let Ok(levels) = self.engine.world.get::<&CharacterLevels>(entity) else {
                return Err(rejected(
                    RejectReason::NotEnoughXp,
                    format!("{handle} has no character levels to gain."),
                ));
            };
            (
                levels.experience(),
                levels.experience_for_next_level(),
                levels.can_level_up(),
                levels.total_level() + 1,
            )
        };
        if !ready {
            return Err(rejected(
                RejectReason::NotEnoughXp,
                if level > 20 {
                    format!("{handle} is level 20, the highest level.")
                } else {
                    format!("{handle} has {points} XP; level {level} needs {next}.")
                },
            ));
        }
        self.close_finished_fight();
        self.level_up = Some(OpenLevelUp {
            entity,
            handle: handle.to_owned(),
            level,
            session: LevelUpSession::new(&self.engine.world, entity),
            asked: None,
        });
        self.next_level_up_choice()
    }

    /// `answer_level_up`: answers the open choice and returns the next one; `None` once the
    /// level-up is done. No `picks` takes the recommended ones.
    pub fn answer_level_up(
        &mut self,
        handle: &str,
        prompt_id: &str,
        picks: &[String],
    ) -> Result<Option<LevelUpChoice>, ApiError> {
        self.entity(handle)?;
        if self.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "A fight is running; finish the level-up once it is over.",
            ));
        }
        let Some(asked) = self
            .level_up
            .as_ref()
            .filter(|open| open.handle == handle)
            .and_then(|open| open.asked.as_ref())
        else {
            return Err(rejected(
                RejectReason::NoLevelUp,
                format!("{handle} has no level-up open; level_up opens one."),
            ));
        };
        if asked.choice.prompt_id.0 != prompt_id {
            return Err(error(
                ErrorCode::StalePrompt,
                format!(
                    "Prompt {prompt_id} is not the open level-up choice; it is {}.",
                    asked.choice.prompt_id.0
                ),
            ));
        }
        let picks: Vec<String> = if picks.is_empty() {
            asked.choice.recommended.clone()
        } else {
            picks.to_vec()
        };
        let Some(chosen) = choices::pick(&asked.offer, &picks) else {
            return Err(bad_picks(&asked.choice));
        };
        let decision = choices::decision(&asked.offer, &chosen);
        let made = RosterChoice {
            level: asked.choice.level,
            prompt_id: asked.offer.id.clone(),
            picks,
        };
        if let Err(e) = self.advance_level_up(&decision) {
            self.level_up = None;
            return Err(e);
        }
        self.history
            .entry(handle.to_owned())
            .or_default()
            .push(made);
        self.next_level_up_choice()
    }

    /// Asks the next choice; a level-up that cannot go on is closed, so it never blocks the next.
    fn next_level_up_choice(&mut self) -> Result<Option<LevelUpChoice>, ApiError> {
        let next = self.continue_level_up();
        if next.is_err() {
            self.level_up = None;
        }
        next
    }

    /// The level-up open now: its character and prompt id, for `awaiting`.
    pub fn open_level_up(&self) -> Option<(String, String)> {
        let open = self.level_up.as_ref()?;
        let asked = open.asked.as_ref()?;
        Some((open.handle.clone(), asked.choice.prompt_id.0.clone()))
    }

    fn advance_level_up(&mut self, decision: &LevelUpDecision) -> Result<(), ApiError> {
        let mut open = self.level_up.take().expect("a level-up is open");
        let result = open.session.advance(&mut self.engine, decision);
        let handle = open.handle.clone();
        self.level_up = Some(open);
        result.map_err(|e| {
            eprintln!("level-up of {handle}: core refused {decision:?}: {e:?}");
            error(
                ErrorCode::Internal,
                format!("Core refused an answer in {handle}'s level-up."),
            )
        })
    }

    /// Answers every prompt that needs no player (the class, a choice with one option) and
    /// asks the first that does. When nothing is left, logs `leveled_up` and closes it.
    fn continue_level_up(&mut self) -> Result<Option<LevelUpChoice>, ApiError> {
        loop {
            let open = self.level_up.as_ref().expect("a level-up is open");
            let Some(prompt) = open.session.pending_prompts().first().cloned() else {
                let open = self.level_up.take().expect("a level-up is open");
                self.drain();
                self.pending.push(Pending::public(
                    None,
                    EventKind::LeveledUp {
                        actor: Handle(open.handle),
                        level: open.level,
                    },
                ));
                return Ok(None);
            };
            if let Some(decision) = self.automatic(&prompt)? {
                self.advance_level_up(&decision)?;
                continue;
            }
            let asked = self.ask(&prompt);
            let choice = asked.choice.clone();
            self.level_up.as_mut().expect("a level-up is open").asked = Some(asked);
            return Ok(Some(choice));
        }
    }

    /// The answer to a prompt that has only one, or `None` when the player chooses.
    fn automatic(&self, prompt: &LevelUpPrompt) -> Result<Option<LevelUpDecision>, ApiError> {
        let open = self.level_up.as_ref().expect("a level-up is open");
        choices::automatic(&self.engine.world, open.entity, prompt).map_err(|why| {
            error(
                ErrorCode::NotImplemented,
                format!("{}'s level-up cannot go on: {why}.", open.handle),
            )
        })
    }

    /// The choice the player answers for `prompt`, with its recommended picks.
    fn ask(&mut self, prompt: &LevelUpPrompt) -> Asked {
        self.level_up_prompts += 1;
        let open = self.level_up.as_ref().expect("a level-up is open");
        let offer = choices::offer(prompt);
        let options: Vec<_> = offer.options.iter().map(|(o, _)| o.clone()).collect();
        let recommended = self.recommended(open, &offer.id, offer.picks, &options);
        Asked {
            choice: LevelUpChoice {
                prompt_id: PromptId(format!("l{}", self.level_up_prompts)),
                actor: Handle(open.handle.clone()),
                level: open.level,
                label: offer.label.clone(),
                picks: offer.picks,
                options,
                recommended,
            },
            offer,
        }
    }

    /// The pregen file's recommended picks for this level and prompt, when they are options;
    /// else the first options.
    fn recommended(
        &self,
        open: &OpenLevelUp,
        prompt_id: &str,
        picks: u8,
        options: &[nat20_api_contract::LevelUpOption],
    ) -> Vec<String> {
        let from_file = self
            .pregen_of(open.entity)
            .and_then(|id| pregen::read(&id).ok())
            .and_then(|file| {
                file.recommended
                    .into_iter()
                    .find(|r| r.level == open.level && r.prompt_id == prompt_id)
            })
            .map(|r| r.picks)
            .filter(|p| {
                p.len() == usize::from(picks)
                    && p.iter().all(|id| options.iter().any(|o| o.id == *id))
            });
        from_file.unwrap_or_else(|| {
            options
                .iter()
                .take(usize::from(picks))
                .map(|o| o.id.clone())
                .collect()
        })
    }
}

fn bad_picks(choice: &LevelUpChoice) -> ApiError {
    let ids: Vec<&str> = choice.options.iter().map(|o| o.id.as_str()).collect();
    rejected(
        RejectReason::BadPicks,
        format!(
            "Pick {} different option{} of {}: {}.",
            choice.picks,
            if choice.picks == 1 { "" } else { "s" },
            choice.label,
            ids.join(", ")
        ),
    )
}
