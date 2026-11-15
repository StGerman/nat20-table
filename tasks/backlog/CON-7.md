---
type: Task
id: CON-7
title: "The one-fixture command in CLAUDE.md"
pri: P2
dest: Ours
size: XS
state: todo
area: "11. Repo split and contract pipeline (system design, 2026-10-16)"
gate_was: N
---

The one-fixture command in CLAUDE.md (`cargo test --test conformance -- <name>`) runs nothing: libtest treats `<name>` as a test-name filter, which matches no test. Pass the fixture name another way (env var) or make one test per fixture

## Status

fix with an env var (Stas 2026-11-08)
