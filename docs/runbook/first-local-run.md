# First local run on Stas's Mac

How to set up a Mac for the Milestone 6 live runs and run them: the Agent SDK spike (step 1, AGT-17), the all-AI runs (steps 9 and 10) and the exit run (step 13). Live model calls run only here, on Stas's Claude subscription (decision 0036); cloud sessions and CI never call a model.

Part 1 can be done today. Part 2 grows with each Milestone 6 step: a command is listed with the step that ships it, and a step's PR updates its line here.

## Part 1: prerequisites (do these once, in advance)

| # | What | Command or place | Check it worked |
|---|---|---|---|
| 1 | Apple command-line tools (the Rust linker needs them) | `xcode-select --install` | `xcode-select -p` prints a path |
| 2 | Rust through rustup. The repo's `rust-toolchain.toml` installs the pinned release on the first `cargo` call | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | `cargo --version` inside the repo prints the release in `rust-toolchain.toml` |
| 3 | Node 22, version 22.6 or later (`.nvmrc`; the game runs TypeScript with `--experimental-strip-types`) | `brew install node@22`, or `nvm install` in the repo | `node --version` prints `v22.6` or later |
| 4 | Claude Code, logged in with the Claude subscription account | `npm install -g @anthropic-ai/claude-code`, then `claude` and `/login`; pick the subscription login, not an API key | `claude -p "reply with ok"` answers `ok` |
| 5 | **No API key in the shell.** The Agent SDK prefers `ANTHROPIC_API_KEY` over the subscription login when it is set, which would bill the API instead of the plan | `unset ANTHROPIC_API_KEY`, and remove it from `~/.zshrc` if it is there | `echo ${ANTHROPIC_API_KEY:-none}` prints `none` |
| 6 | The repo | `git clone https://github.com/StGerman/nat20-table && cd nat20-table` | `git log -1` shows `main` |
| 7 | Node packages | `npm ci` | exits 0 |
| 8 | The engine, built once (the first build fetches `nat20_core` from the fork and takes a few minutes) | `cargo build -p nat20-api-server` | `target/debug/nat20-api-server` exists |
| 9 | Remote Control, only if a project thread should run commands here for you (below) | see "Remote Control" | the thread sees your Mac |

Nothing else is configured by hand. The game reads no secrets and no config file: the model per agent, the scenario pack and the seed are command-line flags with defaults (decision 0032), and every run writes its files to `runs/<timestamp>/` in the repo (git-ignored).

### Remote Control (optional)

A project thread can run the live commands on your Mac through Remote Control, so you only approve them. Two blockers today:
- **"Require trusted devices"** is on for your account (Settings, Account). Project threads can't start Remote Control sessions while it is on. Either turn it off, or skip Remote Control and run the Part 2 commands yourself and paste the run report into the thread.
- The Mac must be connected: in a terminal, in the repo folder, run `claude remote-control`, or connect the Mac in the Claude Desktop app's settings.

Every Part 2 command runs the same way in both cases. It needs no terminal input except where it says "you play", prints a short report at the end, and writes everything to `runs/<timestamp>/`, so a thread can run it and read the result.

## Part 2: the runs

Each line names the Milestone 6 step that ships it. Before each run: `git pull`, `npm ci`, `cargo build -p nat20-api-server`.

| Step | Run | Command | You play? | What to send back |
|---|---|---|---|---|
| 1 | Agent SDK spike: three player turns for Maren and three DM narrations, each agent in one session (first turn cold, then warm), against a recorded engine state; latency, tokens and API-equivalent cost per turn; checks the credential is your subscription and that the DM loads a skill from our folder | `npm run spike` (a few minutes; `npm run spike -- --dry-run` prints the session settings without calling a model). It needs no engine build | No | `runs/spike-<time>/report.md` |
| 9 | All-AI party: Torva, Maren and Ilsa on the Agent SDK (Sonnet 5.5, low effort) with their personality cards, Bren on a scripted seat and a scripted DM, through the Milestone 5 yard fight; the report gives latency and tokens per agent, retries and fallbacks, every creature's end state, and the audit and leak scan result | `npm run play:ai-party` (a few minutes; the first run also builds `nat20-audit`). `-- --dry-run` prints each player's prompt and session settings without calling a model; `-- --seed N` replays a seed; `-- --player-model claude-haiku-5-5` tries another model | No | `runs/ai-party-<time>/report.md` |
| 10 | Scene 3 of The Silent Mill (the yard fight) with the DM agent (Opus 5.5, low effort) and the all-AI party, Bren on a scripted seat; Scenes 1 and 2 are loaded silently first. The narration and speech guards are on; the report adds DM narration latency against its 6 s target and every narration line | `npm run play:scene` (a few minutes). `-- --dry-run` prints the DM's prompt and session settings without calling a model; `-- --craft skills` gives the DM its craft guidance as skills instead of in its prompt (try it once the step 1 spike shows skills load); `-- --dm-timeout-ms 20000` if the DM keeps timing out; `-- --scene s1_village_green` plays another scene | No | `runs/scene-<time>/report.md` |
| 11 | The terminal UI, no model: you play Bren in the Scene 3 yard fight against a scripted DM (one plain line per turn) and scripted Torva, Maren and Ilsa. Try option numbers, words, `/options`, `/sheet`, `/where`, `/log`, `/pause`, `/help`; `/quit` or Ctrl+C ends the run and still writes the report | `npm run play:scene -- --seat ink --dm scripted --players scripted`. Then the same with the DM agent and the AI players: `npm run play:scene -- --seat ink` | **Yes**, in a terminal (not through Remote Control: the UI needs your keyboard) | `runs/scene-<time>/report.md`, and anything on screen that read wrong |
| 13 | **Exit run:** you play Bren in the text UI through Scene 1 (the village green) and Scene 3 (the mill yard) with the DM agent and Torva, Maren and Ilsa on the models and effort of the step 10 run. Scene 2 is passed over: when the DM moves on from Scene 1, the party goes straight to the yard and the DM bridges the road in a sentence. The run ends after the yard fight, or when the DM moves on from Scene 3. The report lists retries, fallbacks, p50/p95 latency per agent against the targets, tokens, and any stop at the plan's usage limit | Rehearse first without a model (a minute or two; the scripted DM moves on at your first words in Scene 1): `npm run play:exit -- --dm scripted --players scripted`. Then the run: `npm run play:exit` (the scenes' targets add up to 35 minutes; expect longer). `-- --seed N` replays a seed; `-- --dm-timeout-ms 20000` if the DM keeps timing out | **Yes**, in a terminal (not through Remote Control: the UI needs your keyboard) | The whole run folder: the command prints a `zip` line for it at the end. Attach the zip in the thread; the thread commits the transcript, engine log and usage records to the step 13 PR and the project folder. The repo is public, so that includes everything you typed |

If a run stops at the plan's usage limit, it says so and writes what it has; that is a clean stop, not a failure (spec §6).

A game run's folder holds `transcript.jsonl` (every line each seat heard or wrote), `session-log.jsonl` (the engine's whole log as the DM sees it), `engine-log.jsonl` (every request and response), `inputs.jsonl` (everything each player agent and your seat were given) and `usage.jsonl` (tokens and latency per model call). The step 9, 10 and 13 commands check it themselves when they finish; to check a run folder by hand:

```bash
cargo run -p nat20-duel --bin nat20-audit -- --pack <the scenario pack> runs/<time>
```

It audits every roll on every channel against the log as that channel's listener saw it, and scans what each seat was given for anything its player may not know (spec §3.5, decision 0033). It exits 1 on any problem and prints each one.
