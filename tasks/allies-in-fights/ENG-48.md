---
type: Task
id: ENG-48
title: "Gwyn's dog and the horses in a card's fight"
pri: P2
dest: Ours
size: M
state: todo
area: "2. Engine correctness (core)"
---

Gwyn's dog and the horses in a card's fight (option B, backlog; Stas 2026-11-12 19:30Z «B + C в backlog», 19:33Z «Только А остальное в backlog»): they join the fight on the party side under a scripted policy that keeps them by the wagon (today every card creature is hostile, and `scripted_action` in `adapter/game.rs` closes to melee); wolves may go for them; the dog may die from one bite with no stake shown on `stray_dog` (Stas, «допустимо»); a dead horse leaves its wagon's `team` (`crates/nat20-world/src/caravan.rs`); a dead dog is remembered and every card reading `fed_gwyns_dog` reads it too (`gwyn_news`, `gwyn_cheese`, `night_wolves`, `drovers`, MAP-22's twin), with Zoya's board check and a Vera read; allies neither hold a fight open nor take XP (a lifecycle change goes through Rule 1 if it touches the wire). Three more places in initiative (dog and two horses), no extra model call. Check: card-fight seeds without models, deaths counted. Cost B (MON-12 + ENG-48): 3 PRs (core, pin, table); in-game $0, 0 extra model calls per fight, 3 more scripted turns per round; Stas 3 reviews, about 45 min (estimate)

## Status

(Allies in fights milestone, after the Dramaturg mechanism (Stas 2026-11-12 21:22Z; scope table #365); needs MON-12)
