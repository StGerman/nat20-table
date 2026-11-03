//! Level-ups in a session (API-44): the commands are the levelling character's own, and the
//! choices go back only to its player.

use nat20_api_contract::{ApiError, CommandResult, LevelUpChoice, RejectReason};

use super::Session;
use crate::{errors::rejected, projection::Viewer};

impl Session {
    /// `level_up`: opens or reopens the actor's level-up.
    pub fn level_up(&mut self, actor: &str, viewer: &Viewer) -> Result<CommandResult, ApiError> {
        own(actor, viewer, "level_up")?;
        let result = self.game_mut()?.level_up(actor);
        self.push_entries();
        let choice = result?;
        Ok(CommandResult::LevelUp {
            choice,
            state: self.state_for(viewer)?,
        })
    }

    /// `answer_level_up`: answers the open choice of the actor's level-up.
    pub fn answer_level_up(
        &mut self,
        actor: &str,
        prompt_id: &str,
        picks: &[String],
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        own(actor, viewer, "answer_level_up")?;
        let result = self.game_mut()?.answer_level_up(actor, prompt_id, picks);
        self.push_entries();
        let choice: Option<LevelUpChoice> = result?;
        Ok(CommandResult::AnswerLevelUp {
            choice,
            state: self.state_for(viewer)?,
        })
    }
}

/// A level-up is its player's choice: the request comes as the actor itself.
fn own(actor: &str, viewer: &Viewer, command: &str) -> Result<(), ApiError> {
    if *viewer == Viewer::Creature(actor.to_owned()) {
        Ok(())
    } else {
        Err(rejected(
            RejectReason::NoSay,
            format!("{command} is a player's choice: send it as your own creature."),
        ))
    }
}
