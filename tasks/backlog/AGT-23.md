---
type: Task
id: AGT-23
title: "The DM agent runs monster turns instead of the scripted policy"
pri: P2
dest: Ours
size: M
state: todo
area: "8. Agents, game loop, interface (all new)"
gate_was: N
---

After the demo: the DM agent runs monster turns instead of the scripted policy (Stas, 2026-10-23, M6 spec review). Scene creatures the DM runs get `control: client`; the DM's decision tools (`legal_actions`, `submit`, `move`, `end_turn`) extend from the human's character to those monsters, never to an AI player's character (decision 0030 binding). The engine still rolls and resolves (Rule 4). Measure the extra DM calls against the 6 s narration target and cost; MON-10 says whether smarter monsters are needed. Revisits decisions 0015 and 0030

## Status

after Milestone 7
