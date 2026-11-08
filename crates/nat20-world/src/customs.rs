//! Customs (ENG-39, storytelling bible "Ethics"): the short lines a people lives by.
//!
//! A world's `customs.json` lists them by id, each with the people that holds it. A card
//! choice names the customs it keeps or breaks (`keeps`, `breaks` on [`crate::Choice`]), so
//! the DM knows what a deed touched and narrates who reacts, never a verdict. Who saw or heard
//! it, and how their attitude moves, is the ethics build's, after Milestone 11.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

/// A world's `customs.json`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CustomsFile {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The customs, in file order
    pub customs: Vec<Custom>,
}

/// One custom.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Custom {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case, as a choice's `keeps` and `breaks` name it
    pub id: String,
    /// The people or region that holds it, in snake_case (`valley_folk`)
    pub people: String,
    /// The line itself, as the people says it: "Bread is shared."
    pub text: String,
}

/// Why a customs file is unusable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomsError(pub String);

impl std::fmt::Display for CustomsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CustomsError {}

impl CustomsFile {
    /// Checks the file: ids and peoples in snake_case, each id once, no empty line.
    pub fn validate(&self) -> Result<(), CustomsError> {
        let snake = |s: &str| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
        };
        let mut ids = BTreeSet::new();
        for custom in &self.customs {
            if !snake(&custom.id) {
                return Err(CustomsError(format!(
                    "custom id {:?} is not snake_case",
                    custom.id
                )));
            }
            if !snake(&custom.people) {
                return Err(CustomsError(format!(
                    "custom {}'s people {:?} is not snake_case",
                    custom.id, custom.people
                )));
            }
            if custom.text.trim().is_empty() {
                return Err(CustomsError(format!("custom {} has no text", custom.id)));
            }
            if !ids.insert(custom.id.as_str()) {
                return Err(CustomsError(format!("two customs with id {}", custom.id)));
            }
        }
        Ok(())
    }

    /// The custom with this id.
    pub fn get(&self, id: &str) -> Option<&Custom> {
        self.customs.iter().find(|c| c.id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn custom(id: &str) -> Custom {
        Custom {
            comment: None,
            id: id.to_owned(),
            people: "valley_folk".to_owned(),
            text: "Bread is shared.".to_owned(),
        }
    }

    #[test]
    fn a_customs_file_names_each_custom_once_in_snake_case_with_its_line() {
        let file = CustomsFile {
            comment: None,
            customs: vec![custom("bread_shared"), custom("debt_paid")],
        };
        file.validate().unwrap();
        assert_eq!(file.get("debt_paid").unwrap().people, "valley_folk");
        let twice = CustomsFile {
            comment: None,
            customs: vec![custom("bread_shared"), custom("bread_shared")],
        };
        assert!(twice.validate().unwrap_err().0.contains("two customs"));
        let caps = CustomsFile {
            comment: None,
            customs: vec![custom("Bread")],
        };
        assert!(caps.validate().unwrap_err().0.contains("snake_case"));
        let empty = CustomsFile {
            comment: None,
            customs: vec![Custom {
                text: " ".to_owned(),
                ..custom("bread_shared")
            }],
        };
        assert!(empty.validate().unwrap_err().0.contains("no text"));
    }
}
