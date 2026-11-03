//! The escort contract (API-47): the merchant hires the party as Hired Blades to see the caravan
//! to a destination, and pays each Blade the SRD 5.2.1 skilled-hireling wage, 2 GP a day per
//! person, from the merchant's own purse. There is no shared pot.
//!
//! The terms are in the campaign file: the wage, an advance paid when the contract starts, and
//! the destination, where the rest is paid on arrival. A Blade serves one day for each night
//! they live through and one for the day the caravan arrives. A Blade who falls is paid for the
//! days they served. If the merchant's purse runs short, a Blade gets what is left and the rest
//! stays owed.
//!
//! The world only works out who is owed what. The server moves the coin through core and logs
//! one `wage` ledger entry per Blade.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::map::{MapError, WorldMap};

/// The SRD 5.2.1 skilled hireling's wage: 2 GP a day, in copper pieces.
pub const SKILLED_WAGE_CP: u32 = 200;

/// The terms of the escort contract, as the campaign file writes them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EscortTerms {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The place the caravan is escorted to: the rest of the pay is due on arrival
    pub destination: String,
    /// The wage per Blade per day, in copper pieces
    #[serde(default = "skilled_wage")]
    pub wage_cp: u32,
    /// Days of wages paid to each Blade when the contract starts
    #[serde(default)]
    pub advance_days: u32,
    /// What the merchant's purse holds when the contract starts, in copper pieces
    pub purse_cp: u64,
}

fn skilled_wage() -> u32 {
    SKILLED_WAGE_CP
}

/// What the world remembers about the contract.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EscortState {
    /// The Blades, by handle, in party order
    pub blades: Vec<String>,
    /// Days each Blade has served
    #[serde(default)]
    pub served: BTreeMap<String, u32>,
    /// Copper paid to each Blade so far
    #[serde(default)]
    pub paid_cp: BTreeMap<String, u64>,
    /// What the merchant's purse holds now, in copper pieces
    pub purse_cp: u64,
    /// Whether the caravan reached the destination and the pay was settled
    #[serde(default)]
    pub done: bool,
}

/// One wage payment: who gets how much copper.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Wage {
    /// The Blade
    pub blade: String,
    /// Copper paid
    pub copper: u32,
}

impl EscortTerms {
    /// Checks the terms against the map: the destination is a place.
    pub fn validate(&self, map: &WorldMap) -> Result<(), MapError> {
        if map.place(&self.destination).is_none() {
            return Err(MapError(format!(
                "the escort's destination {} is not a place",
                self.destination
            )));
        }
        Ok(())
    }
}

impl EscortState {
    /// The contract as it starts: the Blades, the merchant's purse, nothing served or paid.
    pub fn new(terms: &EscortTerms, blades: Vec<String>) -> Self {
        Self {
            served: blades.iter().map(|b| (b.clone(), 0)).collect(),
            paid_cp: blades.iter().map(|b| (b.clone(), 0)).collect(),
            blades,
            purse_cp: terms.purse_cp,
            done: false,
        }
    }

    /// The advance: `advance_days` of wages for each Blade, as far as the purse goes.
    pub fn advance(&mut self, terms: &EscortTerms) -> Vec<Wage> {
        let due = u64::from(terms.wage_cp) * u64::from(terms.advance_days);
        let blades = self.blades.clone();
        blades.iter().filter_map(|b| self.pay(b, due)).collect()
    }

    /// A night passes: each Blade still standing (`alive`) has served one more day.
    pub fn night(&mut self, alive: impl Fn(&str) -> bool) {
        if self.done {
            return;
        }
        for blade in &self.blades {
            if alive(blade) {
                *self.served.entry(blade.clone()).or_default() += 1;
            }
        }
    }

    /// The caravan reached `place`. At the destination, each Blade still standing serves the
    /// day of arrival, and every Blade, fallen ones too, is paid what they are owed, as far as
    /// the purse goes. Anywhere else, or once settled, nothing happens.
    pub fn arrive(
        &mut self,
        terms: &EscortTerms,
        place: &str,
        alive: impl Fn(&str) -> bool,
    ) -> Vec<Wage> {
        if self.done || place != terms.destination {
            return Vec::new();
        }
        self.done = true;
        let blades = self.blades.clone();
        for blade in &blades {
            if alive(blade) {
                *self.served.entry(blade.clone()).or_default() += 1;
            }
        }
        blades
            .iter()
            .filter_map(|b| {
                let earned = u64::from(terms.wage_cp) * u64::from(self.served(b));
                let owed = earned.saturating_sub(self.paid(b));
                self.pay(b, owed)
            })
            .collect()
    }

    /// Days `blade` has served.
    pub fn served(&self, blade: &str) -> u32 {
        self.served.get(blade).copied().unwrap_or(0)
    }

    /// Copper paid to `blade` so far.
    pub fn paid(&self, blade: &str) -> u64 {
        self.paid_cp.get(blade).copied().unwrap_or(0)
    }

    /// Pays `copper` to `blade` from the purse, or what the purse has left.
    fn pay(&mut self, blade: &str, copper: u64) -> Option<Wage> {
        let paid = copper.min(self.purse_cp).min(u64::from(u32::MAX));
        if paid == 0 {
            return None;
        }
        self.purse_cp -= paid;
        *self.paid_cp.entry(blade.to_string()).or_default() += paid;
        Some(Wage {
            blade: blade.to_string(),
            copper: u32::try_from(paid).expect("capped at u32::MAX"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn terms(advance_days: u32, purse_cp: u64) -> EscortTerms {
        EscortTerms {
            comment: None,
            destination: "inn".into(),
            wage_cp: SKILLED_WAGE_CP,
            advance_days,
            purse_cp,
        }
    }

    fn blades() -> Vec<String> {
        vec!["bren".into(), "maren".into()]
    }

    #[test]
    fn the_terms_read_with_the_skilled_wage_by_default() {
        let t: EscortTerms =
            serde_json::from_str(r#"{"destination": "inn", "advance_days": 1, "purse_cp": 5000}"#)
                .unwrap();
        assert_eq!(t.wage_cp, 200);
    }

    #[test]
    fn each_blade_gets_the_advance_then_the_rest_on_arrival() {
        let t = terms(1, 5000);
        let mut s = EscortState::new(&t, blades());
        let advance = s.advance(&t);
        assert_eq!(
            advance,
            [
                Wage {
                    blade: "bren".into(),
                    copper: 200
                },
                Wage {
                    blade: "maren".into(),
                    copper: 200
                }
            ]
        );
        s.night(|_| true);
        s.night(|_| true);
        assert!(
            s.arrive(&t, "town", |_| true).is_empty(),
            "not the destination"
        );
        let rest = s.arrive(&t, "inn", |_| true);
        // Two nights and the day of arrival: 3 days, 600 cp, 200 of it paid ahead.
        assert_eq!(
            rest.iter().map(|w| w.copper).collect::<Vec<_>>(),
            [400, 400]
        );
        assert_eq!(s.purse_cp, 5000 - 1200);
        assert!(s.done);
        assert!(s.arrive(&t, "inn", |_| true).is_empty(), "paid once");
    }

    #[test]
    fn a_fallen_blade_is_paid_for_the_days_served() {
        let t = terms(0, 5000);
        let mut s = EscortState::new(&t, blades());
        s.night(|_| true);
        s.night(|b| b != "maren");
        let pay = s.arrive(&t, "inn", |b| b != "maren");
        assert_eq!(
            pay,
            [
                Wage {
                    blade: "bren".into(),
                    copper: 600
                },
                Wage {
                    blade: "maren".into(),
                    copper: 200
                }
            ]
        );
    }

    #[test]
    fn a_short_purse_pays_what_is_left() {
        let t = terms(1, 300);
        let mut s = EscortState::new(&t, blades());
        let advance = s.advance(&t);
        assert_eq!(
            advance.iter().map(|w| w.copper).collect::<Vec<_>>(),
            [200, 100]
        );
        assert_eq!(s.purse_cp, 0);
        assert!(s.arrive(&t, "inn", |_| true).is_empty());
        assert_eq!(s.paid("maren"), 100);
    }
}
