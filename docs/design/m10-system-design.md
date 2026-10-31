# Milestone 10: system design

2026-10-30 · commentable copy: Claude Doc https://claude.ai/artifact/EBvCr6Zehw2QgF22o1bVDs.

- **Status:** accepted: implementation started on Stas's /goal, 2026-10-31. Companion to the M10 scope (`m10-spec.md` beside this file, approved 2026-10-30): the scope says what; this note says how each piece is built in today's code and how they fit.
- **Baseline:** table main fda2454, core pin e8c8d90. Everything below is game-side TypeScript except §3.10 (two core PRs). The engine wire contract is not touched.
- **Rows:** §6 maps each piece to its TASKS.md row (Milestone 10).

## 1. Requirements

### 1.1 Functional

| # | The system must | Scope item |
| --- | --- | --- |
| F1 | Record, per model wake, where the time went: first token, each tool round trip, the closing call; report p95 per phase | S1 |
| F2 | End a narration-only DM wake the moment `narrate` lands, and never count its closing call as a timeout | S2 |
| F3 | Let an AI player take its option, say its line and end its turn in one tool call | S3 |
| F4 | Show the human the DM's narration as it is written, without changing what the transcript, audit or players receive | S4 |
| F5 | Tell the DM, as a fact in every narrate briefing, who moved and who stands within reach of whom | P2, P3 |
| F6 | Let Stas add a narration flag the judge missed, and have the verdict count it | P2 |
| F7 | Open each scene once | P1 |
| F8 | Show tokens and cost so far on `/usage` and at the run's end | U1 |
| F9 | Keep every colour and state word of the Ink seat in one token file | U2 |
| F10 | Lay the panel and the text column out by terminal width; a right-hand pane from 124 columns | P5 |
| F11 | Edit the input line with a cursor and word moves; show the hint and the spinner in the row | P6 |
| F12 | Match natural Russian spellings of party and NPC names | P4 |
| F13 | Offer Dodge, and let a second Dash add movement | P8 |

### 1.2 Non-functional

| # | Quality | Target | Measured by |
| --- | --- | --- | --- |
| N1 | AI player combat turn p95 | 10 s or less | the run report, from `usage.jsonl` |
| N2 | DM narration p95 | 6 s or less | same |
| N3 | Cost per unattended run | at most today's $11.50 API-equivalent | same |
| N4 | Audit, leak scan and narration judge | unchanged results on the exit run | `runs:finish` |
| N5 | Every change replayable | game fixtures re-recorded once per behaviour change, byte-stable after | `npm run check:ts` |

### 1.3 Constraints

- The engine rolls everything (Rule 4). No lever below touches the engine or its contract.
- Visibility stays structural (Rule 3): a streamed line reaches only the seat the finished line would.
- Russian is the table language; prompt changes are checked on a `--lang ru` run.
- Core changes go through the fork on `demo` and a pin PR (Rules 5, 6).

### 1.4 Assumptions (standing in for the open answers)

| # | Assumed | If Stas overturns it |
| --- | --- | --- |
| A1 | "UI token" means both the cost readout (U1) and the theme tokens (U2) | drop the other one; nothing else depends on them |
| A2 | N1 and N2 gate this milestone (CLAUDE.md: the optimisation milestone gates criterion 4) | S5 and S6 leave the plan; the exit run only reports |
| A3 | Terminal width per «Раскладка терминала» option B: text column 72 characters or less, right pane from 124 columns | §3.8 takes his measure instead; the layout code is parametric |

## 2. High-level design

### 2.1 Components touched

| Component | File(s) today | What changes |
| --- | --- | --- |
| Agent session | `game/src/agents/sdk-session.ts` | per-call timing (S1); early settle on a named tool (S2); partial-message stream to a listener (S4) |
| DM agent | `game/src/agents/dm.ts` | which wakes end on `narrate`; prompt lines for scene transitions and the briefing facts |
| Player agent | `game/src/agents/player.ts` | `submit_decision` gains `say` and `end_turn`; prompt says one call is the norm |
| Table loop | `game/src/table/loop.ts` | `movedLine` and `adjacencyLine` in narrate briefings; scene-open guard; `/usage` command |
| Table state | `game/src/table/state.ts` | `narrate` refused after `load_scene` in the same wake; streamed preview to the seat |
| Usage | `game/src/usage.ts`, `game/src/play/run.ts` | `calls[]` per record; phase percentiles in the report |
| Verdict | `game/src/play/verdict.ts` | hand-ruled flags from `confirmations.json` |
| Ink seat | `game/src/ui/*` | `theme.json` read by `palette.ts`; width-aware layout; line editor; preview line |
| Pack | `scenarios/the_silent_mill/adventure.json` | Russian name variants and canonical forms |
| Core (fork `demo`) | `assets/registries/actions`, `effects` | `dodge` action and effect; Dash as additive movement |

Nothing in `crates/` changes except the core pin.

### 2.2 One DM narration, before and after

**Today.** The loop calls `wakeDm("narrate", part)`; `AgentSession.turn` sends the briefing and resolves only on the SDK's `result`. The model's first call emits the `narrate` tool use (about 3 s to first token), the tool runs the guard and shows the line, then the model makes a closing call with no tool (another 3 s or so) before the `result` arrives. At 12 s the timer interrupts; the narration is already on screen, but the wake is logged as a timeout and a fallback.

**After S2.** `turn()` takes `settleOn: ["narrate"]` for the `narrate` and `combat_over` wakes. When the `narrate` tool handler returns `ok`, the session resolves the turn at once, keeps the pending record open as `draining`, and ignores further tool calls from that turn (the existing "not now" guard). The `result` still arrives and completes the usage record with the full token count, so cost is not under-counted. The loop moves on about 3 s earlier per narration and the timeout class disappears.

**After S4.** With `includePartialMessages`, the session also forwards `input_json_delta` fragments of the `narrate` call's `text` argument to a listener. The loop shows them to the human seat as a preview line, replaced by the guarded final line when the tool runs. If the guard refuses the line, the preview is cleared. Time to first visible word drops from about 6 s to under 2 s.

### 2.3 One AI player combat turn, before and after

**Today.** Briefing with options, then the model calls `submit_decision`, waits for the engine's answer, calls `say` if it has a line, calls `end_turn`, and finishes with a closing call: three to four model round trips, 20 s timeout.

**After S3.** The same tool takes `say?` and `end_turn?: true`. The handler submits, then speaks the line through the same path `say` uses, then ends the turn, and the tool answer carries all three outcomes. A refused submit ends the call there: nothing is said, the turn stays open, and the model retries with the refusal text (criterion 5 unchanged). A player that wants to move first still calls `move` then `submit_decision`. Typical turn: one round trip plus a closing call, which S2's `settleOn: ["end_turn"]` then drops too.

### 2.4 Contracts touched

- Engine wire: none.
- Seat tools (model-facing): `submit_decision` adds two optional fields; nothing removed.
- Run folder: `usage.jsonl` records gain `calls[]`; `confirmations.json` gains an optional `added[]` list; both additive, old runs still verdict.
- One new ADR: a wake ends at its settling tool, not at the SDK result (0041's rule stands).

## 3. Deep dives

### 3.1 Per-phase timing (S1)

`UsageRecord` already has `wall_ms`, `ttft_ms` and `api_calls`; what it lacks is the shape of the wait. `AgentSession.handle` sees every `assistant` message (one API call each, keyed by `api.id`) and every tool call runs through `bound()`. The record gains `calls: Array<{ n, started_ms, first_token_ms?, ended_ms, tools: string[] }>` with offsets from `sentAt`, and `tool_ms`, the sum of time spent inside our tool handlers (engine round trips, guards). Call start is the first `assistant` message of a new `api.id`; its end is the next call's start or the `result`.

The report (`run.ts`) adds one table: per agent, p50 and p95 of first call to first token, of tool time, and of the closing call (last call with no tool use). It diagnoses where a wake's time goes; it is not the gate. The milestone's gate stays the end-to-end numbers the report already has: DM narration wake p95 and AI player combat turn p95. S2 is judged by the closing-call share of those. Tests: a scripted `query` that emits two assistant messages and a result in `sdk-session.test.ts`; a report fixture.

No contract, no prompt change. Lands first so S2 and S3 have before and after on the same build.

### 3.2 A DM wake ends when `narrate` lands (S2)

**Mechanism.** `SessionConfig.settleOn?: Record<purpose, string[]>` names, per wake purpose, the tools whose successful call ends the turn for the caller. In `AgentSession`, the tool wrapper (`seatTool` handler in the DM) reports a successful call to the session; if the turn's purpose lists that tool, the session resolves `turn()` with the text so far, moves the `PendingTurn` to `draining`, and lets the SDK finish. The draining turn's `result` closes the usage record (full tokens, `outcome: "ok"`, `settled_early: true`); a `result` that never comes before the next wake is closed as `outcome: "drained"`, never as a timeout. Tool calls from a draining turn hit the existing `current === undefined` guard in `ModelDm.bound` and get "not now".

**Which wakes.** `narrate` (after-turn narration) and `combat_over`. Not `scene_open`, `table_turn` or `summary`: those legitimately call tools after narrating (`load_scene`, `request_check`, `short_rest`). The DM prompt line "narrate once, last" already holds for the two chosen wakes.

**Interaction with the SDK.** The next wake's message is held outside `Inbox` until the draining turn's `result` has come (and, for a drain cut at its own limit or a timed-out turn, until that turn's result has come too); the loop does not wait for the drain, but the next wake of the same agent does. Measured cost of that: the closing call, about 3 s, now overlaps with the players' turns instead of blocking them. A drain that runs past its own limit is cut with `interrupt()`; a held wake that reaches its limit times out on its own and leaves the drain running.

**Correction after the first run (2026-10-31, run 12-05-14).** Claude Code does not simply queue a message that arrives mid-turn: at the turn's next tool result it folds that message into the running turn, and the folded message gets no `result` of its own. In that run, every drain with a second tool round trip swallowed the next narration wake, which then timed out at 12 s with no API call (22 of 80 narrations, the whole DM p95 miss). `AgentSession` now holds the next wake's message until the drain's `result` arrives, and the wake's clock runs during the hold. A held wake that reaches its own limit times out without cutting the drain.

**Risk.** A narration that the guard refuses does not settle the turn: the DM rewrites, and the normal timeout applies. A DM that narrates twice in one wake: the second call is "not now", and the first line stands. Tested with `ScriptedDm` in `loop.test.ts` (narrate then an extra tool call: the wake is over, the call is refused, the usage record shows both calls).

### 3.3 One-call player turn (S3)

`submit_decision` gains `say?: string`, `say_to?: handle` and `end_turn?: boolean`. The handler runs in order: submit; if `ok` and `say` is given, the same `table.say` path the `say` tool uses (guard, transcript, inboxes, hand rules unchanged); if `ok` and `end_turn`, `table.endTurn()`. The answer concatenates the three outcomes. A refused submit stops the chain and returns the refusal alone: the model keeps its turn and retries, so criterion 5 and the retry counter behave as now.

The player prompt's combat paragraph changes from "take one option with submit_decision, add a bonus action if one helps, then call end_turn" to "one call: option, a line if the character would speak, end_turn: true, unless you need a bonus action or a move after it". `legal_actions` stays for the rare re-check. With S2, `settleOn` for `combat_turn` is `["end_turn"]`, so the closing call stops blocking the loop as well.

Tests: `player.test.ts` scripted session calling the merged tool; `loop.test.ts` a turn with say + end in one call and a refused submit that leaves the turn open; game fixtures re-recorded once (`RECORD_FIXTURES=1 npm run check:ts`), as every prompt change already requires.

### 3.4 Streamed narration to the human seat (S4)

**Source.** The Agent SDK's `includePartialMessages: true` yields `stream_event` messages carrying the raw API stream; a tool call's arguments arrive as `input_json_delta` fragments. To be verified first in a 50-line spike on Stas's Mac (the SDK version is pinned at 0.3.301): that the fragments arrive for MCP tool calls and in order.

**Path.** `AgentSession` gets an optional `onPartial(toolName, partialJson)` listener. The DM agent subscribes for `narrate` only and parses the growing `text` string out of the partial JSON (a tolerant scan for the `"text":"` value, not a JSON parse). It passes complete sentences to `Seat.preview?(text)`: a new optional seat method, like `busy`, never recorded. `InkSeat` shows the preview dim under the spinner; when the guarded `narrate` lands, `state.narrate` calls `seat.show({kind: "narration"})` as today and the preview clears. Transcript, inboxes, audit, `to` routing and the fallback path see only the final line.

**Visibility.** `narrate`'s `to` becomes required and comes first in its schema: `"table"` for everyone, or one character's handle. The preview is shown only once `to` has streamed in full, as the first key, and is `"table"` or the human. A line whose text streams first shows nothing, since its `to` could still name another character; the schema order is a request to the model, not a guarantee. A refused line clears the preview. The guard runs on the final line only, so a number could show in a preview for a second: acceptable at the human's seat, which sees the DM's public lines anyway; players never get previews.

**Why not stream everything.** Player lines and engine lines are short; the DM narration is the only wait the human stares at. Streaming does not move the p95 numbers, which measure wake end; it moves the perceived wait, which is what Stas and a first-time player feel. Size M, after S2.

### 3.5 Facts in the narrate briefing, and flags Stas adds by hand (P2, P3)

The DM's prompt already forbids invented movement; run 18-45 showed a rule in the system prompt is not enough at low effort. The fix is the shelved `movedLine(part)` from `m7/patches/narrate-who-moved.patch`, applied as it is (one pure function in `loop.ts`, one `loop.test.ts` test), plus `adjacencyLine(state)`: from the DM state the loop already fetches, the pairs of creatures within 5 ft, as "Within reach of each other: bren and goblin_3; torva and wolf_2. Everyone else is apart." Both lines go at the end of every `narrate` and `combat_over` briefing. Fixtures re-record once.

The verdict today counts only judge flag ids, so a line Stas rules by hand cannot fail a run. `confirmations.json` gains `added: [{ id: "hN-k", line: N, claim, answer: "confirmed" }]`; `verdict.ts` merges them into row 3 as flags with `source: "hand"`. `runs:verdict` re-runs on the folder as today. Old files without `added` are unchanged. The judge's own recall (why it missed five lines whose rule it had) is a prompt question for the judge; not in this milestone beyond recording the gap per run.

### 3.6 Each scene opens once (P1)

Two DM wakes describe the same scene: the wake that calls `load_scene` (its prompt says "narrate the way there and call load_scene") and the `scene_open` wake the loop sends right after. Deterministic fix in `state.ts`: after `load_scene` succeeds in a wake, a further `narrate` in that same wake is refused with "the next scene is loaded; its opening comes with your next wake" (not counted as a retry). The prompt line becomes "narrate the way there, then call load_scene and stop". The `scene_open` briefing already carries the pass-over bridge; it adds the DM's last line before the load so the opening continues from it. Test: `ScriptedDm` that narrates after `load_scene` gets the refusal and the transcript shows one opening per scene.

### 3.7 Usage readout and theme tokens (U1, U2)

**U1.** `/usage` joins `command()` in `loop.ts` next to `/log`: it prints `summarize(usage.records)` per agent as tokens in, cache read, out, wakes, and the API-equivalent $ labelled "reference" while `init.apiKeySource === "none"` (subscription) and "billed" otherwise. The same block prints once at the run's end before the report path. The human seat alone sees it: usage is not game state, but it is not a player view either, so it never enters a player inbox. `/help` lists it.

**U2.** `palette.ts` hard-codes the Mill Table hex values and ANSI names. They move to `game/theme/mill-table.json`: `{ accents: { rust: { meaning, ansi, night, day } ... }, states: { bloodied: { accent, word_en, word_ru } ... } }`, loaded once at startup and validated by a small schema test. `palette.ts` and `lines.ts` read it. The same file is the hand-off to the SwiftUI design thread (the names are the design system's `*-text` tokens), so one change moves both. No visual change on its own.

### 3.8 The screen: width, panel, input line, glyphs (P5, P6, P7)

These follow the two design notes already reviewed (`m6/panels-ink-layout-proposal.md`, `m6/input-line-design.md`) with the width rule of A3:

- `panel.ts` stays a pure layout from `PanelSize` to rows; it gains a `textColumns = min(columns, 72)` rule for narration and option text and, from 124 columns, a two-column frame: text left, the situation pane right (roster, turn order, budget). `useWindowSize` drives it; below the fold (16 rows or 40 columns) the bar alone, as today.
- The input row becomes a pure reducer `(state, key) => state` over `{ text, cursor }` with word moves and Ctrl+W, Ctrl+U; the hint and the spinner render as the row's placeholder when `text` is empty. Tested without Ink, like `panel.ts`.
- Glyphs: an optional `icon` per creature kind in the pack's monster list and the pregens (one per kind), shown only on the bar's turn-order line, never in the roster; off under `NO_COLOR` or when the terminal reports no Unicode width support.

All three are checked against the tui-design checklist (clutter audit, 80x24 and 60-column floor) in the PR description.

### 3.9 Russian names (P4)

AGT-38 as written: the pack's `names` get the missing cases (Maren has two forms today; Ilsa's pack spelling is Ильса while the human wrote Ильза, so both spellings are listed), one canonical Russian form per character and per NPC (`староста Осрик Хейл`), and in a `--lang ru` run the DM and player prompts carry those forms. `floor.ts namedIn` is unchanged; it reads the list. Typo tolerance stays out.

### 3.10 Core: Dodge, and a second Dash that adds movement (P8)

Both on fork `demo`, each its own `core/<topic>` PR with a test in `core/tests/` and a `PROGRESS.md` row, then one table pin PR.

- **Dodge.** `actions/dodge.json` in the shape of `dash.json`: targeting self, one action, applying `effects/dodge.json` until the start of the applier's next turn. The effect needs two modifiers: attack rolls against the bearer at disadvantage, and advantage on its Dexterity saves; the SRD's end conditions (Incapacitated, Speed 0) are checked against what the effect system can express before the PR is sized. The SRD's "if you can see the attacker" clause is left out: vision is out of the Demo Run's scope, so every attacker counts as seen, and the effect's `_comment` says so. The adapter lists core actions generically, so Dodge appears in `legal_actions` with no table code; the DM prompt's mapping line ("I take cover" to Dodge) is a table follow-up in the same pin PR.
- **Dash.** `effects/dash.json` is `speed: x2`; a second application re-applies the same effect and adds nothing. SRD 5.2.1: each Dash gives extra movement equal to your Speed. The effect becomes an additive movement bonus equal to base Speed and stacks per application, so Action Surge plus Dash works. Test: two Dashes in one turn, movement left equals three times Speed.

## 4. Load, cost and failure modes

**Load.** Run 18-45 made about 270 model calls in 26 minutes. S2 and S3 remove calls rather than add them: one closing call per narration no longer blocks, and a combat turn drops from three or four calls to one or two. Expected: fewer output tokens per turn, the same input, so cost per run goes down slightly, not up. S4 adds no calls; U1 adds none; the panels add none.

**Failure modes.**

| Failure | Effect | Handled by |
| --- | --- | --- |
| A settled-early DM turn keeps calling tools | "not now" refusals, logged | existing `bound` guard; count in the usage record |
| A draining turn still runs when the next DM wake comes | the next wake waits for it, up to its own timeout | `interrupt()` on the draining turn first, as timeouts do today |
| Partial messages arrive out of order or not for MCP tools | preview shows garbage or nothing | spike first; preview is best-effort and never recorded; off by default until the spike passes |
| Merged `submit_decision` refused mid-chain | nothing said, turn open | the handler stops at the first refusal and returns it |
| `theme.json` missing or invalid | no colours | loader falls back to the built-in ANSI table and warns once |
| Terminal narrower than 72 or resized mid-run | re-layout | pure layout from `PanelSize` per render; fold rule unchanged |
| Core Dodge effect cannot express its end conditions | Dodge lasts the full round | sized in the core PR; shipped only if it matches the SRD |

**Observability.** Everything new is visible in the run folder: `usage.jsonl` phases, `settled_early`, `drained`, the `/usage` block in `report.md`, hand flags in `verdict.json`.

## 5. Trade-offs decided here

Stas can overrule any of these; none needs his answer to start.

| # | Chosen | Rejected | Why | Revisit when |
| --- | --- | --- | --- | --- |
| T1 | A wake ends at its settling tool (`settleOn`), the SDK turn drains in the background | Tell the model "do not reply after narrate" (prompt only); or a shorter timeout | A prompt rule failed for movement; a shorter timeout cuts narrations that are late for good reasons. `settleOn` is 40 lines in one file and keeps full usage | the SDK offers a "stop after tool" option |
| T2 | Merge say and end_turn into `submit_decision` as optional fields | A separate `act_and_end` tool; or the loop auto-ending the turn after one option | Optional fields keep the old shape valid, and a player that needs a bonus action after its action still can. Auto-end would steal legal bonus actions | the engine exposes "nothing useful left" on the turn budget |
| T3 | Stream only the DM's `narrate` text, as an unrecorded preview | Stream every agent's text; stream the final guarded text only | The human waits on narration alone; a preview that is replaced keeps the transcript, the audit and the guard exactly as they are | a client contract carries streaming natively (Telegram, SwiftUI) |
| T4 | Refuse `narrate` after `load_scene` in one wake | Suppress the `scene_open` wake; or merge both into one wake | The opening wake has the new scene's state and the pass-over bridge; the refusal is one line and deterministic | the DM runs scene transitions through a single tool |
| T5 | Hand flags live in `confirmations.json` | A second file; editing `narration.jsonl` | One file Stas already edits; the judge's output stays untouched evidence | the judge is re-prompted for recall |
| T6 | Theme tokens as one JSON file in `game/` | A TS module; a package shared with the SwiftUI app now | JSON is the hand-off format any client reads; a shared package is premature before a second client exists | the SwiftUI app consumes it |
| T7 | Dash as an additive, stacking movement bonus in core | Table-side special case | Rule 5: never work around a core rule in our code | upstream changes `effect.dash` |

## 6. Build order and rows

One PR per line, stacked bottom-up, `table/<topic>` branches, Claude review per head (Rule 8). Row ids are those in TASKS.md.

| Order | PR | Scope item | Row | Size | Gate before the next |
| --- | --- | --- | --- | --- | --- |
| 0 | `table/adr-one-repo`: ADR "nat20-table stays one repo" (Rust engine and TS game together; the loop-to-client line is the one that gets a contract and, later, its own repo). Records Stas's 2026-10-31 decision; goes in the M10 spec PR | C1 (new) | CON-15 | S | none; docs only |
| 1 | `table/wake-timing`: `calls[]`, phase percentiles in the report | S1 | AGT-59 | S | report shows phases on a `play:cheap` run |
| 2 | `table/narrate-facts`: who moved, adjacency, hand flags in the verdict | P2, P3 | AGT-60 | S | fixtures re-recorded |
| 3 | `table/scene-opens-once` | P1 | AGT-61 | S | one opening per scene in the fixture transcript |
| 4 | `table/wake-settles-on-tool`: `settleOn`, ADR | S2 | AGT-62 | S | DM narration p95 under 6 s on a `play:cheap` run |
| 5 | `table/one-call-turn` | S3 | AGT-63 | S | player combat p95 under 10 s on the same run |
| 6 | `table/usage-command` and `table/theme-tokens` | U1, U2 | AGT-64, AGT-65 | S | none |
| 7 | `table/russian-names` | P4 | AGT-38 | S | `--lang ru` run names resolve |
| 8 | `table/stream-narration` (after a spike on the Mac) | S4 | AGT-66 | M | preview visible, transcript byte-identical to a run without it |
| 9 | `table/panel-width`, `table/input-line`, `table/turn-glyphs` | P5, P6, P7 | AGT-47, AGT-48, AGT-67 | M, M, S | 80x24 and 60-column floor tests |
| 10 | `core/dodge`, `core/dash-stacks`, then `table/core-pin-m10` | P8 | ENG-19, ENG-26 | S, S | fork CI green, pin PR green |
| 11 | Only if 4 and 5 miss the targets: `table/pipelined-narration`, then effort retune | S5, S6 | AGT-25, AGT-68 | S, S | the exit run |
| 12 | Exit: one `play:unattended` on the last build, with the report's phase table | all | milestone row | | N1 to N5 |

## 7. What to revisit as it grows

- When a second client exists (SwiftUI or Telegram), the preview of §3.4 becomes a streaming field on the client contract, and `theme.json` moves to a shared package.
- When the DM runs monsters (AGT-23), `settleOn` needs a per-wake tool set that includes `end_turn` for monster turns.
- If upstream adds Dodge or changes Dash, the sync PR keeps one copy (Rule 6).
- The judge's recall gap is recorded per run by the hand flags; a re-prompt of the judge is its own small item once two more runs show the pattern.
