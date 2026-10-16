# Contract changelog

Every change to `crates/nat20-api-contract` gets a line here with the new `CONTRACT_VERSION` (CLAUDE.md Rule 1, Rule 2).
Within major 1, changes are additive only. Nothing is released yet, so versions carry a `-dev.N` suffix until v1 is complete (CON-2).

## 1.0.0-dev.1 (2026-10-16)
- Envelope: `Request { v, id, cmd }`, `Response { v, id, ok, result, error }`; `result` is tagged by the same `cmd` as the request.
- Command `hello` returning `protocol`, `version`, `engine_rev`, `schema_sha256`.
- Error model: `ErrorCode` (15 codes) and `RejectReason` (10 reasons) from the v1 draft.
- Request ids are idempotent: a repeated id returns the stored response (last 256 ids).
