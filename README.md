# nat20-table

An AI-run D&D 5e table (2024 rules, SRD 5.2.1): an AI DM and AI players, plus one human, play through a text UI on top of the [Nat20](https://github.com/MadsWedendahlKruse/nat20) rules engine. The engine owns every roll; the AI only narrates and decides.

- Rules for contributors and Claude Code sessions: [CLAUDE.md](CLAUDE.md)
- System design: [docs/design/system-design.md](docs/design/system-design.md)
- Demo scope and acceptance criteria: [docs/scope/demo-run-scope.md](docs/scope/demo-run-scope.md)
- Engine API contract: [crates/nat20-api-contract](crates/nat20-api-contract) (source of truth), [contract/protocol.md](contract/protocol.md), generated schema in [generated/](generated/)

```bash
npm ci && npm run gen          # regenerate schema + TS types from the contract crate
cargo test --locked            # unit tests and contract fixture replay
cargo run -p nat20-api-server  # the engine on stdio
```

Licences: code MIT ([LICENSE](LICENSE)). Adventure content in `scenarios/`, `pregens/`, `maps/` will be CC-BY-4.0. Rules data derives from the SRD 5.2.1 (CC-BY-4.0, Wizards of the Coast).
