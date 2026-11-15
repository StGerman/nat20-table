---
type: Task
id: UPS-25
title: "parry3d 0.27→0.31"
pri: P2
dest: Fork
size: S
state: todo
area: "11. Repo split and contract pipeline (system design, 2026-10-16)"
---

parry3d 0.27→0.31: 0.28 moves to glamx 0.3 on glam 0.33, while rerecast 0.4 and polyanya 0.17.1 are on glam 0.32; a mixed graph builds two glams and needs conversions at every navmesh boundary. Held until rerecast and polyanya release on glam 0.33 (check at each UPS-24 follow-up; Rule 9 30-day clock does not run while held) . Dependabot holds parry3d >= 0.28 and glam >= 0.33 out (core #32, narrowed by UPS-24), so no red lone bumps appear meanwhile. **This row's PR removes those last geometry ignore entries** from the fork's `.github/dependabot.yml`

## Status

(held: upstream glam)
