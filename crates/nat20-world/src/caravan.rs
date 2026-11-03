//! The caravan: who owns it, its wagons and their cargo.
//!
//! Trade goods are not core items: nobody wears a sack of flour or hits with it, so
//! cargo lives here, in a particular wagon, with weights from the world's goods file.
//! A character's own gear stays in core.

use std::{collections::BTreeMap, fmt, str::FromStr};

use serde::{Deserialize, Serialize};

/// Who owns the caravan and decides where it goes: a player's creature, or a world
/// NPC that follows the campaign's route.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub enum Owner {
    /// A player's creature, by handle (the player plays the Merchant)
    Player(String),
    /// A world NPC (`npc:<id>`); any Hired Blade moves the caravan on along the route
    Npc(String),
}

impl FromStr for Owner {
    type Err = CaravanError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.strip_prefix("npc:") {
            Some(id) if !id.is_empty() && !id.contains(':') => Ok(Owner::Npc(id.to_string())),
            None if !s.is_empty() && !s.contains(':') => Ok(Owner::Player(s.to_string())),
            _ => Err(CaravanError::BadOwner(s.to_string())),
        }
    }
}

impl TryFrom<String> for Owner {
    type Error = CaravanError;

    fn try_from(s: String) -> Result<Self, Self::Error> {
        s.parse()
    }
}

impl From<Owner> for String {
    fn from(owner: Owner) -> Self {
        owner.to_string()
    }
}

impl fmt::Display for Owner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Owner::Player(handle) => write!(f, "{handle}"),
            Owner::Npc(id) => write!(f, "npc:{id}"),
        }
    }
}

/// One trade good from the world's goods file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Good {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case (`wheat`, `iron`, `rations`)
    pub id: String,
    /// The name players read, with its unit ("wheat (1 lb.)")
    pub name: String,
    /// The price of one unit, in copper pieces
    pub price_cp: u32,
    /// The weight of one unit, in pounds
    pub weight_lb: u32,
}

/// The world's goods file.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Goods {
    /// A note for authors and the source of the numbers
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// Every good
    pub goods: Vec<Good>,
}

impl Goods {
    /// Checks the file: at least one good, unique ids, and every good with a weight.
    pub fn validate(&self) -> Result<(), String> {
        if self.goods.is_empty() {
            return Err("no goods".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        for good in &self.goods {
            if !ids.insert(good.id.as_str()) {
                return Err(format!("two goods with id {}", good.id));
            }
            if good.weight_lb == 0 {
                return Err(format!("good {} weighs nothing", good.id));
            }
        }
        Ok(())
    }

    /// The good with this id.
    pub fn get(&self, id: &str) -> Option<&Good> {
        self.goods.iter().find(|g| g.id == id)
    }
}

/// An animal in a wagon's team.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftAnimal {
    /// What it is (`draft_horse`, `mule`)
    pub animal: String,
    /// Its carrying capacity in pounds (SRD 5.2.1, Mounts and Other Animals)
    pub capacity_lb: u32,
}

/// One cart or wagon, its team and its cargo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Wagon {
    /// The number, from 1; the ledger holder is `wagon:<n>`
    pub n: u32,
    /// The vehicle (`cart`, `wagon`)
    pub vehicle: String,
    /// The vehicle's own weight in pounds (SRD 5.2.1, Tack, Harness, and Drawn Vehicles)
    pub vehicle_lb: u32,
    /// The animals pulling it
    pub team: Vec<DraftAnimal>,
    /// Units of each good aboard, by good id
    #[serde(default)]
    pub cargo: BTreeMap<String, u32>,
}

impl Wagon {
    /// The most cargo the wagon can move, in pounds: an animal pulling a vehicle moves
    /// up to five times its carrying capacity including the vehicle, and a team adds
    /// its capacities together (SRD 5.2.1, Mounts and Cargo).
    pub fn limit_lb(&self) -> u32 {
        let pull = self
            .team
            .iter()
            .fold(0u32, |sum, a| sum.saturating_add(a.capacity_lb));
        pull.saturating_mul(5).saturating_sub(self.vehicle_lb)
    }

    /// The weight of the cargo aboard, in pounds.
    pub fn load_lb(&self, goods: &Goods) -> Result<u32, CaravanError> {
        self.cargo.iter().try_fold(0u32, |sum, (id, quantity)| {
            let good = goods
                .get(id)
                .ok_or_else(|| CaravanError::UnknownGood(id.clone()))?;
            Ok(sum.saturating_add(good.weight_lb.saturating_mul(*quantity)))
        })
    }
}

/// Why the caravan refused a change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CaravanError {
    /// Not a player handle or `npc:<id>`
    BadOwner(String),
    /// No good with this id in the goods file
    UnknownGood(String),
    /// No wagon with this number
    UnknownWagon(u32),
    /// The wagon holds less of the good than asked
    NotEnough {
        /// The wagon; 0 when the whole caravan was counted
        wagon: u32,
        /// The good
        good: String,
        /// How many units it holds
        held: u32,
    },
    /// The wagon would carry more than its limit
    Overloaded {
        /// The wagon
        wagon: u32,
        /// The load in pounds
        load_lb: u32,
        /// The limit in pounds
        limit_lb: u32,
    },
}

impl fmt::Display for CaravanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CaravanError::BadOwner(s) => write!(f, "not a caravan owner: {s:?}"),
            CaravanError::UnknownGood(id) => write!(f, "no good {id}"),
            CaravanError::UnknownWagon(n) => write!(f, "no wagon {n}"),
            CaravanError::NotEnough { wagon, good, held } => {
                write!(f, "wagon {wagon} holds only {held} {good}")
            }
            CaravanError::Overloaded {
                wagon,
                load_lb,
                limit_lb,
            } => write!(
                f,
                "wagon {wagon} would carry {load_lb} lb, over its {limit_lb} lb"
            ),
        }
    }
}

impl std::error::Error for CaravanError {}

/// The caravan: its owner and wagons.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Caravan {
    /// Who decides where it goes
    pub owner: Owner,
    /// The wagons, numbered from 1
    pub wagons: Vec<Wagon>,
}

impl Caravan {
    /// Whether `handle` may move the caravan (`travel`, `rest_night`): the owner when
    /// a player owns it; any member of the party when an NPC owns it, because the NPC
    /// follows the route and a Hired Blade says "we move on".
    pub fn may_drive(&self, handle: &str, in_party: bool) -> bool {
        match &self.owner {
            Owner::Player(owner) => owner == handle,
            Owner::Npc(_) => in_party,
        }
    }

    /// The wagon with this number.
    pub fn wagon(&self, n: u32) -> Option<&Wagon> {
        self.wagons.iter().find(|w| w.n == n)
    }

    /// Takes `quantity` units of `good` from the wagons in order, all or nothing.
    pub fn unload_anywhere(&mut self, good: &str, quantity: u32) -> Result<(), CaravanError> {
        let held = self.total(good);
        if held < quantity {
            return Err(CaravanError::NotEnough {
                wagon: 0,
                good: good.to_string(),
                held,
            });
        }
        let mut left = quantity;
        for wagon in &mut self.wagons {
            if left == 0 {
                break;
            }
            let here = wagon.cargo.get(good).copied().unwrap_or(0);
            let take = here.min(left);
            if take == here {
                wagon.cargo.remove(good);
            } else {
                wagon.cargo.insert(good.to_string(), here - take);
            }
            left -= take;
        }
        Ok(())
    }

    /// Units of `good` across all wagons.
    pub fn total(&self, good: &str) -> u32 {
        self.wagons
            .iter()
            .filter_map(|w| w.cargo.get(good))
            .fold(0u32, |sum, n| sum.saturating_add(*n))
    }

    /// The first wagon over its limit, if any.
    pub fn overloaded(&self, goods: &Goods) -> Result<Option<CaravanError>, CaravanError> {
        for wagon in &self.wagons {
            let load_lb = wagon.load_lb(goods)?;
            let limit_lb = wagon.limit_lb();
            if load_lb > limit_lb {
                return Ok(Some(CaravanError::Overloaded {
                    wagon: wagon.n,
                    load_lb,
                    limit_lb,
                }));
            }
        }
        Ok(None)
    }

    /// Loads `quantity` units of `good` into wagon `n`, all or nothing: refused when the
    /// wagon would go over its limit.
    pub fn load(
        &mut self,
        n: u32,
        good: &str,
        quantity: u32,
        goods: &Goods,
    ) -> Result<(), CaravanError> {
        let weight = goods
            .get(good)
            .ok_or_else(|| CaravanError::UnknownGood(good.to_string()))?
            .weight_lb;
        let wagon = self
            .wagons
            .iter_mut()
            .find(|w| w.n == n)
            .ok_or(CaravanError::UnknownWagon(n))?;
        let load_lb = wagon
            .load_lb(goods)?
            .saturating_add(weight.saturating_mul(quantity));
        let limit_lb = wagon.limit_lb();
        if load_lb > limit_lb {
            return Err(CaravanError::Overloaded {
                wagon: n,
                load_lb,
                limit_lb,
            });
        }
        *wagon.cargo.entry(good.to_string()).or_default() += quantity;
        Ok(())
    }

    /// Takes `quantity` units of `good` out of wagon `n`, all or nothing.
    pub fn unload(&mut self, n: u32, good: &str, quantity: u32) -> Result<(), CaravanError> {
        let wagon = self
            .wagons
            .iter_mut()
            .find(|w| w.n == n)
            .ok_or(CaravanError::UnknownWagon(n))?;
        let held = wagon.cargo.get(good).copied().unwrap_or(0);
        if held < quantity {
            return Err(CaravanError::NotEnough {
                wagon: n,
                good: good.to_string(),
                held,
            });
        }
        if held == quantity {
            wagon.cargo.remove(good);
        } else {
            wagon.cargo.insert(good.to_string(), held - quantity);
        }
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn goods() -> Goods {
        serde_json::from_str(
            r#"{"goods": [
              {"id": "wheat", "name": "wheat (1 lb.)", "price_cp": 1, "weight_lb": 1},
              {"id": "iron", "name": "iron (1 lb.)", "price_cp": 10, "weight_lb": 1},
              {"id": "rations", "name": "rations (1 day)", "price_cp": 50, "weight_lb": 2}
            ]}"#,
        )
        .unwrap()
    }

    /// One wagon (400 lb) pulled by two draft horses (540 lb each): 5 × 1080 − 400.
    pub(crate) fn caravan(owner: &str) -> Caravan {
        serde_json::from_value(serde_json::json!({
            "owner": owner,
            "wagons": [{
                "n": 1, "vehicle": "wagon", "vehicle_lb": 400,
                "team": [
                    {"animal": "draft_horse", "capacity_lb": 540},
                    {"animal": "draft_horse", "capacity_lb": 540}
                ],
                "cargo": {"wheat": 1000, "rations": 20}
            }]
        }))
        .unwrap()
    }

    #[test]
    fn a_team_pulls_five_times_its_capacity_less_the_vehicle() {
        let caravan = caravan("npc:merchant");
        assert_eq!(caravan.wagon(1).unwrap().limit_lb(), 5000);
        assert_eq!(caravan.wagon(1).unwrap().load_lb(&goods()).unwrap(), 1040);
    }

    #[test]
    fn loading_past_the_limit_changes_nothing() {
        let mut caravan = caravan("npc:merchant");
        let before = caravan.clone();
        assert_eq!(
            caravan.load(1, "iron", 3961, &goods()),
            Err(CaravanError::Overloaded {
                wagon: 1,
                load_lb: 5001,
                limit_lb: 5000
            })
        );
        assert_eq!(caravan, before);
        // A quantity that would overflow is refused the same way.
        assert!(matches!(
            caravan.load(1, "rations", u32::MAX, &goods()),
            Err(CaravanError::Overloaded { .. })
        ));
        caravan.load(1, "iron", 3960, &goods()).unwrap();
        assert_eq!(caravan.total("iron"), 3960);
        assert_eq!(caravan.overloaded(&goods()), Ok(None));
    }

    #[test]
    fn unloading_more_than_aboard_changes_nothing() {
        let mut caravan = caravan("npc:merchant");
        assert_eq!(
            caravan.unload(1, "rations", 21),
            Err(CaravanError::NotEnough {
                wagon: 1,
                good: "rations".into(),
                held: 20
            })
        );
        caravan.unload(1, "rations", 20).unwrap();
        assert_eq!(caravan.total("rations"), 0);
        assert!(!caravan.wagon(1).unwrap().cargo.contains_key("rations"));
    }

    #[test]
    fn unloading_anywhere_empties_the_wagons_in_order() {
        let mut caravan = caravan("npc:merchant");
        let mut second = caravan.wagons[0].clone();
        second.n = 2;
        second.cargo = BTreeMap::from([("rations".to_string(), 5)]);
        caravan.wagons.push(second);
        assert!(matches!(
            caravan.unload_anywhere("rations", 26),
            Err(CaravanError::NotEnough { held: 25, .. })
        ));
        caravan.unload_anywhere("rations", 22).unwrap();
        assert_eq!(caravan.wagon(1).unwrap().cargo.get("rations"), None);
        assert_eq!(caravan.wagon(2).unwrap().cargo.get("rations"), Some(&3));
    }

    #[test]
    fn the_owner_decides_unless_an_npc_owns_the_caravan() {
        let merchant = caravan("maren");
        assert!(merchant.may_drive("maren", true));
        assert!(!merchant.may_drive("bren", true));
        let npc = caravan("npc:old_tobin");
        assert_eq!(npc.owner, Owner::Npc("old_tobin".into()));
        assert!(npc.may_drive("bren", true));
        assert!(!npc.may_drive("goblin", false));
    }

    #[test]
    fn a_bad_owner_is_refused() {
        for bad in ["", "npc:", "wagon:1", "npc:a:b"] {
            assert!(bad.parse::<Owner>().is_err(), "{bad:?}");
        }
        assert_eq!(
            serde_json::to_string(&Owner::Npc("tobin".into())).unwrap(),
            r#""npc:tobin""#
        );
    }
}
