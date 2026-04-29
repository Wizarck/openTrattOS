## Why

Open Food Facts is the catalog backbone for ingredient nutrition + allergens (FR20–28). Hitting the public OFF API per request is too slow for kitchen-tablet UX (<1s page-load NFR) and creates a runtime dependency that breaks offline. ADR-015 picks a hybrid local mirror + REST API fallback architecture. This slice is independent infra: it can land in parallel with `#1 m2-data-model` from day one because it sits in its own bounded context (`Nutrition catalogue`).

## What Changes

- Postgres `external_food_catalog` table holding the OFF subset relevant for restaurant ingredients (~50k–200k SKUs).
- Weekly cron sync with a stable cursor + a small admin endpoint to force a refresh.
- API-fallback path: when a barcode/name lookup misses the cache, fall through to OFF's REST API and persist on first hit.
- ODbL compliance: attribution embedded in DB rows + surfaced on UI components that consume them (consumed in #5 m2-ingredients-extension).
- Health-check endpoint reporting last-sync timestamp + row count.
- Rate-limit + retry policy on the API-fallback path so a public-API outage degrades gracefully instead of cascading 500s.
- **BREAKING** (none — new infrastructure.)

## Capabilities

### New Capabilities

- `m2-off-mirror`: local-mirror + cron-sync + API-fallback for Open Food Facts. Surface stable to all M2 consumers.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: none (independent of #1 — separate context, separate schema). Can start day one.
- **Code**: `apps/api/src/external-catalog/` (sync worker + repository), DB migration for `external_food_catalog` (separate from #1's M2 schema).
- **API surface (internal)**: a service interface consumed by #5; no public REST endpoint in M2.
- **Operational**: cron schedule (weekly), monitored. Failures emit warnings, do not break ingredient lookups.
- **Compliance**: ODbL attribution clauses in DB + UI per ADR-015 §Compliance.
- **Out of scope**: any UI consumer of this mirror — that ships in `#5 m2-ingredients-extension`.
