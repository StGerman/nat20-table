//! The one calendar: the day and the minute of the day. The watch is derived.
//!
//! The clock does not count combat: inside a fight core keeps time by turns. When the
//! clock moves (travel, a night), the server moves core's time too.

use serde::{Deserialize, Serialize};

/// Minutes in a day.
pub const MINUTES_PER_DAY: u32 = 24 * 60;

/// The world's time: a day number from 1 and the minute of that day.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Clock {
    /// The day, from 1
    pub day: u32,
    /// Minutes since midnight, 0 to 1439
    pub minute: u32,
}

/// A part of the day, four hours long; the night is two of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Watch {
    /// Midnight to 4:00
    SmallHours,
    /// 4:00 to 8:00
    Dawn,
    /// 8:00 to noon
    Morning,
    /// Noon to 16:00
    Afternoon,
    /// 16:00 to 20:00
    Evening,
    /// 20:00 to midnight
    Night,
}

impl Clock {
    /// A clock at `hour:minute` on `day`. Panics on a day 0 or a time past 23:59.
    pub fn at(day: u32, hour: u32, minute: u32) -> Self {
        assert!(day >= 1, "days count from 1");
        assert!(
            hour < 24 && minute < 60,
            "not a time of day: {hour}:{minute}"
        );
        Self {
            day,
            minute: hour * 60 + minute,
        }
    }

    /// Moves the clock on by `minutes`, across midnight when needed.
    pub fn advance(&mut self, minutes: u32) {
        let total = self.minute + minutes;
        self.day += total / MINUTES_PER_DAY;
        self.minute = total % MINUTES_PER_DAY;
    }

    /// Moves the clock to the next `hour:00`, today if it is still ahead, else
    /// tomorrow; returns how many minutes passed.
    pub fn advance_to_hour(&mut self, hour: u32) -> u32 {
        assert!(hour < 24, "not an hour: {hour}");
        let target = hour * 60;
        let minutes = if target > self.minute {
            target - self.minute
        } else {
            MINUTES_PER_DAY - self.minute + target
        };
        self.advance(minutes);
        minutes
    }

    /// The hour of the day, 0 to 23.
    pub fn hour(&self) -> u32 {
        self.minute / 60
    }

    /// The part of the day.
    pub fn watch(&self) -> Watch {
        match self.hour() {
            0..=3 => Watch::SmallHours,
            4..=7 => Watch::Dawn,
            8..=11 => Watch::Morning,
            12..=15 => Watch::Afternoon,
            16..=19 => Watch::Evening,
            _ => Watch::Night,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advancing_crosses_midnight() {
        let mut clock = Clock::at(1, 22, 30);
        clock.advance(120);
        assert_eq!(clock, Clock::at(2, 0, 30));
        clock.advance(3 * MINUTES_PER_DAY);
        assert_eq!(clock, Clock::at(5, 0, 30));
    }

    #[test]
    fn advance_to_hour_waits_for_tomorrow_when_the_hour_has_passed() {
        let mut clock = Clock::at(1, 20, 0);
        assert_eq!(clock.advance_to_hour(6), 10 * 60);
        assert_eq!(clock, Clock::at(2, 6, 0));
        assert_eq!(clock.advance_to_hour(8), 120);
        assert_eq!(clock.advance_to_hour(8), MINUTES_PER_DAY);
    }

    #[test]
    fn the_watch_follows_the_hour() {
        assert_eq!(Clock::at(1, 0, 0).watch(), Watch::SmallHours);
        assert_eq!(Clock::at(1, 7, 59).watch(), Watch::Dawn);
        assert_eq!(Clock::at(1, 8, 0).watch(), Watch::Morning);
        assert_eq!(Clock::at(1, 12, 0).watch(), Watch::Afternoon);
        assert_eq!(Clock::at(1, 19, 59).watch(), Watch::Evening);
        assert_eq!(Clock::at(1, 23, 0).watch(), Watch::Night);
    }

    #[test]
    fn the_clock_reads_and_writes_as_json() {
        let clock = Clock::at(3, 9, 15);
        let json = serde_json::to_string(&clock).unwrap();
        assert_eq!(json, r#"{"day":3,"minute":555}"#);
        assert_eq!(serde_json::from_str::<Clock>(&json).unwrap(), clock);
    }
}
