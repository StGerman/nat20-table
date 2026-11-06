//! A night on the road or at an inn (API-42): the inn fee, the day's food and the
//! Malnutrition save (ENG-29), and the Long Rest (ENG-30), all through core.

use nat20_api_contract::{Coins, Handle, LedgerGoods, LedgerReason};
use nat20_core::systems::exhaustion::Meal;

use super::*;

/// A day's food for one Small or Medium creature, in quarter pounds: what a ration or an inn's
/// board gives (SRD 5.2.1, Rations; Food Needs per Day).
pub const DAYS_FOOD_QUARTER_LB: u32 = 4;

impl Game {
    /// The coin in a creature's purse, counted in copper.
    pub fn purse_total_cp(&self, handle: &str) -> Result<u64, ApiError> {
        let entity = self.entity(handle)?;
        Ok(goods::purse(&self.engine, entity).total_cp)
    }

    /// Pays `copper` from a creature's purse to `world` with change, all or nothing, and logs
    /// the `ledger` entry (public).
    pub fn pay_world(
        &mut self,
        handle: &str,
        copper: u32,
        reason: LedgerReason,
    ) -> Result<(), ApiError> {
        let entity = self.entity(handle)?;
        let value = goods::monetary(&Coins {
            cp: copper,
            ..Coins::default()
        });
        systems::inventory::remove_money(&mut self.engine.world, entity, value).map_err(|_| {
            rejected(
                RejectReason::InsufficientFunds,
                format!("{handle}'s purse holds less than {copper} cp, counted with change."),
            )
        })?;
        self.post(
            handle,
            "world",
            LedgerGoods::Coins { copper },
            reason,
            None,
            Visibility::Public,
        );
        Ok(())
    }

    /// Ends a creature's day with `eaten_quarter_lb` of food: core runs the Malnutrition rules,
    /// and its saving throw, when one is due, is logged like any other. Returns whether the
    /// creature ate its full day's food.
    pub fn end_of_day(&mut self, handle: &str, eaten_quarter_lb: u32) -> Result<bool, ApiError> {
        let entity = self.entity(handle)?;
        self.drain();
        let meal = systems::exhaustion::end_of_day(&mut self.engine, entity, eaten_quarter_lb);
        self.engine.update(0.0);
        self.drain();
        self.log_unseen_changes();
        Ok(meal == Meal::Full)
    }

    /// A night of `minutes` for the party: those who can take a Long Rest (at least 1 Hit
    /// Point, 16 hours since their last) take one through core, time passes for everyone in
    /// the scene, and the rest finishes. Returns who rested and who could not.
    pub fn night(
        &mut self,
        party: &[Handle],
        minutes: u32,
    ) -> Result<(Vec<Handle>, Vec<Handle>), ApiError> {
        let mut rested = Vec::new();
        let mut not_rested = Vec::new();
        let mut entities = Vec::new();
        for handle in party {
            let entity = self.entity(&handle.0)?;
            if systems::health::is_alive(&self.engine.world, entity)
                && systems::time::long_rest_wait_left(&self.engine.world, entity) <= 0.0
            {
                rested.push(handle.clone());
                entities.push(entity);
            } else {
                not_rested.push(handle.clone());
            }
        }
        self.drain();
        self.close_finished_fight();
        if !entities.is_empty() {
            systems::time::start_rest(&mut self.engine, entities.clone(), &RestKind::Long)
                .map_err(|e| error(ErrorCode::Internal, format!("core refused the rest: {e:?}")))?;
        }
        self.pass_minutes(minutes);
        if !entities.is_empty() {
            systems::time::finish_rest(&mut self.engine, entities)
                .map_err(|e| error(ErrorCode::Internal, format!("core refused the rest: {e:?}")))?;
        }
        self.engine.update(0.0);
        self.drain();
        self.log_unseen_changes();
        Ok((rested, not_rested))
    }

    /// The creature's Exhaustion level, from core.
    pub fn exhaustion_level(&self, handle: &str) -> Result<u8, ApiError> {
        let entity = self.entity(handle)?;
        Ok(systems::exhaustion::level(&self.engine.world, entity))
    }
}
