// What each option does, for the action card in the human's seat (AGT-70): one to three plain
// sentences per action, feature and spell the four pregens have, in our own words after SRD 5.2.1
// (CC-BY-4.0). The card describes; it never computes. No to-hit odds, damage averages or DCs: the
// engine resolves every roll (Rule 4), and a number here would read as a promise. Dash, Disengage
// and Dodge say the same as the AI players' rules primer (agents/primer/rules.md); a test holds the two together.
import type { ActionCost } from "@nat20-table/engine-client";

/** The card's text for one option. */
export interface Guide {
  /** What the option does, one to three sentences. */
  text: string;
}

/** Keyed by `option_id`, without a spell's slot level (`cast/bless/1` is `cast/bless`). */
const GUIDE: Record<string, string> = {
  // Actions everyone has.
  dash: "You gain extra movement equal to your Speed this turn; a second Dash in the same turn adds it again.",
  disengage: "Your movement this turn provokes no opportunity attacks.",
  dodge:
    "Until the start of your next turn, attacks against you have Disadvantage and you have Advantage on Dexterity saving throws; you lose this while you are Incapacitated or your Speed is 0.",
  "help/assist_attack_roll": "Pick a foe within 5 feet of you: the next attack roll an ally makes against it before your next turn has Advantage.",
  "help/assist_ability_check": "Pick an ally and a skill or tool you are proficient with: their next check with it before your next turn has Advantage.",
  "help/stabilize": "Try to steady a dying creature within 5 feet with a Wisdom (Medicine) check. On a success it stops making death saving throws.",
  unarmed_attack: "Punch, kick or headbutt a creature within your reach. A hit deals bludgeoning damage of 1 plus your Strength modifier.",
  melee_attack: "Attack a creature within the weapon's reach. A hit deals the weapon's damage.",
  ranged_attack: "Shoot at a creature in the weapon's range. Past its normal range, or with a foe within 5 feet of you, the roll has Disadvantage.",
  opportunity_attack: "A creature you can see is leaving your reach: make one melee attack against it.",
  "use/potion_of_healing": "Drink it, or give it to a creature within 5 feet. The drinker regains 2d4 + 2 Hit Points.",
  move: "Walk next to a creature or to a place. Leaving a foe's reach lets it make an opportunity attack, unless you took Disengage.",
  end_turn: "End your turn. Whatever you didn't use is lost; your reaction comes back at the start of your next turn.",

  // Fighter (Bren).
  "fighter/second_wind": "Catch your breath and regain 1d10 + your Fighter level in Hit Points. You have a few uses; a Short Rest gives one back.",
  "fighter/action_surge": "Take one more action this turn (not the Magic action). Once until you finish a Short or Long Rest.",
  "fighter/tactical_mind": "You failed an ability check: spend a use of Second Wind to add 1d10 to it. If it still fails, the use isn't spent.",

  // Barbarian (Torva).
  "barbarian/rage":
    "Resistance to bludgeoning, piercing and slashing damage, extra damage on Strength attacks, Advantage on Strength checks and saves; no spells. Attack a foe, force a save or spend a Bonus Action each turn to keep it, up to 10 minutes.",
  "barbarian/extend_rage": "Keep your Rage going until the end of your next turn.",
  "barbarian/reckless_attack": "Attack with Advantage on Strength attack rolls this turn; until your next turn, attack rolls against you have Advantage too.",
  "dragonborn/breath_weapon":
    "Breathe fire in a cone or a line. Each creature in it makes a Dexterity saving throw: full damage on a failure, half on a success. A few uses until you finish a Long Rest.",

  // Cleric (Maren).
  "cleric/divine_spark": "Channel Divinity at a creature within 30 feet: heal it, or have it make a Constitution saving throw against radiant or necrotic damage (half on a success).",
  "cast/sacred_flame": "Radiant flame falls on a creature you can see: it makes a Dexterity saving throw or takes radiant damage. Cover doesn't help it.",
  "cast/guidance": "Touch an ally and name a skill: they add 1d4 to checks with that skill while the spell lasts. Concentration, up to 1 minute.",
  "cast/spare_the_dying": "A creature at 0 Hit Points within 15 feet becomes Stable: no more death saving throws.",
  "cast/bless": "Up to three creatures add 1d4 to their attack rolls and saving throws. Concentration, up to 1 minute.",
  "cast/cure_wounds": "Touch a creature: it regains Hit Points.",
  "cast/healing_word": "A creature you can see within 60 feet regains Hit Points. Quick: a Bonus Action, so you still have your action.",
  "cast/guiding_bolt": "A spell attack with radiant light. A hit deals radiant damage, and the next attack roll against the target before your next turn ends has Advantage.",
  "cast/shield_of_faith": "A creature you choose gains +2 AC. Concentration, up to 10 minutes.",

  // Wizard (Ilsa).
  "cast/fire_bolt": "A spell attack with a mote of fire. A hit deals fire damage, and an unattended flammable object it hits catches fire.",
  "cast/ray_of_frost": "A spell attack with a frigid beam. A hit deals cold damage and slows the target by 10 feet until your next turn starts.",
  "cast/acid_splash": "A bubble of acid bursts at a point you can see: each creature within 5 feet of it makes a Dexterity saving throw or takes acid damage.",
  "cast/magic_missile": "Three glowing darts that never miss, each dealing force damage. Split them between creatures you can see as you like.",
  "cast/burning_hands": "A 15-foot cone of fire from your hands: each creature in it makes a Dexterity saving throw, full fire damage on a failure, half on a success.",
  "cast/thunderwave": "A 15-foot cube of thunder from you: each creature in it makes a Constitution saving throw, taking thunder damage and pushed 10 feet on a failure, half damage on a success.",
  "cast/ice_knife": "A spell attack with a shard of ice: a hit deals piercing damage. Hit or miss, it bursts, and creatures within 5 feet of the target make a Dexterity saving throw or take cold damage.",
  "cast/shield": "An attack would hit you: gain +5 AC until the start of your next turn, against that attack too.",
  "cast/fireball": "A burst of fire with a 20-foot radius at a point you choose: each creature in it makes a Dexterity saving throw, full fire damage on a failure, half on a success.",
};

/** Ids that share one entry by their stem: every weapon attack, every breath weapon, the reckless attack's variants. */
const STEMS = ["melee_attack", "ranged_attack", "opportunity_attack", "dragonborn/breath_weapon", "barbarian/reckless_attack"];

/** The card's text for an option, or none when we have no entry: the card then stays away. */
export function guideFor(optionId: string): Guide | undefined {
  const id = optionId.replace(/\/\d+$/, "");
  const text = GUIDE[id] ?? GUIDE[STEMS.find((stem) => id === stem || id.startsWith(`${stem}/`) || id.startsWith(`${stem}_`)) ?? ""];
  return text ? { text } : undefined;
}

/** What an option costs, in the turn budget's words: "Action", "Bonus Action · level 1 slot". */
export function costText(cost: ActionCost | undefined): string | undefined {
  if (!cost) return undefined;
  const parts = [
    ...(cost.action > 0 ? ["Action"] : []),
    ...(cost.bonus_action > 0 ? ["Bonus Action"] : []),
    ...(cost.reaction > 0 ? ["Reaction"] : []),
    ...(cost.spell_slot ? [`level ${cost.spell_slot} slot`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Every id with its own entry, for tests. */
export const GUIDE_IDS = Object.keys(GUIDE);
