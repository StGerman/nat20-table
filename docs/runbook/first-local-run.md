# First local run on Stas's Mac

How to set up a Mac for the Milestone 6 live runs and run them: the Agent SDK spike (step 1, AGT-17), the all-AI runs (steps 9 and 10) and the exit run (step 13). Live model calls run only here, on Stas's Claude subscription (decision 0036); cloud sessions and CI never call a model.

Part 1 can be done today. Part 2 grows with each Milestone 6 step: a command is listed with the step that ships it, and a step's PR updates its line here.

## Part 1: prerequisites (do these once, in advance)

| # | What | Command or place | Check it worked |
|---|---|---|---|
| 1 | Apple command-line tools (the Rust linker needs them) | `xcode-select --install` | `xcode-select -p` prints a path |
| 2 | Rust through rustup. The repo's `rust-toolchain.toml` installs the pinned release on the first `cargo` call | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | `cargo --version` inside the repo prints the release in `rust-toolchain.toml` |
| 3 | Node 22, version 22.6 or later (`.nvmrc`; the game runs TypeScript with `--experimental-strip-types`). Skip it if `node --version` already prints that | `brew install node@22`, then put it on the PATH, because Homebrew keeps `node@22` off it: `echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc` and open a new terminal. Or `nvm install` in the repo | `node --version` prints `v22.6` or later, and `npm --version` prints a version |
| 4 | **No API key in the shell**, before the first `claude` call in item 5. The Agent SDK and Claude Code prefer `ANTHROPIC_API_KEY` over the subscription login when it is set, which would bill the API instead of the plan | `unset ANTHROPIC_API_KEY`, and remove it from `~/.zshrc` if it is there | `echo ${ANTHROPIC_API_KEY:-none}` prints `none` |
| 5 | Claude Code, logged in with the Claude subscription account, in a terminal where item 4 holds | `npm install -g @anthropic-ai/claude-code`, then `claude` and `/login`; pick the subscription login, not an API key | `claude -p "reply with ok"` answers `ok` |
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
| 9 | All-AI party, Bren on a scripted seat, through the Milestone 5 yard fight | ships with step 9 | No | report, and the audit and leak scan results it prints |
| 10 | Scene 3 with the DM agent and the all-AI party | ships with step 10 | No | same |
| 13 | **Exit run:** you play Bren through Scene 1 and Scene 3 in the text UI | ships with step 13 | **Yes**, in a terminal (not through Remote Control: the UI needs your keyboard) | the run folder; the thread commits the transcript, engine log and usage records to the PR |

If a run stops at the plan's usage limit, it says so and writes what it has; that is a clean stop, not a failure (spec §6).

A game run's folder holds `transcript.jsonl` (every line each seat heard or wrote), `session-log.jsonl` (the engine's whole log as the DM sees it), `engine-log.jsonl` (every request and response), `inputs.jsonl` (everything each player agent and your seat were given) and `usage.jsonl` (tokens and latency per model call). The step 9, 10 and 13 commands check it themselves when they finish; to check a run folder by hand:

```bash
cargo run -p nat20-duel --bin nat20-audit -- --pack <the scenario pack> runs/<time>
```

It audits every roll on every channel against the log as that channel's listener saw it, and scans what each seat was given for anything its player may not know (spec §3.5, decision 0033). It exits 1 on any problem and prints each one.
