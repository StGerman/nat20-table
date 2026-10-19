//! `contract/protocol.md` keeps every section the rules point to. Table #45 rewrote the file to
//! add §2.2 and dropped §3 to §9 without any check failing; table #52 restored them. This test
//! fails if a later edit loses a numbered section again. A new section is added to the list in
//! the same PR that writes it.

use std::{fs, path::PathBuf};

const SECTIONS: &[&str] = &[
    "## 1. Transport and envelope",
    "## 2. Session, scene and combat lifecycle",
    "### 2.1 Scene files",
    "### 2.2 Pregen files",
    "## 3. Prompts (`awaiting`)",
    "## 4. Commands",
    "### 4.1 Moving",
    "### 4.2 Sheets",
    "### 4.3 Checks, hazards and flags",
    "### 4.4 Encounters and ending a fight",
    "### 4.5 Short rest",
    "### 4.6 Spawns",
    "### 4.7 Help",
    "## 5. Visibility (projection per `viewer`)",
    "## 6. Events",
    "## 7. Errors",
    "## 8. Versioning",
    "## 9. Migration from v0 (milestone 1)",
];

#[test]
fn protocol_keeps_its_sections_in_order() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../contract/protocol.md");
    let text = fs::read_to_string(&path).expect("contract/protocol.md reads");
    let headings: Vec<&str> = text.lines().filter(|l| l.starts_with('#')).collect();
    let mut last = 0;
    for section in SECTIONS {
        let at = headings
            .iter()
            .position(|h| h == section)
            .unwrap_or_else(|| panic!("protocol.md lost the section {section:?}"));
        assert!(at >= last, "protocol.md has {section:?} out of order");
        last = at;
    }
}
