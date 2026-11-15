---
type: Task
id: UPS-26
title: "OpenTelemetry held below its newest lines for Langfuse"
pri: P2
dest: Ours
size: XS
state: todo
area: "11. Repo split and contract pipeline (system design, 2026-10-16)"
---

OpenTelemetry held below its newest lines for Langfuse (AGT-16): `@langfuse/otel` 6.1.1 peers want `@opentelemetry/api` below 1.10, the 2.x SDK and the exporter below 0.300, while api 1.10, SDK 3.x and exporter 0.301 are out. `game/package.json` names those peers (`api`, `core`, `resources`, `sdk-trace-base`, `otlp-exporter-base`, `exporter-trace-otlp-http`) as direct, exact dependencies so npm cannot pick a peer newer than the cooldown allows. `.github/dependabot.yml` keeps `@langfuse/*` and `@opentelemetry/*` in their own group and ignores those majors and the api minor, so no red lone bump arrives. **This row's PR removes those ignore entries** when a Langfuse release accepts the newer lines

## Status

(held: upstream Langfuse peers; Rule 9 30-day clock does not run while held)
