//! Bookkeeping for the living world: who holds what, and who gave what to whom.
//!
//! Every movement of coin or items is one [`Entry`] `{from, to, what, reason, roll?}`.
//! The [`Journal`] stores entries in order and derives balances from them for the
//! run audit. Every entry takes from one holder exactly what it gives another,
//! so the books always sum to the opening; the check that matters is the trial
//! balance against the owners of the numbers. The ledger never answers "is there enough":
//! the owner of the number does (core for creatures, `nat20-world` for wagons), and
//! the audit compares the two with [`Journal::check_against`].
//!
//! Money is integer copper pieces, never a float. The crate depends on serde only
//! and knows nothing of the world or the engine (decision 0057, CI job
//! `world-pure`).

use std::{collections::BTreeMap, fmt, str::FromStr};

use serde::{Deserialize, Serialize};

/// Who can hold coin or items: an account in the journal.
///
/// Written as a string: `world`, `wagon:<n>`, `market:<place>`, `npc:<id>`, or a
/// player creature's handle (anything else).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub enum Holder {
    /// A creature at the table, by its handle (`bren`, `maren`)
    Creature(String),
    /// One of the caravan's wagons, numbered from 1
    Wagon(u32),
    /// The market of a place, by the place id
    Market(String),
    /// A world NPC's purse, by the NPC id (the merchant who pays the wages)
    Npc(String),
    /// The one external account: rewards and monster loot come from it, tolls and
    /// inn fees go to it. Its balance may go below zero.
    World,
}

/// A holder string that names no valid holder
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HolderError(pub String);

impl fmt::Display for HolderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "not a ledger holder: {:?}", self.0)
    }
}

impl std::error::Error for HolderError {}

impl FromStr for Holder {
    type Err = HolderError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let bad = || HolderError(s.to_string());
        let named = |rest: &str| {
            if rest.is_empty() {
                Err(bad())
            } else {
                Ok(rest.to_string())
            }
        };
        if s == "world" {
            Ok(Holder::World)
        } else if let Some(n) = s.strip_prefix("wagon:") {
            match n.parse::<u32>() {
                Ok(n) if n > 0 => Ok(Holder::Wagon(n)),
                _ => Err(bad()),
            }
        } else if let Some(place) = s.strip_prefix("market:") {
            named(place).map(Holder::Market)
        } else if let Some(id) = s.strip_prefix("npc:") {
            named(id).map(Holder::Npc)
        } else if s.is_empty() || s.contains(':') {
            Err(bad())
        } else {
            Ok(Holder::Creature(s.to_string()))
        }
    }
}

impl TryFrom<String> for Holder {
    type Error = HolderError;

    fn try_from(s: String) -> Result<Self, Self::Error> {
        s.parse()
    }
}

impl From<Holder> for String {
    fn from(holder: Holder) -> Self {
        holder.to_string()
    }
}

impl fmt::Display for Holder {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Holder::Creature(handle) => write!(f, "{handle}"),
            Holder::Wagon(n) => write!(f, "wagon:{n}"),
            Holder::Market(place) => write!(f, "market:{place}"),
            Holder::Npc(id) => write!(f, "npc:{id}"),
            Holder::World => write!(f, "world"),
        }
    }
}

/// What an entry moves: coin, or some of one item
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Asset {
    /// Coin, in copper pieces (1 GP = 100 CP)
    Coin {
        /// The amount in copper pieces. One entry moves at most `u32::MAX`
        /// copper (about 43 million GP), so derived balances cannot overflow.
        copper: u32,
    },
    /// Some of one item
    Item {
        /// The item's registry id
        item: String,
        /// How many
        quantity: u32,
    },
}

/// Why something moved. A closed set: a new reason is a new variant, reviewed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    /// A purchase or sale, or a gift between players
    Trade,
    /// A Hired Blade's pay
    Wage,
    /// Taken from a fallen or surrendered creature
    Loot,
    /// A road or bridge toll
    Toll,
    /// An inn's fee for the night
    Inn,
    /// A successful theft; always cites the Sleight of Hand roll
    Theft,
    /// A reward for a deed or a contract
    Reward,
}

/// One movement of coin or items
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    /// Who gives
    pub from: Holder,
    /// Who receives
    pub to: Holder,
    /// What moves
    pub what: Asset,
    /// Why it moves
    pub reason: Reason,
    /// The engine roll that decided it (`rN`), if a roll did
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roll: Option<String>,
}

/// Why the journal refused an entry
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PostError {
    /// `from` and `to` are the same holder
    SameHolder,
    /// The entry moves no coin and no items
    Nothing,
    /// A theft entry cites no roll
    TheftWithoutRoll,
    /// The roll id is not of the form `rN`
    BadRollId(String),
}

impl fmt::Display for PostError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PostError::SameHolder => write!(f, "an entry moves between two different holders"),
            PostError::Nothing => write!(f, "an entry moves at least one coin or item"),
            PostError::TheftWithoutRoll => write!(f, "a theft cites its Sleight of Hand roll"),
            PostError::BadRollId(id) => write!(f, "not a roll id: {id:?}"),
        }
    }
}

impl std::error::Error for PostError {}

/// What a holder holds, derived from the journal: coin in copper and items by id.
/// A value can be negative only for [`Holder::World`], or when the journal is wrong.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Holdings {
    /// Coin in copper pieces
    pub copper: i64,
    /// Item quantities by item id; items at zero are left out
    pub items: BTreeMap<String, i64>,
}

impl Holdings {
    fn apply(&mut self, what: &Asset, sign: i64) {
        match what {
            Asset::Coin { copper } => self.copper += sign * i64::from(*copper),
            Asset::Item { item, quantity } => {
                let held = self.items.entry(item.clone()).or_insert(0);
                *held += sign * i64::from(*quantity);
                if *held == 0 {
                    self.items.remove(item);
                }
            }
        }
    }
}

/// A holder whose derived holdings differ from what its owner reports
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mismatch {
    /// The holder
    pub holder: Holder,
    /// What the journal says it holds
    pub journal: Holdings,
    /// What the owner of the number says it holds
    pub reported: Holdings,
}

/// Entries in the order they were posted, on top of the opening holdings
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Journal {
    opening: BTreeMap<Holder, Holdings>,
    entries: Vec<Entry>,
}

impl Journal {
    /// A journal that starts from what each holder held when the run began (the
    /// roster or the pregens). Holders left out start with nothing.
    pub fn new(opening: BTreeMap<Holder, Holdings>) -> Self {
        Self {
            opening,
            entries: Vec::new(),
        }
    }

    /// Records one entry, or refuses it. The journal does not check that `from`
    /// has enough: the owner of that number already did.
    pub fn post(&mut self, entry: Entry) -> Result<(), PostError> {
        if entry.from == entry.to {
            return Err(PostError::SameHolder);
        }
        let nothing = match &entry.what {
            Asset::Coin { copper } => *copper == 0,
            Asset::Item { quantity, .. } => *quantity == 0,
        };
        if nothing {
            return Err(PostError::Nothing);
        }
        match &entry.roll {
            Some(id) if !is_roll_id(id) => return Err(PostError::BadRollId(id.clone())),
            None if entry.reason == Reason::Theft => return Err(PostError::TheftWithoutRoll),
            _ => {}
        }
        self.entries.push(entry);
        Ok(())
    }

    /// Every entry, in posting order
    pub fn entries(&self) -> &[Entry] {
        &self.entries
    }

    /// Each holder's holdings now: the opening plus every entry. Holders that
    /// end with nothing are left out.
    pub fn balances(&self) -> BTreeMap<Holder, Holdings> {
        let mut balances = self.opening.clone();
        for entry in &self.entries {
            balances
                .entry(entry.from.clone())
                .or_default()
                .apply(&entry.what, -1);
            balances
                .entry(entry.to.clone())
                .or_default()
                .apply(&entry.what, 1);
        }
        balances.retain(|_, holdings| *holdings != Holdings::default());
        balances
    }

    /// The trial balance: compares the journal with what the owners of the
    /// numbers report (core purses and inventories, `nat20-world` wagons) for
    /// the holders in `reported`. Returns every holder that differs; empty means the books are
    /// clean. The world account has no owner and is never compared.
    pub fn check_against(&self, reported: &BTreeMap<Holder, Holdings>) -> Vec<Mismatch> {
        let balances = self.balances();
        reported
            .iter()
            .filter(|(holder, _)| **holder != Holder::World)
            .filter_map(|(holder, reported)| {
                let journal = balances.get(holder).cloned().unwrap_or_default();
                (journal != *reported).then(|| Mismatch {
                    holder: holder.clone(),
                    journal,
                    reported: reported.clone(),
                })
            })
            .collect()
    }
}

fn is_roll_id(id: &str) -> bool {
    id.strip_prefix('r')
        .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}
