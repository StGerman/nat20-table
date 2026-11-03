//! Coin and items changing hands out of combat: `give`, `steal` and `loot` (ITM-6). Core moves
//! the coins and items (ENG-28) and computes passive scores (ENG-32); every movement is posted to
//! the session's ledger (`nat20-ledger`) and logged as a `ledger` entry.

use nat20_api_contract::{CarriedItem, Carries, Coins, Goods, LedgerGoods, LedgerReason, Purse};
use nat20_core::components::{
    items::{
        inventory::Inventory,
        money::{Currency, MonetaryValue},
    },
    skill::Skill as CoreSkill,
};

use super::*;

/// How far apart a giver and a receiver may stand: 5 feet, counted on the grid as the SRD
/// counts it (a diagonal square is 5 feet too), with a little slack for placement.
const REACH_FT: f32 = 5.5;

impl Game {
    /// `give`: hands coin or one carried item to a creature within 5 feet.
    pub fn give(&mut self, actor: &str, to: &str, what: &Goods) -> Result<(), ApiError> {
        let (giver, receiver) = self.hand_to_hand(actor, to, "give")?;
        self.require_conscious(giver, actor, "give anything")?;
        if !systems::health::is_alive(&self.engine.world, receiver) {
            return Err(rejected(
                RejectReason::InvalidTarget,
                format!("{to} is dead and cannot take anything."),
            ));
        }
        ensure_inventory(&mut self.engine, giver);
        ensure_inventory(&mut self.engine, receiver);
        let goods = self.move_goods(giver, receiver, what)?;
        // Only a gift that happens closes a fight that ended by itself; a refused one changes nothing.
        self.close_finished_fight();
        self.post(
            actor,
            to,
            goods,
            LedgerReason::Trade,
            None,
            Visibility::Public,
        );
        Ok(())
    }

    /// `steal`: the thief's Sleight of Hand against the target's passive Perception. Returns the
    /// roll's key and whether the theft went unseen. A theft that goes unseen but finds the
    /// target without the goods takes nothing.
    pub fn steal(
        &mut self,
        actor: &str,
        target: &str,
        what: &Goods,
    ) -> Result<CheckOutcome, ApiError> {
        let (thief, victim) = self.hand_to_hand(actor, target, "steal")?;
        self.require_conscious(thief, actor, "steal")?;
        goods_ok(what)?;
        self.close_finished_fight();
        ensure_inventory(&mut self.engine, thief);
        ensure_inventory(&mut self.engine, victim);
        let passive =
            systems::d20::passive_score(&self.engine, victim, CoreSkill::Perception).clamp(0, 30);
        let (key, total, success) = self.roll_check(
            thief,
            &CheckTest::Skill {
                skill: nat20_api_contract::Skill::SleightOfHand,
            },
            passive as u8,
            DcSource::Passive,
        );
        let only_thief = Visibility::Owner {
            handle: Handle(actor.to_owned()),
        };
        // The roll is the thief's and the DM's: the target doesn't know a hand was in its pocket.
        if let Some(roll) = self
            .pending
            .iter_mut()
            .rev()
            .find(|p| matches!(p.kind, EventKind::Roll { .. }))
        {
            roll.visibility = only_thief.clone();
        }
        if success {
            if let Ok(goods) = self.move_goods(victim, thief, what) {
                self.post(
                    target,
                    actor,
                    goods,
                    LedgerReason::Theft,
                    Some(RollId(key.clone())),
                    only_thief,
                );
            }
        } else {
            self.pending.push(Pending {
                round: None,
                visibility: Visibility::Public,
                kind: EventKind::TheftNoticed {
                    thief: Handle(actor.to_owned()),
                    target: Handle(target.to_owned()),
                },
            });
        }
        self.drain();
        Ok(CheckOutcome {
            key,
            total,
            success,
        })
    }

    /// `loot`: takes every coin and carried item of a fallen or surrendered creature within 5
    /// feet. Worn and wielded gear stays.
    pub fn loot(&mut self, actor: &str, from: &str) -> Result<(), ApiError> {
        let (looter, fallen) = self.hand_to_hand(actor, from, "loot")?;
        self.require_conscious(looter, actor, "loot")?;
        let down = !systems::health::is_alive(&self.engine.world, fallen)
            || life_state_name(&self.engine, fallen) != "normal";
        if !down && !self.yielded.contains(&fallen) {
            return Err(rejected(
                RejectReason::NotFallen,
                format!(
                    "{from} is still on its feet; only a fallen or surrendered creature can be looted."
                ),
            ));
        }
        ensure_inventory(&mut self.engine, looter);
        ensure_inventory(&mut self.engine, fallen);
        let (money, items) = {
            let inventory =
                systems::helpers::get_component::<Inventory>(&self.engine.world, fallen);
            (inventory.money().clone(), inventory.items().to_vec())
        };
        if money.total_in_copper() == 0 && items.is_empty() {
            return Err(rejected(
                RejectReason::NothingCarried,
                format!("{from} carries nothing."),
            ));
        }
        self.close_finished_fight();
        if money.total_in_copper() > 0 {
            let copper = copper_u32(money.total_in_copper())?;
            systems::inventory::give_money(&mut self.engine.world, fallen, looter, money)
                .map_err(|_| error(ErrorCode::Internal, "the fallen creature's purse moved"))?;
            self.post(
                from,
                actor,
                LedgerGoods::Coins { copper },
                LedgerReason::Loot,
                None,
                Visibility::Public,
            );
        }
        let mut stacks: Vec<(ItemId, u32)> = Vec::new();
        for item in items {
            match stacks.iter_mut().find(|(id, _)| *id == item) {
                Some((_, n)) => *n += 1,
                None => stacks.push((item, 1)),
            }
        }
        for (item, quantity) in stacks {
            for _ in 0..quantity {
                systems::inventory::give_item(&mut self.engine.world, fallen, looter, &item);
            }
            self.post(
                from,
                actor,
                LedgerGoods::Item {
                    item: short_item_id(&item),
                    quantity,
                },
                LedgerReason::Loot,
                None,
                Visibility::Public,
            );
        }
        Ok(())
    }

    /// The two creatures of a hand-to-hand exchange: explore mode, two different creatures,
    /// within 5 feet of each other.
    fn hand_to_hand(
        &self,
        actor: &str,
        other: &str,
        verb: &str,
    ) -> Result<(Entity, Entity), ApiError> {
        if self.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                format!("{verb} is served out of combat only."),
            ));
        }
        let a = self.entity(actor)?;
        let b = self.entity(other)?;
        if a == b {
            return Err(rejected(
                RejectReason::InvalidTarget,
                format!("{actor} cannot {verb} with itself."),
            ));
        }
        if grid_distance_ft(&self.engine, a, b).is_none_or(|ft| ft > REACH_FT) {
            return Err(rejected(
                RejectReason::OutOfRange,
                format!("{actor} must be within 5 feet of {other}; move there first."),
            ));
        }
        Ok((a, b))
    }

    fn require_conscious(&self, entity: Entity, handle: &str, what: &str) -> Result<(), ApiError> {
        if !systems::health::is_alive(&self.engine.world, entity)
            || life_state_name(&self.engine, entity) != "normal"
        {
            return Err(rejected(
                RejectReason::ConditionPrevents,
                format!("{handle} is down and cannot {what}."),
            ));
        }
        Ok(())
    }

    /// Moves `what` from `from` to `to` through core, all or nothing; returns it as the ledger
    /// names it.
    fn move_goods(
        &mut self,
        from: Entity,
        to: Entity,
        what: &Goods,
    ) -> Result<LedgerGoods, ApiError> {
        goods_ok(what)?;
        match what {
            Goods::Coins { coins } => {
                let value = monetary(coins);
                let copper = copper_u32(value.total_in_copper())?;
                systems::inventory::give_money(&mut self.engine.world, from, to, value).map_err(
                    |_| {
                        rejected(
                            RejectReason::InsufficientFunds,
                            "The purse holds less than that, counted with change.",
                        )
                    },
                )?;
                Ok(LedgerGoods::Coins { copper })
            }
            Goods::Item { item } => {
                let id = core_item_id(item)?;
                if !systems::inventory::give_item(&mut self.engine.world, from, to, &id) {
                    return Err(rejected(
                        RejectReason::NotCarried,
                        format!(
                            "No {} is carried there (worn or wielded gear can't change hands).",
                            names::item_name(&id)
                        ),
                    ));
                }
                Ok(LedgerGoods::Item {
                    item: item.clone(),
                    quantity: 1,
                })
            }
        }
    }

    /// Logs one ledger entry; the session posts it to its journal (`nat20-ledger`) once the
    /// roll a theft cites has its logged id.
    pub(super) fn post(
        &mut self,
        from: &str,
        to: &str,
        what: LedgerGoods,
        reason: LedgerReason,
        roll_id: Option<RollId>,
        visibility: Visibility,
    ) {
        self.pending.push(Pending {
            round: None,
            visibility,
            kind: EventKind::Ledger {
                from: from.to_owned(),
                to: to.to_owned(),
                what,
                reason,
                roll_id,
            },
        });
    }
}

/// A creature's purse as the sheet shows it.
pub fn purse(engine: &EngineState, entity: Entity) -> Purse {
    let Ok(inventory) = engine.world.get::<&Inventory>(entity) else {
        return Purse {
            coins: Coins::default(),
            total_cp: 0,
        };
    };
    let money = inventory.money();
    let held = |c: Currency| money.values.get(&c).copied().unwrap_or(0);
    Purse {
        coins: Coins {
            cp: held(Currency::Copper),
            sp: held(Currency::Silver),
            ep: held(Currency::Electrum),
            gp: held(Currency::Gold),
            pp: held(Currency::Platinum),
        },
        total_cp: money.total_in_copper(),
    }
}

/// Gives a freshly spawned creature what its scene entry says it carries.
pub fn add_carries(
    engine: &mut EngineState,
    entity: Entity,
    carries: &Carries,
) -> Result<(), String> {
    ensure_inventory(engine, entity);
    for CarriedItem { item, quantity } in &carries.items {
        let id = core_item_id(item).map_err(|e| e.message)?;
        for _ in 0..*quantity {
            systems::inventory::add_item(&mut engine.world, entity, id.clone());
        }
    }
    systems::helpers::get_component_mut::<Inventory>(&mut engine.world, entity)
        .checked_add_money(&monetary(&carries.coins))
        .map_err(|_| "carries more coins than a purse holds".to_string())
}

fn goods_ok(what: &Goods) -> Result<(), ApiError> {
    match what {
        Goods::Coins { coins } if monetary(coins).total_in_copper() == 0 => {
            Err(error(ErrorCode::BadRequest, "Name at least one coin."))
        }
        Goods::Item { item } => core_item_id(item).map(|_| ()),
        Goods::Coins { .. } => Ok(()),
    }
}

pub(super) fn monetary(coins: &Coins) -> MonetaryValue {
    let mut value = MonetaryValue::new();
    for (currency, amount) in [
        (Currency::Copper, coins.cp),
        (Currency::Silver, coins.sp),
        (Currency::Electrum, coins.ep),
        (Currency::Gold, coins.gp),
        (Currency::Platinum, coins.pp),
    ] {
        if amount > 0 {
            value.add(currency, amount);
        }
    }
    value
}

fn copper_u32(copper: u64) -> Result<u32, ApiError> {
    u32::try_from(copper).map_err(|_| {
        error(
            ErrorCode::BadRequest,
            "That is more coin than one ledger entry carries.",
        )
    })
}

/// The core id of an item named as on the sheet (`potion_of_healing`).
fn core_item_id(item: &str) -> Result<ItemId, ApiError> {
    let id = ItemId::new("nat20_core", format!("item.{item}"));
    if ItemsRegistry::get(&id).is_none() {
        return Err(error(
            ErrorCode::BadRequest,
            format!("There is no item {item}."),
        ));
    }
    Ok(id)
}

/// The sheet's name for a core item id: `nat20_core::item.potion_of_healing` is
/// `potion_of_healing`.
fn short_item_id(item: &ItemId) -> String {
    let full = item.to_string();
    full.rsplit_once("item.")
        .map(|(_, short)| short.to_owned())
        .unwrap_or(full)
}

/// Distance on the grid in feet: the larger of the two level offsets (a diagonal square counts
/// 5 feet, SRD 5.2.1), plus the height difference.
fn grid_distance_ft(engine: &EngineState, a: Entity, b: Entity) -> Option<f32> {
    let pa = systems::geometry::get_foot_position(&engine.world, a)?;
    let pb = systems::geometry::get_foot_position(&engine.world, b)?;
    let d = pa - pb;
    let level = d.x.abs().max(d.z.abs());
    Some((level + d.y.abs()) / METERS_PER_FOOT)
}

/// Monsters spawn without an inventory; one that carries, gives or receives gets an empty one.
fn ensure_inventory(engine: &mut EngineState, entity: Entity) {
    if engine.world.get::<&Inventory>(entity).is_err() {
        engine
            .world
            .insert_one(entity, Inventory::new())
            .expect("the creature exists");
    }
}
