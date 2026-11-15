---
type: Task
id: UPS-24
title: "Geometry stack in one PR, because these crates exchange glam types"
pri: P2
dest: Fork
size: L
state: todo
area: "11. Repo split and contract pipeline (system design, 2026-10-16)"
---

Geometry stack in one PR, because these crates exchange glam types: parry3d 0.24→0.27, rerecast 0.2→0.4, polyanya =0.16.0→0.17.1, glam 0.30→0.32. parry3d 0.26 moved from nalgebra to glam (`Isometry`→`Pose`, nalgebra vectors and points → `glam::Vec3`), about 136 nalgebra-type references in core; table's adapter (17 references to hecs, parry3d, uom, rerecast) changes in the pin PR unless UPS-15 has landed. Drops nalgebra, simba and `paste`, so the RUSTSEC-2024-0436 ignore leaves both `deny.toml` files. Stops at parry3d 0.27, the last release on glam 0.32 . core #27 (Dependabot polyanya 0.17.1 alone, 2026-10-20) fails with mixed glam (geometry.rs:892 passes glam 0.30 `Vec2` where polyanya wants 0.32), confirming the four crates must move together; core #26 (parry3d 0.31.1 alone) fails with 16 errors before type checking finishes (`parry3d::na` gone in 10 files, `math::Isometry` gone, `intersection_test` returns `ShapeIntersection`, `distance` returns `ShapeDistance`) . Stas 2026-10-20: core #26 and #27 closed (neither can pass alone: polyanya 0.17 needs glam 0.32 with rerecast 0.4, parry3d 0.31 is on glam 0.33). Core #32 holds the four crates out of Dependabot in the fork's `.github/dependabot.yml`: parry3d >= 0.25, rerecast >= 0.3, polyanya >= 0.17 (widened to >= 0.16.1 after core #33: polyanya 0.16.1 moves onto rerecast 0.3.2 and breaks `RecastFullMesh::new` with two rerecasts), glam >= 0.31 (`@dependabot` commands from sessions never reach Dependabot, so these are yml entries). **This row's PR also edits that file**: narrow parry3d to >= 0.28 and glam to >= 0.33, drop rerecast and polyanya. Not done until that edit merges

## Status

(held, Rule 9: no milestone needs it, and it is L in core plus the adapter's pin churn; the 30 days from core #26 and #27, 2026-10-20, end 2026-11-19; revisit at the Milestone 12 close sweep; sweep 2026-11-11, question 2)
