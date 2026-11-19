---
type: Task
id: CON-19
title: "Play without Rust: engine binaries in a GitHub Release"
pri: P1
dest: Ours
size: S
state: todo
area: "11. Repo split and contract pipeline (system design, 2026-10-16)"
---

An engineer who clones the public repo cannot play without the pinned Rust toolchain: the preflight requires `cargo`, the engine is built from source, and the end of every run calls `cargo run` for `nat20-audit` (`game/src/play/run.ts`) and `nat20-digest` (`game/src/check/digest.ts`). A built binary also reads core's registries and our content from the checkout it was built in (`CARGO_MANIFEST_DIR`), unless the `NAT20_*_DIR` and `NAT20_REGISTRY_ROOT` variables say otherwise. Done means: a `release` workflow on a macOS arm64 runner builds `nat20-api-server`, `nat20-audit` and `nat20-digest` and publishes them with core's `assets/` at the pinned rev as a GitHub Release asset; `npm run engine:fetch` downloads the asset into the checkout; the game prefers a cargo build when one exists and otherwise runs the fetched binaries with the variables set, for the engine and both checks; the preflight passes with no Rust when the fetched engine is there; the README says how to play in a few lines (Node 22, Claude Code signed in to your own plan, clone, `npm ci`, `npm run engine:fetch`, one play command). No contract change.

## Status

todo. T0 of the build options (Stas, 2026-11-19 21:39Z): for engineers at the talk; a DMG comes later.
