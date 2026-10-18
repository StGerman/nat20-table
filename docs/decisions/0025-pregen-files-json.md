# 0025. Pregen files: JSON with a `_comment` key, format in the contract crate

- **Status:** Accepted
- **Date:** 2026-10-18
- **Decided by:** Stas, 2026-10-18 (Milestone 4 spec D1, table #43)

## Context

Milestone 4 adds three pregens beside Bren, who was built in Rust (`adapter/pregen.rs`). Pregens are our adventure content (CLAUDE.md layout: `pregens/`, CC-BY-4.0), read by the engine and later by the agents' character tools, so they need a file format with a schema. People editing them want to leave notes in the file (why a score, why a kit). Both repositories already keep their data as JSON: core's registry (224 files, notes in a `_comment` key), our scene files, stat blocks and fixtures.

## Options

### A. JSON with an optional `_comment` key
- Pro: one parser and one format across both repos; the format lives in the contract crate as a third schema root, so the generated schema validates the files as written and the TS client gets the types.
- Pro: unknown keys stay refused, as in scene files and core's registry; notes ride in the schema as an optional string on the file and on each section.
- Con: no free-form comments between lines; a note has to sit on a section.

### B. JSONC or JSON5
- Pro: comments anywhere.
- Con: a second parser; the generated JSON Schema no longer validates the file as written.

### C. YAML
- Pro: native comments, terse.
- Con: `serde_yaml` is archived by its author, so cargo-deny would need an exception; nothing else in either repo is YAML.

## Decision

A. Pregen files are JSON in `pregens/`, typed by `PregenFile` in `nat20-api-contract` (module `pregen.rs`, schema `generated/nat20-pregen.schema.json`), with an optional `_comment` string on the file and on each section.

## Consequences

- `hello.schema_sha256` covers three schemas: wire, scene, pregen.
- The engine builds a pregen through core's level-up path, answering each prompt from the file, so a file that leaves a prompt unanswered refuses the scene (`bad_scene`). Starting equipment comes from the file, not core's kits.
- Rows: API-26 (this format), CHR-4 (the four pregens use it).

## Revisit when

Pregen files need notes that no section can carry, or a tool we adopt needs another format.

## Sources

- `docs/milestones/milestone-4-the-party.md` §4.1 and §11 (D1).
- `contract/protocol.md` §2.2.
