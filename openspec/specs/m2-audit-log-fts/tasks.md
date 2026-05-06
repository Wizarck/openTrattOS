## 1. SQL fragment constants (single source of truth)

- [ ] 1.1 Create `apps/api/src/audit-log/application/audit-log-fts.sql.ts`:
  - Export `ES_VECTOR_SQL` — the Spanish vector expression with the QueryBuilder alias prefix `a.` on every column reference (used by the service).
  - Export `EN_VECTOR_SQL` — the English variant.
  - Export `ES_VECTOR_SQL_MIGRATION = ES_VECTOR_SQL.replace(/a\./g, '')` — alias-stripped version for the migration.
  - Export `EN_VECTOR_SQL_MIGRATION = EN_VECTOR_SQL.replace(/a\./g, '')`.
  - Inline comment: "Drift between migration and service breaks the functional-index planner contract — change here only."

## 2. Migration 0019

- [ ] 2.1 `apps/api/src/migrations/0019_audit_log_fts.ts`:
  - `up()`:
    - `hasTable('audit_log')` guard.
    - `CREATE INDEX ix_audit_log_fts_es ON audit_log USING GIN ((${ES_VECTOR_SQL_MIGRATION}))` (template-substitute the constant).
    - `CREATE INDEX ix_audit_log_fts_en ON audit_log USING GIN ((${EN_VECTOR_SQL_MIGRATION}))`.
  - `down()`: `DROP INDEX IF EXISTS ix_audit_log_fts_en; DROP INDEX IF EXISTS ix_audit_log_fts_es;`.
- [ ] 2.2 No backfill needed (functional GIN built at `CREATE INDEX` time by Postgres). No table column added. No entity change.

## 3. Filter type

- [ ] 3.1 `AuditLogFilter` interface in `audit-log/application/types.ts` gains `q?: string`.

## 4. Service

- [ ] 4.1 `AuditLogService.query(filter)` extended to honour `filter.q`:
  - If present: `qb.andWhere` with the OR'd dual-config tsquery clause built from `ES_VECTOR_SQL` + `EN_VECTOR_SQL`.
  - If present: `qb.orderBy` with `GREATEST(ts_rank_es, ts_rank_en) DESC`, then `addOrderBy('a.created_at', 'DESC')`.
  - If absent: existing `created_at DESC` ordering, no rank computation.
- [ ] 4.2 Trim + max-length enforcement at the DTO (delegated to class-validator). Service trusts filter shape.

## 5. DTO + controller

- [ ] 5.1 `audit-log-query.dto.ts` adds `@IsOptional @IsString @MaxLength(200) q?: string`.
- [ ] 5.2 Controller passes `query.q` through to the service filter (single-line addition).

## 6. Tests

- [ ] 6.1 Unit: extend `audit-log.service.spec.ts` with cases:
  - `q` present → `qb.andWhere` called once with the dual-config OR'd clause + the param.
  - `q` present → ordering uses `GREATEST(ts_rank…, ts_rank…)` then `created_at` (assert via captured `orderBy` / `addOrderBy` calls).
  - `q` absent → existing behavior unchanged (no andWhere call for the FTS clause; orderBy uses `created_at` directly).
- [ ] 6.2 INT (Postgres): new spec `audit-log-fts.int.spec.ts`:
  - Seed `audit_log` with 6 rows mixing Spanish and English text per design.md §Migration Plan step 6.
  - **Match cases**:
    - `query({orgId, q: 'tomate'})` returns rows A, B, E (Spanish stems + English `tomato` lemma share root after stemmer).
    - `query({orgId, q: 'chicken'})` returns row C.
    - `query({orgId, q: 'pollo'})` returns row D.
    - `query({orgId, q: 'inexistente'})` returns 0 rows.
  - **Combination**: `query({orgId, q: 'tomate', aggregateType: 'recipe'})` filters AND-wise.
  - **Ranking — stable order (SD4-a)**: a row matching `q` in `payload_after` + `reason` + `snippet` ranks above a row matching only `payload_after`.
  - **Ranking — cross-config (SD4-b)**: `q='tomato'` ranks row E (English literal hit) above row B (Spanish stem hit only). This proves F2=d (multi-config) is wired — without the English index, both rows would rank equally via Spanish stemming alone.
  - **Ranking — recency tiebreaker (SD4-c)**: two rows with identical text content ordered by `created_at DESC`.
- [ ] 6.3 DTO test: `q` over 200 chars rejected by `@MaxLength(200)`.
- [ ] 6.4 INT plan-check: in the FTS INT spec, run `EXPLAIN` on a `q`-bearing query and assert the output references `ix_audit_log_fts_es` and/or `ix_audit_log_fts_en` — surfaces drift between migration and service expressions immediately in CI.

## 7. Verification

- [ ] 7.1 `openspec validate m2-audit-log-fts` passes.
- [ ] 7.2 `npx jest --runInBand` (apps/api) — full suite green; ≥6 net new unit tests + INT scenarios per §6.2.
- [ ] 7.3 Lint clean across workspaces.
- [ ] 7.4 Build green.

## 8. CI + landing

- [ ] 8.1 Implementation pushed; CI green.
- [ ] 8.2 Admin-merge once required checks pass.
- [ ] 8.3 Archive `openspec/changes/m2-audit-log-fts/` → `openspec/specs/m2-audit-log-fts/`.
- [ ] 8.4 Write `retros/m2-audit-log-fts.md`.
- [ ] 8.5 Update auto-memory `project_m1_state.md` — Wave 1.11 closed.
- [ ] 8.6 File follow-ups (only those still warranted post-merge):
  - `m2-audit-log-fts-weighted` — `setweight()` to boost `reason`+`snippet` over `payload_*`.
  - `m2-audit-log-fts-trigram` — `pg_trgm` index for substring matching.
  - `m2-audit-log-fts-highlight` — `ts_headline` for matched-text snippets in the response.
  - `m2-audit-log-fts-lang-hint` — optional `lang` param to skip the unused config.
  - `m2-audit-log-fts-online-build` — refactor migration to use `CREATE INDEX CONCURRENTLY` if audit_log grows past ~10M rows.
