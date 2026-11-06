//! The party as the roster saves it (API-45): each character's pregen, level, XP, the level-up
//! picks made in play, gear, coins, Exhaustion and hunger. Hit Points are not kept.

use nat20_api_contract::{EquipSlot, PregenItem, RosterCharacter};
use nat20_core::components::{
    items::{equipment::slots::EquipmentSlot, inventory::Inventory},
    level::CharacterLevels,
};

use super::*;

/// The slots a roster (like a pregen file) equips, and their names on the wire.
const ROSTER_SLOTS: [(EquipmentSlot, EquipSlot); 5] = [
    (EquipmentSlot::Armor, EquipSlot::Armor),
    (EquipmentSlot::MeleeMainHand, EquipSlot::MeleeMainHand),
    (EquipmentSlot::MeleeOffHand, EquipSlot::MeleeOffHand),
    (EquipmentSlot::RangedMainHand, EquipSlot::RangedMainHand),
    (EquipmentSlot::RangedOffHand, EquipSlot::RangedOffHand),
];

impl Game {
    /// The characters to save: `party` in its order when given, else every party character in
    /// the scene, in scene order. A creature not built from a pregen (a placed stat block) is
    /// not saved. A party member left out of the scene keeps what the roster it came from says.
    pub fn roster_characters(&self, party: Option<&[Handle]>) -> Vec<RosterCharacter> {
        match party {
            Some(party) => party
                .iter()
                .filter_map(
                    |h| match self.scene.creatures.iter().find(|c| c.handle == h.0) {
                        Some(c) => self.saved(c),
                        None => self.roster.iter().find(|r| r.handle == *h).cloned(),
                    },
                )
                .collect(),
            None => self
                .scene
                .creatures
                .iter()
                .filter(|c| c.side == Side::Party)
                .filter_map(|c| self.saved(c))
                .collect(),
        }
    }

    fn saved(&self, creature: &SceneCreature) -> Option<RosterCharacter> {
        let pregen = creature.pregen.clone()?;
        let world = &self.engine.world;
        let entity = creature.entity;
        let (mut level, xp) = {
            let levels = world.get::<&CharacterLevels>(entity).ok()?;
            (levels.total_level(), levels.experience())
        };
        // Picks from the roster this character was built from, then the ones made since.
        let mut choices: Vec<_> = self
            .roster
            .iter()
            .find(|r| r.handle.0 == creature.handle && r.pregen == pregen)
            .map(|r| r.choices.clone())
            .unwrap_or_default();
        choices.extend(
            self.history
                .get(&creature.handle)
                .cloned()
                .unwrap_or_default(),
        );
        // A level-up still open is saved as not begun: the level before it, none of its picks.
        // Its XP stays, so the character levels up again after loading.
        if let Some(open) = self
            .level_up
            .as_ref()
            .filter(|open| open.handle() == creature.handle)
        {
            level = open.level() - 1;
            choices.retain(|c| c.level != open.level());
        }
        let exhaustion = systems::exhaustion::exhaustion(world, entity);
        Some(RosterCharacter {
            handle: Handle(creature.handle.clone()),
            pregen,
            level,
            xp,
            choices,
            equipment: gear(&self.engine, entity),
            purse: goods::purse(&self.engine, entity).coins,
            exhaustion: exhaustion.level,
            malnutrition: exhaustion.from_malnutrition,
            days_without_food: systems::exhaustion::days_without_food(world, entity),
        })
    }
}

/// What a character carries, as a pregen file lists it: the equipped items with their slot,
/// then the carried ones in the order they were picked up, each kind once with its count.
fn gear(engine: &EngineState, entity: Entity) -> Vec<PregenItem> {
    let world = &engine.world;
    let mut items: Vec<PregenItem> = Vec::new();
    let mut carried: Vec<String> = Vec::new();
    let loadout = systems::loadout::loadout(world, entity);
    for (slot, wire) in ROSTER_SLOTS {
        if let Some(id) = loadout.item_in_slot(&slot) {
            items.push(PregenItem {
                comment: None,
                item: id.to_string(),
                quantity: 1,
                equip: Some(wire),
            });
        }
    }
    // An item in a slot a pregen file cannot name (a ring, a cloak) is saved as carried.
    for slot in [
        EquipmentSlot::Headwear,
        EquipmentSlot::Cloak,
        EquipmentSlot::Gloves,
        EquipmentSlot::Boots,
        EquipmentSlot::Amulet,
        EquipmentSlot::Ring1,
        EquipmentSlot::Ring2,
    ] {
        if let Some(id) = loadout.item_in_slot(&slot) {
            carried.push(id.to_string());
        }
    }
    drop(loadout);
    if let Ok(inventory) = world.get::<&Inventory>(entity) {
        carried.extend(inventory.items().iter().map(|id| id.to_string()));
    }
    for id in carried {
        match items
            .iter_mut()
            .find(|i| i.equip.is_none() && i.item == id && i.quantity < u8::MAX)
        {
            Some(line) => line.quantity += 1,
            None => items.push(PregenItem {
                comment: None,
                item: id,
                quantity: 1,
                equip: None,
            }),
        }
    }
    items
}
