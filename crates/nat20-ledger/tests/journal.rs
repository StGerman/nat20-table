use std::collections::BTreeMap;

use nat20_ledger::{Asset, Entry, Holder, Holdings, Journal, PostError, Reason};

fn holder(s: &str) -> Holder {
    s.parse().unwrap()
}

fn coin(copper: u32) -> Asset {
    Asset::Coin { copper }
}

fn entry(from: &str, to: &str, what: Asset, reason: Reason) -> Entry {
    Entry {
        from: holder(from),
        to: holder(to),
        what,
        reason,
        roll: None,
    }
}

fn purse(copper: i64) -> Holdings {
    Holdings {
        copper,
        items: BTreeMap::new(),
    }
}

#[test]
fn holders_read_and_write_as_strings() {
    for s in [
        "world",
        "wagon:1",
        "market:wendmouth",
        "npc:merchant",
        "bren",
    ] {
        assert_eq!(holder(s).to_string(), s);
    }
    assert_eq!(holder("npc:merchant"), Holder::Npc("merchant".into()));
    for bad in ["", "wagon:0", "wagon:x", "npc:", "market:", "guild:x"] {
        assert!(bad.parse::<Holder>().is_err(), "{bad:?} parsed");
    }
}

#[test]
fn an_entry_reads_and_writes_as_json() {
    let mut theft = entry("maren", "bren", coin(150), Reason::Theft);
    theft.roll = Some("r12".into());
    let json = serde_json::to_string(&theft).unwrap();
    assert_eq!(
        json,
        r#"{"from":"maren","to":"bren","what":{"kind":"coin","copper":150},"reason":"theft","roll":"r12"}"#
    );
    assert_eq!(serde_json::from_str::<Entry>(&json).unwrap(), theft);
}

#[test]
fn wages_move_from_the_merchant_to_each_blade() {
    let opening = BTreeMap::from([(holder("npc:merchant"), purse(2000))]);
    let mut journal = Journal::new(opening);
    for blade in ["bren", "maren"] {
        journal
            .post(entry("npc:merchant", blade, coin(200), Reason::Wage))
            .unwrap();
    }
    let balances = journal.balances();
    assert_eq!(balances[&holder("npc:merchant")], purse(1600));
    assert_eq!(balances[&holder("bren")], purse(200));
    assert_eq!(balances[&holder("maren")], purse(200));
}

#[test]
fn loot_and_tolls_go_through_the_world_account() {
    let mut journal = Journal::default();
    let potion = Asset::Item {
        item: "nat20_core::item.potion_of_healing".into(),
        quantity: 1,
    };
    journal
        .post(entry("world", "bren", potion, Reason::Loot))
        .unwrap();
    journal
        .post(entry("world", "bren", coin(500), Reason::Reward))
        .unwrap();
    journal
        .post(entry("bren", "world", coin(20), Reason::Toll))
        .unwrap();
    let balances = journal.balances();
    assert_eq!(balances[&holder("bren")].copper, 480);
    assert_eq!(
        balances[&holder("bren")].items["nat20_core::item.potion_of_healing"],
        1
    );
    assert_eq!(balances[&Holder::World].copper, -480);
}

#[test]
fn the_journal_refuses_empty_circular_and_uncited_entries() {
    let mut journal = Journal::default();
    assert_eq!(
        journal.post(entry("bren", "bren", coin(1), Reason::Trade)),
        Err(PostError::SameHolder)
    );
    assert_eq!(
        journal.post(entry("bren", "maren", coin(0), Reason::Trade)),
        Err(PostError::Nothing)
    );
    assert_eq!(
        journal.post(entry("maren", "bren", coin(10), Reason::Theft)),
        Err(PostError::TheftWithoutRoll)
    );
    let mut bad_roll = entry("maren", "bren", coin(10), Reason::Theft);
    bad_roll.roll = Some("12".into());
    assert_eq!(
        journal.post(bad_roll),
        Err(PostError::BadRollId("12".into()))
    );
    assert!(journal.entries().is_empty());
}

#[test]
fn the_trial_balance_names_every_holder_the_owner_disagrees_with() {
    let opening = BTreeMap::from([(holder("bren"), purse(300))]);
    let mut journal = Journal::new(opening);
    journal
        .post(entry("bren", "maren", coin(250), Reason::Trade))
        .unwrap();

    let clean = BTreeMap::from([
        (holder("bren"), purse(50)),
        (holder("maren"), purse(250)),
        (Holder::World, purse(999)),
    ]);
    assert!(journal.check_against(&clean).is_empty());

    let off = BTreeMap::from([(holder("bren"), purse(50)), (holder("maren"), purse(240))]);
    let mismatches = journal.check_against(&off);
    assert_eq!(mismatches.len(), 1);
    assert_eq!(mismatches[0].holder, holder("maren"));
    assert_eq!(mismatches[0].journal, purse(250));
    assert_eq!(mismatches[0].reported, purse(240));
}

#[test]
fn the_trial_balance_catches_a_holder_nobody_reported() {
    let mut journal = Journal::default();
    journal
        .post(entry("world", "maren", coin(100), Reason::Loot))
        .unwrap();
    let only_bren = BTreeMap::from([(holder("bren"), purse(0))]);
    let mismatches = journal.check_against(&only_bren);
    assert_eq!(mismatches.len(), 1);
    assert_eq!(mismatches[0].holder, holder("maren"));
    assert_eq!(mismatches[0].reported, Holdings::default());
}

#[test]
fn a_stored_journal_replays_its_entries_through_the_rules() {
    let mut journal = Journal::default();
    journal
        .post(entry("world", "bren", coin(100), Reason::Reward))
        .unwrap();
    let json = serde_json::to_string(&journal).unwrap();
    assert_eq!(serde_json::from_str::<Journal>(&json).unwrap(), journal);

    let circular = r#"{"opening":{},"entries":[{"from":"bren","to":"bren","what":{"kind":"coin","copper":5},"reason":"trade"}]}"#;
    assert!(serde_json::from_str::<Journal>(circular).is_err());
    let uncited = r#"{"opening":{},"entries":[{"from":"maren","to":"bren","what":{"kind":"coin","copper":5},"reason":"theft"}]}"#;
    assert!(serde_json::from_str::<Journal>(uncited).is_err());
}
