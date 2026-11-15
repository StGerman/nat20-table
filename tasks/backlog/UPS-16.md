---
type: Task
id: UPS-16
title: "Breaking-version backlog in core, one core/deps-<crate> PR each, table pin after each"
pri: P2
dest: Fork
size: L
state: partial
area: "11. Repo split and contract pipeline (system design, 2026-10-16)"
---

Breaking-version backlog in core, one `core/deps-<crate>` PR each, table pin after each (decision 0024; audit 2026-10-18). Re-checked 2026-10-19 against each crate's git tags and changelog (crates.io unreachable from that session) and split into UPS-17 to UPS-25, cheapest first. Dependabot does propose 0.x minors, each as its own PR (the patch-only group excludes them, it does not ignore them), so most rows arrive as a red Dependabot PR carrying the lockfile; the `core/deps-<crate>` PR adds the code. hecs, uom and the geometry stack also need the table adapter changed in the pin PR until UPS-15 lands, so do UPS-15 first. Nothing else in table is behind a breaking version (schemars, serde, serde_json are 1.x; npm majors arrive singly) . 2026-10-20 first Dependabot run on the fork: core #25 rand, #26 parry3d, #27 polyanya, #28 uom, plus #24 patch group; that is the cargo `open-pull-requests-limit: 5`, so strum 0.28 (2026-02-22), hecs 0.11.2 and mlua 0.12.2 (2026-10-03) are past their cooldown and wait for a free slot; rstest 0.28 (2026-10-18) is in cooldown until 2026-10-25

## Status

split 2026-10-19 into UPS-17 to UPS-25; left: UPS-24 and UPS-25 (held on upstream glam)
