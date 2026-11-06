//! Place NPCs in a scene (API-48): placed on the party's arrival from what the world remembers,
//! and read back when the party leaves. The world keeps the record; core holds the creature
//! only while the party is in the NPC's place.

use nat20_api_contract::{CarriedItem, Carries, Coins};
use nat20_core::components::{health::life_state::LifeState, items::inventory::Inventory};

use super::*;

/// A place NPC as core holds them now.
pub struct NpcNow {
    /// Current Hit Points
    pub hp: u32,
    /// The maximum
    pub max_hp: u32,
    /// Not dead (a creature at 0 HP that isn't dead yet counts as alive)
    pub alive: bool,
    /// Coins
    pub coins: Coins,
    /// Items, each kind once, in the order first picked up
    pub items: Vec<CarriedItem>,
}

impl Game {
    /// Places a place NPC at `anchor` with what they carry, as a scripted creature named
    /// `name`, and gives back the Hit Points the party left them with (`hp`; none is full).
    #[allow(clippy::too_many_arguments)]
    pub fn place_npc(
        &mut self,
        handle: &str,
        monster: &str,
        side: Side,
        anchor: &str,
        name: &str,
        carries: &Carries,
        hp: Option<u32>,
    ) -> Result<(), ApiError> {
        self.place_creature(
            &Handle(handle.to_owned()),
            monster,
            side,
            &Placement::Anchor {
                anchor: anchor.to_owned(),
            },
            Some(name),
            Some(carries),
        )?;
        if let Some(hp) = hp {
            let entity = self.entity(handle)?;
            systems::health::restore(&mut self.engine.world, entity, hp);
        }
        Ok(())
    }

    /// Whether a creature in the scene is dead; false for one not in it.
    pub fn is_dead(&self, handle: &str) -> bool {
        self.entity(handle).is_ok_and(|entity| {
            self.engine
                .world
                .get::<&LifeState>(entity)
                .is_ok_and(|l| matches!(*l, LifeState::Dead))
        })
    }

    /// A place NPC as core holds them now; none when they aren't in the scene.
    pub fn npc_now(&self, handle: &str) -> Option<NpcNow> {
        let entity = self.entity(handle).ok()?;
        let world = &self.engine.world;
        let (hp, max_hp) = world
            .get::<&HitPoints>(entity)
            .map(|h| (h.current(), h.max()))
            .ok()?;
        let alive = world
            .get::<&LifeState>(entity)
            .map_or(hp > 0, |l| !matches!(*l, LifeState::Dead));
        let mut items: Vec<CarriedItem> = Vec::new();
        if let Ok(inventory) = world.get::<&Inventory>(entity) {
            for id in inventory.items().iter() {
                let item = goods::short_item_id(id);
                match items.iter_mut().find(|i| i.item == item) {
                    Some(line) => line.quantity += 1,
                    None => items.push(CarriedItem { item, quantity: 1 }),
                }
            }
        }
        Some(NpcNow {
            hp,
            max_hp,
            alive,
            coins: goods::purse(&self.engine, entity).coins,
            items,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    /// A townsperson the party left hurt comes back as hurt, with the coin they had.
    #[test]
    fn a_place_npc_comes_back_with_the_hit_points_and_coin_they_were_left_with() {
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("data");
        let scene = scene::read(&data, "vale_town").unwrap();
        crate::adapter::seed_dice(1);
        let Ok(mut game) = Game::load(None, &scene, &[], &[]) else {
            panic!("vale_town loads");
        };
        let carries = Carries {
            coins: Coins {
                gp: 4,
                ..Coins::default()
            },
            items: vec![CarriedItem {
                item: "potion_of_healing".to_owned(),
                quantity: 2,
            }],
        };
        game.place_npc(
            "hal",
            "guard",
            Side::Neutral,
            "wagon",
            "Hal",
            &carries,
            Some(3),
        )
        .unwrap();
        let now = game.npc_now("hal").unwrap();
        assert_eq!(now.hp, 3);
        assert!(now.max_hp > 3);
        assert!(now.alive);
        assert_eq!(now.coins.gp, 4);
        assert_eq!(now.items, carries.items);
        assert!(game.npc_now("nobody").is_none());

        // At full when none is given.
        game.place_npc(
            "ada",
            "commoner",
            Side::Neutral,
            "wagon",
            "Ada",
            &Carries {
                coins: Coins::default(),
                items: Vec::new(),
            },
            None,
        )
        .unwrap();
        let ada = game.npc_now("ada").unwrap();
        assert_eq!(ada.hp, ada.max_hp);
    }
}
