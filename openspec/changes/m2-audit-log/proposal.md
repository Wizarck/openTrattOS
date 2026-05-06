## Why

Five M2 bounded contexts now ship cache-and-audit pattern in their own per-BC tables:

| BC | Table | Audit shape |
|---|---|---|
| `cost-rollup-and-audit` | `recipe_cost_history` | per-rollup audit row |
| `ingredients-extension` | `ingredient_overrides` (jsonb on entity) | history reserved against future audit_log |
| `allergens-article-21` | `recipe_allergens_overrides` (jsonb on entity) | history reserved against future audit_log |
| `ai-yield-suggestions` (Wave 1.7) | `ai_suggestions` | row's `status` flip = audit record |
| `mcp-server` (Wave 1.5 middleware) | (no table; emits `AGENT_ACTION_EXECUTED` "into the void") | no consumer yet |

Six events are already published on the in-process bus (`EventEmitter2`) by these BCs and their callers: `INGREDIENT_OVERRIDE_CHANGED`, `RECIPE_ALLERGENS_OVERRIDE_CHANGED`, `RECIPE_SOURCE_OVERRIDE_CHANGED`, `RECIPE_INGREDIENT_UPDATED`, `SUPPLIER_PRICE_UPDATED`, `AGENT_ACTION_EXECUTED`. Some have subscribers (cost.service rebuilds rollups; labels.service invalidates cache; dashboard.service invalidates cache). None persist a durable audit record. M3 will add at least four more event-emitting BCs (HACCP events, inventory movements, batch lifecycle, order audit). The pressure to extract is high.

This slice ships:

1. A canonical `audit_log` table — single source of truth for "who did what to which aggregate, when, why".
2. An `AuditLogService` + `AuditLogSubscriber` that listens to all known events on the bus and persists an audit row per event.
3. A `GET /audit-log` endpoint with filters (`organizationId`, `aggregateType`, `aggregateId`, `eventType`, `actorUserId`, date range), Owner+Manager RBAC.
4. Backfill migration that walks the 5 existing BCs and writes historical rows (ai_suggestions accept/reject events; recipe_cost_history rows; ingredient + recipe override jsonb arrays).
5. Per-BC audit columns are NOT removed in this slice (deferred to `m2-audit-log-cleanup`) to keep blast radius low.

Future BCs (M3+) opt into auditing by emitting an event on the bus with an `AuditEventEnvelope` shape; no per-BC code changes needed.

## What Changes

- **Migration `0017_audit_log.ts`** — new `audit_log` table with 14 columns:
  - `id uuid PK`, `organization_id uuid NOT NULL`
  - `event_type text NOT NULL CHECK` (open enum, validated app-side)
  - `aggregate_type text NOT NULL`, `aggregate_id uuid NOT NULL`
  - `actor_user_id uuid NULL FK users`, `actor_kind text NOT NULL CHECK ('user'|'agent'|'system')`
  - `agent_name text NULL` (when `actor_kind='agent'`)
  - `payload_before jsonb NULL`, `payload_after jsonb NULL`
  - `reason text NULL`
  - `citation_url text NULL`, `snippet text NULL` (for AI events; nullable for everything else)
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - 3 indexes: `(org, agg_type, agg_id, created_at DESC)` for drill-down; `(org, event_type, created_at DESC)` for global filter; `(org, actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL` for user-history queries.
- **Migration `0017` includes backfill** that re-emits historical events (ai_suggestions accept/reject rows, recipe_cost_history rows, ingredient + recipe override jsonb).
- **`apps/api/src/audit-log/`** new BC: domain entity, application service, subscriber, interface controller + DTOs.
- **5 BCs updated** to publish a canonical `AuditEventEnvelope` shape via the existing event bus, without removing their per-BC audit columns. Net code change per BC: replace the existing emit with the typed envelope.
- **`AuditLogSubscriber`** uses `@OnEvent` to subscribe to all 7 known event types (the 6 above plus `AI_SUGGESTION_ACCEPTED` / `_REJECTED` from the ai-suggestions BC) and persists rows.
- **`GET /audit-log`** endpoint with filtering + pagination (default 50, max 200). RBAC Owner+Manager. Staff blocked.
- **BREAKING**: none. Per-BC audit columns + endpoints stay; new audit_log is additive.

## Capabilities

### New Capabilities

- `m2-audit-log`: canonical audit_log table + service + subscriber + GET endpoint. Becomes the single source of truth for cross-BC "what changed and why" queries.

### Modified Capabilities

- The 5 audit-emitting BCs (`cost`, `ingredients`, `recipes-allergens`, `ai-suggestions`, `mcp-server` middleware) update their event emit to use the typed `AuditEventEnvelope`. No behavioural change.

## Impact

- **Prerequisites**: All 16 prior M2 slices merged, `m2-wrap-up` (this session, parallel) for prod-flag clearance.
- **Code**:
  - `apps/api/src/audit-log/` (new BC: domain + application + interface + module)
  - `apps/api/src/migrations/0017_audit_log.ts` (table + backfill)
  - 5 BC source files updated to use the typed envelope
  - Tests: ~30 new tests across entity + service + subscriber + controller
- **Performance**: Subscriber writes one audit row per event. Worst case ~3-5 events per write op (e.g. recipe save → emit RECIPE_INGREDIENT_UPDATED + RECIPE_SOURCE_OVERRIDE_CHANGED). At ~100 writes/min/org, ~500 audit rows/min worst case. Index on `(org, agg_type, agg_id, created_at DESC)` keeps drill-down ≤10ms even at multi-million row scale.
- **Storage growth**: ~1KB/row average × 500 rows/min × 60 × 24 × 30 = ~22 GB/month per heavily-used org. Acceptable; partitioning by month in a future slice if growth justifies.
- **Audit**: this IS the audit slice.
- **Rollback**: drop `audit_log` table in a follow-up migration; per-BC tables untouched. Subscriber would silently swallow events. Re-run backfill on re-deploy.
- **Out of scope**:
  - `m2-audit-log-cleanup` — drop redundant audit columns + tables from the 5 per-BC schemas.
  - Audit log retention policy / archival — keep all rows forever for now; archival when storage justifies.
  - Per-tenant export endpoint (`/audit-log/export.csv`) — separate slice.
  - Audit log search by free text — separate slice with proper FTS index.
