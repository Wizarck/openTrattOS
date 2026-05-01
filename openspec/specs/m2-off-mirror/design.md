## Context

Open Food Facts (OFF) is the reference open catalog for ~3M food products globally with rich macro / allergen / brand metadata. PRD-M2 §FR20–24 expects barcode + name + brand search to pre-fill ingredient setup in Journey 1. The kitchen-tablet UX has a <1s slow-Wi-Fi page-load NFR (PRD §Performance) — incompatible with hitting the public OFF REST API per request. ADR-015 picks a hybrid local mirror + REST API fallback.

## Goals / Non-Goals

**Goals:**
- Local Postgres `external_food_catalog` table mirroring the OFF subset relevant for restaurant ingredients (~50k–200k SKUs by region scoping).
- Weekly cron sync with stable cursor + manual force-refresh admin endpoint.
- API-fallback path: cache miss → OFF REST API → persist on first hit.
- ODbL compliance: attribution embedded in DB rows + surfaced on UI components per `#5`.
- Health-check endpoint reporting last-sync timestamp + row count.
- Graceful degradation: OFF API outage does not cascade 5xx to the chef-facing UI.

**Non-Goals:**
- UI: no chef-facing surface in this slice. The pickers ship in `#5 m2-ingredients-extension`.
- Schema for ingredient extensions (`nutrition` jsonb, `allergens` etc.): that's `#1 m2-data-model`.
- Allergen aggregation logic: `#7 m2-allergens-article-21`.

## Decisions

- **Hybrid (local mirror + REST fallback)** vs pure-API or pure-mirror. **Decision**: hybrid. **Rationale**: pure-API breaks the <1s NFR + offline mode; pure-mirror makes new products invisible until the next weekly sync. Hybrid: cache hit serves <50ms; miss falls through to REST + persists.
- **Region scoping at sync time** vs full-catalog. **Decision**: region-scoped (org's country). **Rationale**: full OFF is ~3M rows; ES + IT scope is ~200k. Disk + sync time win 15x.
- **Weekly sync cadence** vs daily / on-demand. **Decision**: weekly. **Rationale**: ingredient catalogs change slowly; weekly captures new products with acceptable freshness; the API-fallback handles edge cases for products added between syncs.
- **Cursor-based incremental sync** vs full reload. **Decision**: cursor on OFF's `last_modified_t`. **Rationale**: OFF supports it natively; full reload for 200k rows is a multi-minute job that locks the table.
- **Degradation on OFF outage**: cache hit always serves; cache miss returns "not found" with a soft warning instead of 502. **Rationale**: kitchen workflow continues with manual entry per FR23 override.

## Risks / Trade-offs

- [Risk] Stale data between syncs (up to 7 days). **Mitigation**: API-fallback resolves on first user hit; admin force-refresh available.
- [Risk] OFF schema evolves. **Mitigation**: persist OFF payload as jsonb in `nutrition` column (`#1` decision); structural changes absorbed without migration.
- [Risk] ODbL attribution easy to forget on UI. **Mitigation**: schema includes `licenseAttribution` column; `#5` UI tests assert it renders. CI lint can extend later.
- [Risk] Cron worker drift / silent failure. **Mitigation**: health-check endpoint + alerting on `lastSyncAt > 14d`.

## Migration Plan

Steps:
1. Migration creates `external_food_catalog` table (separate schema from M2 entities — different bounded context).
2. Initial sync: scheduled background job pulls org-region OFF subset (~200k rows for ES+IT). Runs once at deploy.
3. Cron registered for weekly sync (e.g. Sunday 02:00 UTC).
4. Admin endpoint `POST /external-catalog/sync` for manual refresh (Owner+ role).
5. Health-check `/health/external-catalog` returns last-sync + row count.

Rollback: drop the table; remove cron registration. Other M2 slices that consume the mirror (`#5`) gracefully degrade to API-only mode (slower but functional).

## Open Questions

- Scope of regions for v1? Decision deferred to `#5 m2-ingredients-extension` rollout per org `country` field.
