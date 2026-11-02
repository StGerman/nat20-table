//! Dice from outside: the world has no random number generator of its own.

use std::collections::VecDeque;

/// Where the world gets a roll. The server implements it with the session's dice and
/// logs every roll as a `roll` event with an `rN` id (roller `world`); tests pass
/// [`ListDice`].
pub trait WorldDice {
    /// Rolls one die with `sides` sides and returns a number from 1 to `sides`.
    /// `why` names the roll for the log ("road card", "price drift").
    fn roll(&mut self, sides: u32, why: &str) -> u32;
}

/// Dice that answer from a fixed list, for tests. Panics when the list runs out or a
/// number does not fit the die, so a test never passes on a roll it did not plan.
#[derive(Debug, Clone, Default)]
pub struct ListDice {
    rolls: VecDeque<u32>,
    asked: Vec<(u32, String)>,
}

impl ListDice {
    /// Dice that answer with `rolls`, in order.
    pub fn new(rolls: impl IntoIterator<Item = u32>) -> Self {
        Self {
            rolls: rolls.into_iter().collect(),
            asked: Vec::new(),
        }
    }

    /// Every roll asked so far: the die and why.
    pub fn asked(&self) -> &[(u32, String)] {
        &self.asked
    }
}

impl WorldDice for ListDice {
    fn roll(&mut self, sides: u32, why: &str) -> u32 {
        let value = self
            .rolls
            .pop_front()
            .unwrap_or_else(|| panic!("ListDice ran out on a d{sides} ({why})"));
        assert!(
            (1..=sides).contains(&value),
            "ListDice: {value} does not fit a d{sides} ({why})"
        );
        self.asked.push((sides, why.to_string()));
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_dice_answer_in_order_and_remember_why() {
        let mut dice = ListDice::new([3, 20]);
        assert_eq!(dice.roll(6, "a"), 3);
        assert_eq!(dice.roll(20, "b"), 20);
        assert_eq!(dice.asked(), &[(6, "a".to_string()), (20, "b".to_string())]);
    }

    #[test]
    #[should_panic(expected = "does not fit")]
    fn list_dice_refuse_a_number_off_the_die() {
        ListDice::new([7]).roll(6, "too big");
    }
}
