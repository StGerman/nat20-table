//! The living world in a session (API-41): reads the campaign and world files, keeps the
//! world, travels it, and builds the DM's world view. `projection.rs` turns that view into a
//! player's.
//!
//! The world itself is `nat20_world` (serde only, decision 0057); this module is the bridge to
//! the wire. Core is reached only through the adapter: the session moves core's time.

use std::path::{Path, PathBuf};

use nat20_api_contract::{
    Ability, CaravanView, CardChoiceDm, CardChoiceView, CardDecided, CardDm, CardSaid, CardTarget,
    CargoView, CarriedItem, Carries, ClockView, Coins, DeedDm, ErrorCode, EscortBlade, EscortDm,
    EscortView, Handle, LegView, MilesToday, NpcAttitude, NpcDm, OfferedCard, Pace, PlaceDm,
    ReachView, RejectReason, RoadDm, RosterWorld, Side, Skill, Terrain, TripLegView, TripView,
    WagonView, Watch, WorldDm, WorldPosition,
};
use nat20_world as world;
use serde::de::DeserializeOwned;

use crate::{
    adapter::{game::NpcNow, monster},
    errors::{error, rejected},
    paths, scene,
};

/// The campaign file in a scenario pack.
pub const CAMPAIGN_FILE: &str = "campaign.json";

/// A running campaign: the world, the party that travels with the caravan, and the road scene.
#[derive(Debug, Clone)]
pub struct Campaign {
    /// The world
    pub world: world::World,
    /// The creatures that travel with the caravan, carried into every scene a journey loads
    pub party: Vec<Handle>,
    /// The scene for the road and for places without a scene of their own
    pub road_scene: String,
    /// The human's creature, when a human plays: it breaks a tied Blade vote
    pub human: Option<String>,
    /// The world map's id, `worlds/<id>/`
    pub map_id: String,
    /// Wages due and not paid yet: the escort's advance, paid once the campaign has started
    pub due: Vec<world::Wage>,
    /// How this contract took up the world the last one left, when it did (ENG-37): logged
    /// as `trip_to_start` (API-51) for the DM to tell in one line
    pub carried: Option<world::Carried>,
    /// The roster's contract was under way and goes on; false when this campaign starts a
    /// contract of its own (API-51)
    pub resumed: bool,
}

impl Campaign {
    /// Reads `campaign.json` from the pack and its world from `<pack>/worlds/<id>/`, else from
    /// the shared worlds directory, and checks that every scene a journey can load exists.
    pub fn read(
        data_dir: &Path,
        party: Vec<Handle>,
        human: Option<String>,
        saved: Option<&RosterWorld>,
    ) -> Result<Self, nat20_api_contract::ApiError> {
        let file: world::CampaignFile = read_json(&data_dir.join(CAMPAIGN_FILE), "campaign")?;
        let setup = file.world;
        if !scene::is_plain_name(&setup.map) {
            return Err(bad(format!(
                "The campaign's world id {:?} is not a plain name.",
                setup.map
            )));
        }
        let dir = world_dir(data_dir, &setup.map);
        let mut map: world::WorldMap = read_json(&dir.join("map.json"), "world map")?;
        // A shared map names no scenes: the pack says which of its scenes each place loads (MAP-7).
        setup
            .place_scenes(&mut map)
            .map_err(|e| bad(format!("The campaign's scenes: {e}.")))?;
        let goods: world::Goods = read_json(&dir.join("goods.json"), "goods file")?;
        if setup.day == 0 || setup.hour > 23 {
            return Err(bad(format!(
                "The campaign starts on day {} at hour {}; days count from 1 and hours run 0 to 23.",
                setup.day, setup.hour
            )));
        }
        if let Some(error) = setup
            .caravan
            .overloaded(&goods)
            .map_err(|e| bad(format!("The campaign's caravan: {e}.")))?
        {
            return Err(bad(format!("The campaign's caravan: {error}.")));
        }
        let built = world::World::new(
            map,
            goods,
            setup.route,
            setup.caravan,
            &setup.start,
            world::Clock::at(setup.day, setup.hour, 0),
        )
        .map_err(|e| bad(format!("The campaign's world {}: {e}.", setup.map)))?;
        // A pack's own cards join the world's deck while its contract runs (ENG-38, Q7).
        let deck = read_deck(&dir)?.join(read_deck(data_dir)?);
        check_effects(&deck, &built.goods)?;
        // The customs a choice keeps or breaks are the world's (ENG-39).
        let customs_file = dir.join("customs.json");
        let customs: world::CustomsFile = if customs_file.exists() {
            read_json(&customs_file, "customs file")?
        } else {
            world::CustomsFile::default()
        };
        customs
            .validate()
            .map_err(|e| bad(format!("The world {}'s customs: {e}.", setup.map)))?;
        deck.check_customs(&customs)
            .map_err(|e| bad(format!("The world {}'s deck: {e}.", setup.map)))?;
        let built = built
            .with_deck(deck)
            .map_err(|e| bad(format!("The world {}'s deck: {e}.", setup.map)))?;
        let mut built = built;
        built.state.pack = file.id.clone();
        // A roster from a campaign on this map takes up the world where it was left (API-45).
        // When its contract is done, the world's memory carries over and this campaign's
        // contract starts from it (ENG-37): the clock goes on, the deeds and the deck are kept,
        // and the party travels to the start if it stands elsewhere.
        let mut carried = None;
        let mut resumed = false;
        if let Some(saved) = saved.filter(|w| w.map == setup.map) {
            // Roster format 2 saves the memory and the contract apart (API-51).
            let state: world::SavedWorld =
                serde_json::from_value(saved.state.clone()).map_err(|e| {
                    error(
                        ErrorCode::BadRoster,
                        format!("The roster's world does not read: {e}."),
                    )
                })?;
            let state = world::WorldState::from(state);
            if !state.escort.as_ref().is_some_and(|e| e.done) {
                // A contract under way is its own pack's: another pack on this map can't open
                // it (ENG-38). A roster saved before packs were remembered names none.
                if let (Some(saved_pack), Some(this)) = (&state.pack, &file.id)
                    && saved_pack != this
                {
                    return Err(error(
                        ErrorCode::BadRoster,
                        format!(
                            "The party is still on the road in {saved_pack}; finish that journey first."
                        ),
                    ));
                }
                // A contract under way is the saved party's: another party can't take it up.
                let mut state = state;
                if state.pack.is_none() {
                    state.pack = file.id.clone();
                }
                if let Some(escort) = &state.escort
                    && escort.blades != party.iter().map(|h| h.0.clone()).collect::<Vec<_>>()
                {
                    return Err(error(
                        ErrorCode::BadRoster,
                        format!(
                            "The roster's escort contract is under way with {}; start the campaign with that party.",
                            escort.blades.join(", ")
                        ),
                    ));
                }
                built.state = state;
                resumed = true;
            } else {
                carried = Some(built.carry_memory(state, setup.hour));
            }
        }
        // The place NPCs (API-48), after the state: a roster's NPCs keep what happened to them.
        let npcs_file = dir.join("npcs.json");
        let npcs: world::NpcFile = if npcs_file.exists() {
            read_json(&npcs_file, "NPC file")?
        } else {
            world::NpcFile::default()
        };
        let built = built
            .with_npcs(npcs)
            .map_err(|e| bad(format!("The world {}'s NPCs: {e}.", setup.map)))?;
        // A player merchant drives the caravan, so they must travel with it.
        if let world::Owner::Player(owner) = &built.state.caravan.owner
            && !party.iter().any(|h| h.0 == *owner)
        {
            return Err(bad(format!(
                "The caravan's owner {owner} is not in the party, so nobody could drive it."
            )));
        }
        // The escort contract (API-47): the Hired Blades are the party, less a player merchant.
        let (built, due) = match setup.escort {
            Some(terms) => {
                let world::Owner::Npc(_) = &built.state.caravan.owner else {
                    return Err(bad(
                        "The campaign's escort needs an NPC merchant (`npc:<id>`) to pay it; a player merchant pays by hand with give.".to_owned(),
                    ));
                };
                let blades = party.iter().map(|h| h.0.clone()).collect();
                built
                    .with_escort(terms, blades)
                    .map_err(|e| bad(format!("The campaign's escort: {e}.")))?
            }
            None => (built, Vec::new()),
        };
        let campaign = Self {
            world: built,
            party,
            human,
            road_scene: setup.road_scene,
            map_id: setup.map.clone(),
            due,
            carried,
            resumed,
        };
        let mut scenes: Vec<&str> = campaign
            .world
            .map
            .places
            .iter()
            .filter_map(|p| p.scene.as_deref())
            .collect();
        scenes.push(&campaign.road_scene);
        for id in scenes {
            read_scene(data_dir, id)?;
        }
        campaign.check_npcs(data_dir)?;
        Ok(campaign)
    }

    /// Checks each place NPC against the scene their place loads: their anchor is in it, no
    /// creature or spawn of it has their id as a handle, and their stat block exists.
    fn check_npcs(&self, data_dir: &Path) -> Result<(), nat20_api_contract::ApiError> {
        for npc in &self.world.npcs {
            let scene_id = self.scene_at(&world::Position::At {
                place: npc.place.clone(),
            });
            let file = read_scene(data_dir, &scene_id)?;
            if !file.anchors.iter().any(|a| a.id == npc.anchor) {
                return Err(bad(format!(
                    "The NPC {} stands at anchor {}, which scene {scene_id} doesn't have.",
                    npc.id, npc.anchor
                )));
            }
            let taken = file.creatures.iter().any(|c| c.handle.0 == npc.id)
                || file
                    .spawns
                    .iter()
                    .any(|s| s.creatures.iter().any(|c| c.handle.0 == npc.id));
            if taken || self.party.iter().any(|h| h.0 == npc.id) {
                return Err(bad(format!(
                    "The NPC id {} is already a creature's handle in scene {scene_id}.",
                    npc.id
                )));
            }
            monster::check(&npc.monster).map_err(|e| bad(format!("The NPC {}: {e}", npc.id)))?;
            crate::adapter::game::check_carries(&carries_wire(&npc.carries))
                .map_err(|e| bad(format!("The NPC {}'s carries: {e}.", npc.id)))?;
        }
        Ok(())
    }

    /// The living NPCs of the place the caravan is in, whose scene `scene_id` is, with what each
    /// is placed with: id, stat block, side, anchor, name, carries and Hit Points (none is full).
    pub fn npcs_to_place(&self, scene_id: &str) -> Vec<NpcPlacement> {
        let Some(place) = self.world.place_here() else {
            return Vec::new();
        };
        if self.scene_at(&self.world.state.at) != scene_id {
            return Vec::new();
        }
        self.world
            .npcs_at(place)
            .map(|(def, state)| NpcPlacement {
                id: def.id.clone(),
                monster: def.monster.clone(),
                side: match state.attitude {
                    world::Attitude::Hostile => Side::Hostile,
                    world::Attitude::Friendly | world::Attitude::Indifferent => Side::Neutral,
                },
                anchor: def.anchor.clone(),
                name: def.name.clone(),
                carries: carries_wire(&state.carries),
                hp: state.hp,
            })
            .collect()
    }

    /// The escort contract as the party knows it.
    pub fn escort_view(&self) -> Option<EscortView> {
        let terms = self.world.escort.as_ref()?;
        let state = self.world.state.escort.as_ref()?;
        Some(EscortView {
            merchant: self.world.state.caravan.owner.to_string(),
            destination: terms.destination.clone(),
            wage_cp: terms.wage_cp,
            advance_days: terms.advance_days,
            blades: state
                .blades
                .iter()
                .map(|b| EscortBlade {
                    handle: Handle(b.clone()),
                    served: state.served(b),
                    paid_cp: state.paid(b),
                })
                .collect(),
            done: state.done,
        })
    }

    /// The merchant's purse holder (`npc:<id>`) and what it holds, when an escort runs.
    pub fn merchant_purse(&self) -> Option<(String, u64)> {
        let state = self.world.state.escort.as_ref()?;
        Some((self.world.state.caravan.owner.to_string(), state.purse_cp))
    }

    /// A night passed: each Blade not dead has served one more day.
    pub fn escort_night(&mut self, dead: impl Fn(&str) -> bool) {
        if let Some(state) = self.world.state.escort.as_mut() {
            state.night(|b| !dead(b));
        }
    }

    /// The caravan arrived at `place`: the wages due at the destination, if it is that.
    pub fn escort_arrive(&mut self, place: &str, dead: impl Fn(&str) -> bool) -> Vec<world::Wage> {
        let (Some(terms), Some(state)) =
            (self.world.escort.as_ref(), self.world.state.escort.as_mut())
        else {
            return Vec::new();
        };
        state.arrive(terms, place, |b| !dead(b))
    }

    /// Marks an NPC met: the party is in their place with them.
    pub fn met(&mut self, id: &str) {
        if let Some(state) = self.world.state.npcs.get_mut(id) {
            state.met = true;
        }
    }

    /// The ids of every place NPC.
    pub fn npc_ids(&self) -> Vec<String> {
        self.world.npcs.iter().map(|d| d.id.clone()).collect()
    }

    /// Writes back what an NPC is like as the party leaves them.
    pub fn left(&mut self, id: &str, now: NpcNow) {
        if let Some(state) = self.world.state.npcs.get_mut(id) {
            world::npcs::left(
                state,
                world::NpcLeft {
                    hp: (now.hp, now.max_hp),
                    alive: now.alive,
                    carries: world::NpcCarries {
                        coins: world::NpcCoins {
                            cp: now.coins.cp,
                            sp: now.coins.sp,
                            ep: now.coins.ep,
                            gp: now.coins.gp,
                            pp: now.coins.pp,
                        },
                        items: now
                            .items
                            .into_iter()
                            .map(|i| world::NpcItem {
                                item: i.item,
                                quantity: i.quantity,
                            })
                            .collect(),
                    },
                },
            );
        }
    }

    /// Whether `handle` may call `travel`: the owner, or any party member when an NPC owns the
    /// caravan.
    pub fn drives(&self, handle: &str) -> bool {
        let in_party = self.party.iter().any(|h| h.0 == handle);
        in_party && self.world.state.caravan.may_drive(handle, in_party)
    }

    /// Every party member who may call `travel`.
    pub fn drivers(&self) -> Vec<String> {
        self.party
            .iter()
            .filter(|h| self.drives(&h.0))
            .map(|h| h.0.clone())
            .collect()
    }

    /// The scene a caravan at `at` stands in: the place's own, else the road scene.
    pub fn scene_at(&self, at: &world::Position) -> String {
        match at {
            world::Position::At { place } => self
                .world
                .map
                .place(place)
                .and_then(|p| p.scene.clone())
                .unwrap_or_else(|| self.road_scene.clone()),
            world::Position::OnRoad { .. } => self.road_scene.clone(),
        }
    }

    /// The inn's price per person for a night, when the caravan is in a place with an inn.
    pub fn inn_here(&self) -> Option<u32> {
        match &self.world.state.at {
            world::Position::At { place } => self.world.map.place(place).and_then(|p| p.inn_cp),
            world::Position::OnRoad { .. } => None,
        }
    }

    /// Plans one leg on a copy of the world: the copy after the leg and the leg, or why not.
    /// Nothing changes until the caller keeps the copy.
    pub fn plan_leg(
        &self,
        to: Option<&str>,
        pace: Pace,
    ) -> Result<(world::World, world::Leg), nat20_api_contract::ApiError> {
        let mut next = self.world.clone();
        // A party member at half Speed or less forces a Slow pace (SRD 5.2.1, Slower
        // Travelers). Nothing out of combat halves Speed until exhaustion (ENG-29).
        let leg = next
            .travel(to, from_pace(pace), false)
            .map_err(travel_error)?;
        Ok((next, leg))
    }

    /// The leg as the wire tells it, with the world already moved on.
    pub fn leg_view(&self, actor: &str, leg: &world::Leg) -> LegView {
        LegView {
            actor: Handle(actor.to_owned()),
            road: leg.road.clone(),
            pace: to_pace(leg.pace),
            miles: leg.miles,
            minutes: leg.minutes,
            arrived: leg.arrived,
            at: self.position(),
        }
    }

    /// Who sits at the table for a card: the owner, the Blades who can speak (party members
    /// `up`, less a player owner), and the human's seat.
    pub fn table(&self, up: impl Fn(&str) -> bool) -> world::Table {
        let owner = self.world.state.caravan.owner.clone();
        let blades = self
            .party
            .iter()
            .filter(|h| !matches!(&owner, world::Owner::Player(o) if *o == h.0))
            .filter(|h| up(&h.0))
            .map(|h| h.0.clone())
            .collect();
        world::Table {
            owner,
            blades,
            tie_breaker: self.human.clone(),
        }
    }

    /// An offered card, as the DM sees it (API-53): the choices it would offer with the
    /// deeds the world remembers now.
    pub fn offered_card(&self, id: &str) -> Option<OfferedCard> {
        let card = self.world.deck.card(id)?;
        let offers = world::PendingCard {
            card: card.id.clone(),
            choices: world::Deck::offer_ids(card, &self.world.state.deeds),
            said: Default::default(),
        };
        Some(OfferedCard {
            id: card.id.clone(),
            zone: card.zone.clone(),
            target: target(card.target),
            text: card.text.clone(),
            choices: choices_dm(card, Some(&offers)),
            note: card.note.clone(),
            scout: card.scout.map(scout_skill),
        })
    }

    /// The card on the table, as the DM sees it.
    fn card_view(&self, table: &world::Table) -> Option<CardDm> {
        let pending = self.world.state.deck.pending.as_ref()?;
        let card = self.world.deck.card(&pending.card)?;
        Some(CardDm {
            id: card.id.clone(),
            zone: card.zone.clone(),
            target: target(card.target),
            text: card.text.clone(),
            choices: choices_dm(card, Some(pending)),
            said: pending
                .said
                .iter()
                .map(|(actor, choice)| CardSaid {
                    actor: Handle(actor.clone()),
                    choice: choice.clone(),
                })
                .collect(),
            waiting_for: table
                .blades
                .iter()
                .filter(|b| !pending.said.contains_key(*b))
                .map(|b| Handle(b.clone()))
                .collect(),
            note: card.note.clone(),
            scout: card.scout.map(scout_skill),
        })
    }

    /// How long each road out of the caravan's place takes, by road id (API-49).
    pub fn reach(&self) -> std::collections::BTreeMap<String, ReachView> {
        self.world
            .reach()
            .into_iter()
            .map(|r| {
                (
                    r.road,
                    ReachView {
                        pace: to_pace(r.pace),
                        minutes: r.minutes,
                        nights: r.nights,
                        arrives: clock_view(r.arrives),
                    },
                )
            })
            .collect()
    }

    /// The route to the escort's destination while the contract is under way (API-49).
    pub fn trip(&self) -> Option<TripView> {
        if self.world.state.escort.as_ref().is_some_and(|e| e.done) {
            return None;
        }
        self.world.trip().map(|t| TripView {
            legs: t
                .legs
                .into_iter()
                .map(|l| TripLegView {
                    road: l.road,
                    to: l.to,
                    pace: to_pace(l.pace),
                    miles: l.miles,
                    minutes: l.minutes,
                    nights: l.nights,
                    arrives: clock_view(l.arrives),
                })
                .collect(),
            complete: t.complete,
        })
    }

    /// The world as the DM sees it; `up` tells which party members can speak on a card.
    pub fn dm_view(&self, up: impl Fn(&str) -> bool) -> WorldDm {
        let table = self.table(up);
        let w = &self.world;
        let state = &w.state;
        WorldDm {
            clock: clock_view(state.clock),
            at: self.position(),
            today: MilesToday {
                fast: w.miles_left_today(world::Pace::Fast),
                normal: w.miles_left_today(world::Pace::Normal),
                slow: w.miles_left_today(world::Pace::Slow),
            },
            places: w
                .map
                .places
                .iter()
                .map(|p| PlaceDm {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    kind: p.kind.clone(),
                    market: p.market,
                    inn_cp: p.inn_cp,
                    discovered: state.discovered.contains(&p.id),
                    scene: p.scene.clone().unwrap_or_else(|| self.road_scene.clone()),
                })
                .collect(),
            roads: w
                .map
                .roads
                .iter()
                .map(|r| RoadDm {
                    id: r.id.clone(),
                    from: r.from.clone(),
                    to: r.to.clone(),
                    miles: r.miles,
                    terrain: terrain(r.terrain),
                    good_road: r.good_road,
                    max_pace: to_pace(r.max_pace()),
                    zone: r.zone.clone(),
                })
                .collect(),
            caravan: CaravanView {
                owner: state.caravan.owner.to_string(),
                wagons: state
                    .caravan
                    .wagons
                    .iter()
                    .map(|wagon| WagonView {
                        n: wagon.n,
                        vehicle: wagon.vehicle.clone(),
                        limit_lb: wagon.limit_lb(),
                        load_lb: wagon.load_lb(&w.goods).unwrap_or(0),
                        cargo: wagon
                            .cargo
                            .iter()
                            .map(|(good, quantity)| {
                                let known = w.goods.get(good);
                                CargoView {
                                    good: good.clone(),
                                    name: known.map_or_else(|| good.clone(), |g| g.name.clone()),
                                    quantity: *quantity,
                                    weight_lb: known
                                        .map_or(0, |g| g.weight_lb.saturating_mul(*quantity)),
                                }
                            })
                            .collect(),
                    })
                    .collect(),
            },
            route: match state.caravan.owner {
                world::Owner::Npc(_) => w.route.clone(),
                world::Owner::Player(_) => Vec::new(),
            },
            card: self.card_view(&table),
            offered: state
                .deck
                .offered
                .iter()
                .filter_map(|id| self.offered_card(id))
                .collect(),
            scout: state.scout.clone().map(Handle),
            deeds: state
                .deeds
                .iter()
                .map(|(id, d)| DeedDm {
                    deed: id.clone(),
                    by: d.by.iter().cloned().map(Handle).collect(),
                    day: d.day,
                    contract: d.contract,
                })
                .collect(),
            escort: self.escort_view().map(|contract| EscortDm {
                contract,
                purse_cp: state.escort.as_ref().map_or(0, |e| e.purse_cp),
            }),
            npcs: w
                .npcs
                .iter()
                .filter_map(|d| {
                    let s = state.npcs.get(&d.id)?;
                    Some(NpcDm {
                        id: d.id.clone(),
                        name: d.name.clone(),
                        place: d.place.clone(),
                        monster: d.monster.clone(),
                        attitude: match s.attitude {
                            world::Attitude::Friendly => NpcAttitude::Friendly,
                            world::Attitude::Indifferent => NpcAttitude::Indifferent,
                            world::Attitude::Hostile => NpcAttitude::Hostile,
                        },
                        alive: s.alive,
                        met: s.met,
                        hp: s.hp,
                        notes: d.notes.clone(),
                    })
                })
                .collect(),
        }
    }

    fn position(&self) -> WorldPosition {
        match &self.world.state.at {
            world::Position::At { place } => WorldPosition::At {
                place: place.clone(),
            },
            world::Position::OnRoad {
                road,
                toward,
                miles_left,
            } => {
                let came_from = self
                    .world
                    .map
                    .road(road)
                    .and_then(|r| r.other_end(toward))
                    .unwrap_or_default()
                    .to_owned();
                WorldPosition::OnRoad {
                    road: road.clone(),
                    came_from,
                    miles_left: *miles_left,
                }
            }
        }
    }
}

/// A place NPC to place on arrival (API-48).
#[derive(Debug, Clone)]
pub struct NpcPlacement {
    /// The id, used as the creature's handle
    pub id: String,
    /// The stat block
    pub monster: String,
    /// The side of a fight they stand on
    pub side: Side,
    /// The anchor they stand at
    pub anchor: String,
    /// The name players read
    pub name: String,
    /// What they carry now
    pub carries: Carries,
    /// Hit Points the party left them with; none is full
    pub hp: Option<u32>,
}

/// Reads a scene a journey can load; any reason it can't be read is the campaign's `bad_scene`.
fn read_scene(
    data_dir: &Path,
    id: &str,
) -> Result<nat20_api_contract::SceneFile, nat20_api_contract::ApiError> {
    scene::read(data_dir, id).map_err(|e| nat20_api_contract::ApiError {
        code: ErrorCode::BadScene,
        ..e
    })
}

fn carries_wire(c: &world::NpcCarries) -> Carries {
    Carries {
        coins: Coins {
            cp: c.coins.cp,
            sp: c.coins.sp,
            ep: c.coins.ep,
            gp: c.coins.gp,
            pp: c.coins.pp,
        },
        items: c
            .items
            .iter()
            .map(|i| CarriedItem {
                item: i.item.clone(),
                quantity: i.quantity,
            })
            .collect(),
    }
}

/// The world's deck: every `deck/*.json`, files in name order; none is an empty deck.
fn read_deck(dir: &Path) -> Result<world::Deck, nat20_api_contract::ApiError> {
    let deck_dir = dir.join("deck");
    // Only a world with no deck directory has no cards; any other failure to read it is the
    // campaign's, never a silently smaller deck.
    let unreadable = |e: std::io::Error| {
        bad(format!(
            "The deck {} does not read: {e}.",
            deck_dir.display()
        ))
    };
    let entries = match std::fs::read_dir(&deck_dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(world::Deck::default()),
        Err(e) => return Err(unreadable(e)),
    };
    let mut paths: Vec<PathBuf> = Vec::new();
    for entry in entries {
        let path = entry.map_err(unreadable)?.path();
        if path.extension().is_some_and(|x| x == "json") {
            paths.push(path);
        }
    }
    paths.sort();
    let mut files = Vec::new();
    for path in paths {
        files.push(read_json::<world::DeckFile>(&path, "deck file")?);
    }
    Ok(world::Deck::from_files(files))
}

/// What the world crate can't check on a card: abilities and skills (the skill's own
/// ability), stat blocks and goods.
fn check_effects(
    deck: &world::Deck,
    goods: &world::Goods,
) -> Result<(), nat20_api_contract::ApiError> {
    for card in &deck.cards {
        for effect in world::Deck::effects(card) {
            let problem = match effect {
                world::Effect::Check { ability, skill, .. } => match parse_check(ability, skill) {
                    Some((a, s)) if crate::adapter::sheet::skill_fits(a, s) => None,
                    Some(_) => Some(format!("{skill} is not a {ability} check")),
                    None => Some(format!("{ability} / {skill} is not an ability and a skill")),
                },
                world::Effect::Fight { monsters } => monsters
                    .iter()
                    .find_map(|m| crate::adapter::monster::check(m.stat()).err()),
                world::Effect::Cargo { good, .. } if goods.get(good).is_none() => {
                    Some(format!("there is no good {good}"))
                }
                _ => None,
            };
            if let Some(problem) = problem {
                return Err(bad(format!("Deck card {}: {problem}.", card.id)));
            }
        }
    }
    Ok(())
}

/// A card check's ability and skill as wire values.
pub fn parse_check(ability: &str, skill: &str) -> Option<(Ability, Skill)> {
    let ability = serde_json::from_value(serde_json::Value::String(ability.to_owned())).ok()?;
    let skill = serde_json::from_value(serde_json::Value::String(skill.to_owned())).ok()?;
    Some((ability, skill))
}

/// The skill a card is scouted with, on the wire (API-54).
pub fn scout_skill(skill: world::ScoutSkill) -> Skill {
    match skill {
        world::ScoutSkill::Perception => Skill::Perception,
        world::ScoutSkill::Survival => Skill::Survival,
    }
}

/// How a card was decided, on the wire.
pub fn decided(decided: world::Decided) -> CardDecided {
    match decided {
        world::Decided::Owner => CardDecided::Owner,
        world::Decided::Majority => CardDecided::Majority,
        world::Decided::Tie => CardDecided::Tie,
        world::Decided::OwnerInsists => CardDecided::OwnerInsists,
        world::Decided::Default => CardDecided::Default,
    }
}

/// A card's target, on the wire.
pub fn target(target: world::Target) -> CardTarget {
    match target {
        world::Target::Caravan => CardTarget::Caravan,
        world::Target::Blades => CardTarget::Blades,
    }
}

/// A card's choices on the wire: the ones offered when it went on the table, else all.
pub fn choices(card: &world::Card, pending: Option<&world::PendingCard>) -> Vec<CardChoiceView> {
    card.choices
        .iter()
        .filter(|c| pending.is_none_or(|p| p.offers(&c.id)))
        .map(|c| CardChoiceView {
            id: c.id.clone(),
            text: c.text.clone(),
        })
        .collect()
}

/// A card's choices as the DM sees them (API-55): the offered ones, else all, with the customs
/// each keeps or breaks.
pub fn choices_dm(card: &world::Card, pending: Option<&world::PendingCard>) -> Vec<CardChoiceDm> {
    card.choices
        .iter()
        .filter(|c| pending.is_none_or(|p| p.offers(&c.id)))
        .map(|c| CardChoiceDm {
            id: c.id.clone(),
            text: c.text.clone(),
            keeps: c.keeps.clone(),
            breaks: c.breaks.clone(),
        })
        .collect()
}

/// `<pack>/worlds/<id>` when the pack carries its world, else the shared worlds directory.
fn world_dir(data_dir: &Path, id: &str) -> PathBuf {
    let own = data_dir.join("worlds").join(id);
    if own.is_dir() {
        own
    } else {
        paths::worlds_dir().join(id)
    }
}

fn read_json<T: DeserializeOwned>(
    path: &Path,
    what: &str,
) -> Result<T, nat20_api_contract::ApiError> {
    let text = std::fs::read_to_string(path)
        .map_err(|_| bad(format!("There is no {what} at {}.", path.display())))?;
    serde_json::from_str(&text).map_err(|e| bad(format!("The {what} is not valid: {e}.")))
}

fn bad(message: String) -> nat20_api_contract::ApiError {
    error(ErrorCode::BadScene, message)
}

fn travel_error(e: world::TravelError) -> nat20_api_contract::ApiError {
    match e {
        world::TravelError::NoRoad { to } => rejected(
            RejectReason::NoRoad,
            format!("No road from here leads to {to}."),
        ),
        world::TravelError::RouteDone => rejected(
            RejectReason::NoRoad,
            "The caravan's route has no next place from here.",
        ),
        world::TravelError::NeedDestination => error(
            ErrorCode::BadRequest,
            "Say where the caravan goes: a place or road id as `to`.",
        ),
        world::TravelError::PaceTooFast { max } => rejected(
            RejectReason::PaceTooFast,
            format!("The fastest pace here is {}.", pace_name(to_pace(max))),
        ),
        world::TravelError::DayOver => rejected(
            RejectReason::DayOver,
            "The day's travel is spent; the caravan goes on after a night's rest.",
        ),
        world::TravelError::Caravan(world::CaravanError::Overloaded {
            wagon,
            load_lb,
            limit_lb,
        }) => rejected(
            RejectReason::Overloaded,
            format!("Wagon {wagon} carries {load_lb} lb, over its {limit_lb} lb; it cannot move."),
        ),
        world::TravelError::Caravan(other) => error(ErrorCode::Internal, other.to_string()),
    }
}

fn pace_name(pace: Pace) -> &'static str {
    match pace {
        Pace::Fast => "fast",
        Pace::Normal => "normal",
        Pace::Slow => "slow",
    }
}

fn to_pace(pace: world::Pace) -> Pace {
    match pace {
        world::Pace::Fast => Pace::Fast,
        world::Pace::Normal => Pace::Normal,
        world::Pace::Slow => Pace::Slow,
    }
}

fn from_pace(pace: Pace) -> world::Pace {
    match pace {
        Pace::Fast => world::Pace::Fast,
        Pace::Normal => world::Pace::Normal,
        Pace::Slow => world::Pace::Slow,
    }
}

fn terrain(t: world::Terrain) -> Terrain {
    match t {
        world::Terrain::Arctic => Terrain::Arctic,
        world::Terrain::Coastal => Terrain::Coastal,
        world::Terrain::Desert => Terrain::Desert,
        world::Terrain::Forest => Terrain::Forest,
        world::Terrain::Grassland => Terrain::Grassland,
        world::Terrain::Hill => Terrain::Hill,
        world::Terrain::Mountain => Terrain::Mountain,
        world::Terrain::Swamp => Terrain::Swamp,
        world::Terrain::Underdark => Terrain::Underdark,
        world::Terrain::Urban => Terrain::Urban,
    }
}

pub(crate) fn clock_view(clock: world::Clock) -> ClockView {
    ClockView {
        day: clock.day,
        hour: clock.hour(),
        minute: clock.minute % 60,
        watch: match clock.watch() {
            world::Watch::SmallHours => Watch::SmallHours,
            world::Watch::Dawn => Watch::Dawn,
            world::Watch::Morning => Watch::Morning,
            world::Watch::Afternoon => Watch::Afternoon,
            world::Watch::Evening => Watch::Evening,
            world::Watch::Night => Watch::Night,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every deck in the repository names abilities with their own skills, stat blocks core
    /// knows and goods its world lists (MAP-6): what the world crate can't check.
    #[test]
    fn every_world_deck_names_known_rules_content() {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        for root in ["worlds", "crates/nat20-api-server/data/worlds"] {
            for entry in std::fs::read_dir(repo.join(root)).unwrap() {
                let dir = entry.unwrap().path();
                let goods: world::Goods = read_json(&dir.join("goods.json"), "goods file").unwrap();
                let deck = read_deck(&dir).unwrap();
                check_effects(&deck, &goods)
                    .unwrap_or_else(|e| panic!("{}: {}", dir.display(), e.message));
            }
        }
    }
}
