---
type: Task
id: ENG-47
title: "A card's fight can start with its monsters surprised"
pri: P2
dest: Ours
size: S
state: todo
area: "2. Engine correctness (core)"
---

A card's fight can start with its monsters surprised (allies in fights, option A; Stas 2026-11-12 19:30Z «Делаем А после M12»): optional `surprise: true` on the deck `fight` effect; the adapter starts that fight with the hostile side surprised (SRD 5.2.1: Disadvantage on Initiative), with no scene flag; the wire `start_fight` command is unchanged and the PR names the internal path and says why the contract is unchanged (Rule 1, Rule 5: only `adapter/` touches core); tests in the world crate and the server. Cost: 1 table PR; in-game $0 (no model call added, turns +0; tests, no run); Stas 1 review, about 15 min (estimate)

## Status

(right after the M12 exit pair, its own PR; Stas 2026-11-12 21:22Z, scope table #365 §9)
