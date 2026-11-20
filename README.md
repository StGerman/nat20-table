# nat20-table

An AI-run D&D 5e table (2024 rules, SRD 5.2.1): an AI DM and AI players, plus one human, play through a text UI on top of the [Nat20](https://github.com/MadsWedendahlKruse/nat20) rules engine. The engine owns every roll; the AI only narrates and decides.

- Rules for contributors and Claude Code sessions: [CLAUDE.md](CLAUDE.md)
- System design: [docs/design/system-design.md](docs/design/system-design.md)
- Demo scope and acceptance criteria: [docs/scope/demo-run-scope.md](docs/scope/demo-run-scope.md)
- Living world scope (Milestone 9 on): [docs/scope/living-world-scope.md](docs/scope/living-world-scope.md)
- First local run on a Mac (Milestone 6 live runs): [docs/runbook/first-local-run.md](docs/runbook/first-local-run.md)
- Engine API contract: [crates/nat20-api-contract](crates/nat20-api-contract) (source of truth), [contract/protocol.md](contract/protocol.md), generated schema in [generated/](generated/)

## Play it

On an Apple Silicon Mac, with no Rust toolchain:

1. Install Node 22.6 or later (`brew install node`, or the installer from nodejs.org) and Claude Code (`npm install -g @anthropic-ai/claude-code`), then run `claude` and sign in with your own Claude plan. The agents run on that login, never on an API key: a run refuses to start while `ANTHROPIC_API_KEY` is set.
2. Clone and fetch the engine from the latest release:
   ```bash
   git clone https://github.com/StGerman/nat20-table && cd nat20-table
   git checkout "$(git tag --list 'play-*' | tail -1)"
   npm ci && npm run engine:fetch && npm run preflight
   ```
3. Play: `npm run play:scene -- --seat ink` is one fight in the mill yard, with you as Bren; `npm run play:demo` is the whole adventure, one to two hours. Add `--lang ru` for Russian. Every run writes its folder under `runs/`, with `audit.json`: each roll the table spoke of, checked against the engine's log.

A run uses your plan's limits like any long Claude Code session. With a Rust toolchain, a cargo build of this checkout wins over the fetched engine.

## Develop

```bash
npm ci && npm run gen          # regenerate schema + TS types from the contract crate
cargo test --locked            # unit tests and contract fixture replay
cargo run -p nat20-api-server  # the engine on stdio
```

Licences: code MIT ([LICENSE](LICENSE)); our adventure content CC-BY-4.0. Rules data derives from the SRD 5.2.1 (CC-BY-4.0, Wizards of the Coast). Attribution and trademark notices: [NOTICE.md](NOTICE.md).
