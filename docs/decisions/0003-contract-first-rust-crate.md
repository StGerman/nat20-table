# 0003. Contract-first, written as a Rust contract crate

- **Status:** Accepted
- **Date:** 2026-10-16 (format settled in practice when nat20-table PR #2 merged, 2026-10-17)
- **Decided by:** Stas set contract-first ("generate code from the contracts, not contracts from the code"); the Rust crate was Claude's recommendation after two spikes; the format card was withdrawn rather than answered, and Stas merged the contract on that path

## Context

The engine wire is consumed by a TypeScript game loop and maybe Python agents, carries visibility rules and makes versioning promises to agents. Stas objected to wire types living next to server logic (fork PR #2 derived the schema from `server/src/protocol.rs` with an untyped `result: Value`). He did not object to schemars itself. Transport is stdio, not HTTP.

## Options

### A. Rust contract crate (serde + schemars) → JSON Schema → TS
- Pro: no fix-up step; `v: 2` rejected by type; TS gets the literal `1`.
- Pro: upstream's own pattern (schemars + freshness test).
- Con: the contract's syntax is Rust; TS readers review generated output. Serde attributes can change wire behaviour without a schema diff (fixtures catch it).

### B. TypeSpec → JSON Schema → cargo-typify + TS
- Pro: readable without Rust.
- Con: needs a normalizer we own forever, or typify panics or parses every request as `hello`; `v: 2` passes; 1,398 lines of generated Rust for the spike slice.

### C. TypeSpec → OpenAPI → progenitor
- Con: progenitor emits an HTTP client; our transport is stdio.

### D. Protobuf / buf
- Con: proto3's JSON mapping is not the shape LLM tool calls want.

### E. Schema derived from server implementation types (fork PR #2)
- Con: contract from code; types next to logic.

## Decision

A. The `nat20-api-contract` crate holds wire types and doc comments only (serde, serde_json, schemars), and JSON Schema, its sha256 and TS types are generated from it and committed.

## Consequences

- CLAUDE.md Rule 1 (contract, fixture, changelog, regenerate, then code, in one PR) and CI jobs `contract-fresh`, `contract-compat`, `contract-pure`.
- Known schema shapes the TS generator mishandles are listed in Rule 1, and `tools/codegen/gen.mjs` reshapes them.
- Swift and Kotlin from this schema collapse tagged unions; acceptable because no mobile client talks to the engine ([0016](0016-client-contract-deferred.md)).

## Revisit when

People who don't read Rust must author the contract, or HTTP transport is added (OpenAPI becomes worth it).

## Sources

- `docs/design/system-design.md` §5.1, §5.4; `/mnt/project-files/engine/design/contract-spike/`.
- Thread "System decomposition and dev process"; nat20-table PR #2.
