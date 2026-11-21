# 0090. The first client is a local web page in a shell, on our own seat wire

- **Status:** Proposed
- **Date:** 2026-11-21
- **Decided by:** Claude proposed in `docs/design/glass-table-system-design.md`; Stas took the one-package direction in the prototype thread, 2026-11-21 01:11Z («Звучит отлично запланируй с Яном пожалуйста»); accepted on merge

## Context

Stas picked the Glass Table look and feel on 2026-11-20 and asked for its system design. Decision 0016 rejected a client that talks to the engine and deferred the client wire "until a real web or mobile client is planned". One is now planned: a Mac app for one human at a local table. Two choices follow, and they are one choice in practice, because the wire decides where the client can be tested.

Facts checked: the boundary is `Seat` in `game/src/table/types.ts`; the loop compiles to one 92 MB file with Bun (check of 2026-11-20); Liquid Glass as a system material exists only in SwiftUI and AppKit; a cloud thread cannot build, run or look at a SwiftUI app; decision 0029 rules out a self-hosted runner, and hosted macOS runners build the release today (CON-19).

## Options

### A. A web page in a Tauri shell, our JSON over a local WebSocket
- Pro: the page opens in a plain browser against a recorded `seat-wire.jsonl`, so a cloud thread tests it on Linux CI with no Mac and no model.
- Pro: about 55 MB to download; the system's own web view; native window and menus.
- Pro: one language for the wire and the page; zod schemas, one hash.
- Con: the glass is a CSS imitation. It does not refract and will not follow Apple's material when it changes.
- Con: a second small Rust program (the shell), and a combination we have not run: Tauri with a Bun-compiled loop under the hardened runtime.

### B. The same page in Electron
- Pro: no Rust in the shell; one runtime could hold the loop.
- Con: about 125 MB to download; Chromium's rendering, not the system's.

### C. A native SwiftUI client
- Pro: the real material, toolbar, inspector and menu bar; the same code could reach an iPad later.
- Con: every change waits on Stas's Mac; Claude writes it without seeing it.
- Con: a second language for the whole client and generated wire types for it; CI on macOS only.

### D. The shell's own bridge (Tauri commands, Electron IPC) instead of a socket
- Pro: no port, no token.
- Con: the page then runs only inside the shell, so every page test needs a Mac.

### E. AG-UI, or protobuf and Connect, for the wire (0016's two candidates)
- Pro: ready for a remote or a non-JS client.
- Con: one local client in one language gains nothing; game events would still be our own typed schema on top.

## Decision

A. The page must stay testable where the work is done, and that outweighs the material for a first build. The wire is our own JSON, shaped as the events already are (text, a state snapshot, one call per decision), so a later mapping to AG-UI or a native client reading the same `seat-wire.jsonl` fixtures stays cheap. 0016's rejection of a client on the engine contract stands unchanged; this record settles only its deferred part, and only for a local client.

## Consequences

- A second contract with its own hash, in `game/src/seat-wire/`. It carries player-view and owner-view data only; a leak scan over `seat-wire.jsonl` joins the existing visibility checks. It is not the engine contract, so Rule 1 does not govern it; the design §4 does.
- The run folder gains `seat-wire.jsonl`, beside the existing `seat.jsonl`, which keeps its shape and its readers.
- Two seats to keep: the terminal seat stays for CI, benches and unattended runs.
- The page's CI runs on Playwright's WebKit project, the nearest thing on Linux to the app's WKWebView.
- A spike checks the unverified combination before any app code is built (scope §6).
- The player is never told the material is Liquid Glass.

## Revisit when

- Stas plays the first run in the app and it reads as an imitation: then C, with the page kept as the test harness.
- A second human, a remote seat or a mobile client is planned: then E, as 0016 foresaw.
- The spike fails on Tauri with the compiled loop: then B.

## Sources

- `docs/design/glass-table-system-design.md` §3, §4, §8, §10; `docs/scope/glass-table-scope.md`.
- Decisions 0016, 0029.
- Prototype thread "Prototype Liquid Glass GUI" (2026-11-20 and 11-21); the Bun check, project file `demo/bun-check-2026-11-20.md`.
