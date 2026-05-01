## Context

PRD-M1 v2.0 + ADRs 1-9 lock all major architectural bets for the foundation kernel: stack (Turborepo + NestJS + TypeORM + PostgreSQL), DDD modular monolith with bounded contexts under `apps/api/src/<ctx>/{domain,application,infrastructure,interface}/`, multi-tenant via `organizationId`, RBAC OWNER/MANAGER/STAFF, single-currency-per-org immutable, ES+EN i18n, soft-delete via `isActive`, basic audit via `createdBy`/`updatedBy`, no field-level audit log until M3. This design.md fills in the per-capability decisions needed to turn the PRD + ADRs into ~50 acceptance scenarios in `specs/module-1-ingredients-implementation/spec.md` and ~120 TDD-ordered tasks in `tasks.md` without forking architectural debates.

## Goals / Non-Goals

**Goals:**
- Land all 8 entities + 11 capability sections of PRD-M1 §4.1–4.10 in one slice (per Master decision: lightweight OpenSpec for M1, not re-sliced).
- Domain layer 100% unit-tested (PRD NFR §5 mandates UoM conversion 100%; we extend to all domain).
- API surface entirely typed (no `any`); cursor-based pagination on every list; Swagger annotations on every endpoint (ADR-002 agent-readable).
- `InventoryCostResolver` interface seam usable by M2 from day one (ADR-014).
- Lint posture restored to strict (no-unused-vars + no-explicit-any back to error) once stubs are replaced.

**Non-Goals:**
- Re-slice M1 into multiple changes. Master accepted single-slice for the foundation, even though slicing heuristics (per `runbook-bmad-openspec.md` §2.4) suggest splitting on >10 acceptance scenarios. Trade-off: one large PR vs ~6 PRs of churn for a foundation that already has approved PRD + ADRs.
- Frontend (`apps/web/`) — separate slicing post-M1 once API stabilises.
- Multi-currency, field-level audit, real auth issuance — explicit deferrals.

## Decisions

### D1 — Bounded contexts under `apps/api/src/`

Three M1 bounded contexts: **`shared/`** (Organization, Location, User — cross-context), **`catalog/`** (Category, UoM, Ingredient — the "what we cook with"), **`procurement/`** (Supplier, SupplierItem — the "where we buy"). Each context owns its own `domain/`, `application/`, `infrastructure/`, `interface/` subtrees per ADR-001 (DDD modular monolith). Cross-context communication via published interfaces only — `procurement.application` may import `catalog.domain.Ingredient` (read-side), but `catalog` never imports `procurement`. Lint rule blocks reverse-direction imports.

Rationale: aligns with ADR-001's "no direct entity imports across modules"; sets the structure M2's bounded contexts (Recipes / Menus / Labels) extend without restructuring.

### D2 — TypeORM data-mapper, not active-record

Use the data-mapper pattern (separate Repository class per entity) instead of active-record. Rationale: active-record couples persistence to the domain class — bad for DDD purity + makes domain unit-testing harder (every test would need TypeORM mocks). Data-mapper keeps the domain class POJO and isolates persistence to the repository.

### D3 — Migrations: monotonic numbering, one entity per migration

`apps/api/src/migrations/000N_<entity>.ts`, monotonic across all migrations in the slice (not per-context). Rationale per release-management.md §6.4: anti-collision contract for parallel waves. While M1 is a single slice (no parallelism), establishing the convention here means M2's parallel `m2-data-model` slice continues at `0009`, `0010`, ... without renumbering. One entity per migration keeps rollback granular.

### D4 — Cascade rules per ADR-010

- `organizationId` foreign key: `ON DELETE CASCADE` everywhere — deleting an Org wipes all child rows.
- `categoryId` on Ingredient: `RESTRICT` — cannot delete a Category that has Ingredients (PRD §4.8).
- `parentId` on Category (self-FK): `RESTRICT` — cannot delete a Category with children.
- `ingredientId` on SupplierItem: `CASCADE` — deleting an Ingredient cleans up its supplier records.
- `supplierId` on SupplierItem: `CASCADE`.
- `userId` on `createdBy`/`updatedBy`: `SET NULL` — user offboarding doesn't break audit data; the historical fact "someone created this" survives.

### D5 — UoM engine: pure function module, not an injectable service

The UoM conversion logic is **stateless math**: convert(value, fromUnit, toUnit, densityFactor?) → number | UoMError. Implement as pure functions in `apps/api/src/catalog/domain/uom/`, exported as a barrel module. No DI, no class. Rationale: testability (100% coverage trivially), reusability across application + infrastructure layers, no runtime stateful behaviour to mock.

Cross-family rules:
- WEIGHT ↔ WEIGHT: always allowed.
- VOLUME ↔ VOLUME: always allowed.
- UNIT ↔ UNIT: only same `unitType` (pcs ≠ box without quantity).
- WEIGHT ↔ VOLUME: requires `densityFactor` parameter; throw `UoMConversionRequiresDensityError` if missing.
- WEIGHT ↔ UNIT, VOLUME ↔ UNIT: always throw `UoMConversionForbiddenError`.

### D6 — Currency invariant

`Organization.currencyCode` is settable on `Organization.create()` only. Update DTO does NOT include `currencyCode`. Repository update method explicitly strips it if present. Validation: ISO 4217 3-letter regex. Rationale: ADR-007 immutability — changing currency mid-org would corrupt all historical `unitPrice` data. If a multi-currency feature lands later, it adds a per-supplier-invoice currency conversion at input time, not a per-org switch.

### D7 — RBAC via NestJS Guards on Controllers

Every controller method decorated with `@Roles('OWNER', 'MANAGER')` or `@Roles('STAFF', 'OWNER', 'MANAGER')` per the matrix in [personas-jtbd.md](../../../docs/personas-jtbd.md). A custom `RolesGuard` reads the JWT, extracts the user's role, and throws `403 Forbidden` if not permitted. Rationale: declarative + visible at the controller level (auditable via Swagger UI); no hand-rolled middleware.

### D8 — Audit middleware populates `createdBy`/`updatedBy`

A NestJS interceptor extracts the user ID from the JWT and writes it to the entity's `createdBy` (on insert) or `updatedBy` (on update). The application service NEVER receives `createdBy`/`updatedBy` in DTOs — the interceptor is the single source. Rationale: prevents tampering (a malicious DTO can't claim "createdBy = someone else"); unifies the "where does audit data come from" question to one place.

### D9 — i18n: backend error codes are language-agnostic; UI translates

Backend errors return a structured payload `{ code: "INGREDIENT_DUPLICATE_NAME", details: {...} }`. The UI (Swagger UI in M1, Next.js in later slices) translates `code` via `/locales/{es,en}.json`. Rationale: backend stays locale-free (testable in CI without translation files); UI handles per-user locale at render time. Category seed taxonomy is the exception — those rows have `nameEs` + `nameEn` columns directly because the names are content, not error codes.

### D10 — CSV Import: streaming + transaction-per-batch

For CSVs up to 10k rows (PRD §5 NFR), parse via `csv-parse` streaming API in chunks of 500 rows, validate each chunk against the Ingredient DTO, accumulate errors, and on dry-run return `{ valid: N, invalid: M, errors: [...] }` without persisting. On commit, wrap each 500-row chunk in a transaction so a partial failure mid-import doesn't leave half-imported state. Rationale: 10k rows in one transaction blocks Postgres for >2s; chunked transactions amortise the lock.

### D11 — `InventoryCostResolver` interface

The interface lives at `apps/api/src/catalog/domain/inventory-cost-resolver.ts` (per ADR-014):

```typescript
export interface InventoryCostResolver {
  resolveCostPerBaseUnit(ingredientId: string): Promise<{ cost: number; sourceRef: string }>;
}
```

M1 implementation: walks `SupplierItem` for the given ingredient, picks `isPreferred=true`, returns `costPerBaseUnit` + sourceRef = `supplier-item:<id>`. M2's `m2-cost-rollup-and-audit` consumes this interface; M3's batch-aware implementation replaces it without changing call sites.

## Risks / Trade-offs

- **[Risk] Single-slice scope**: this slice is large (~50 scenarios, ~120 tasks). PR review + AI-reviewer feedback loop is heavy. **Mitigation**: TDD-ordered tasks let reviewer skim by capability; the chef can pause review at any task boundary and resume.
- **[Risk] CSV import edge cases** (encoding, line endings, locale-formatted numbers): historically a foot-gun. **Mitigation**: validate `Content-Type: text/csv` + UTF-8 BOM stripping + explicit `decimal-separator: "."` requirement in the CSV format spec; non-conformant files reject with a clear error message.
- **[Trade-off] No frontend in M1**: admin surface is Swagger UI only. Owners + Managers will need to use the Swagger explorer to create their first Org, set currency, etc. **Acceptable** because (a) M1 is the foundation, not the demo, and (b) chef workflows happen in M2's UI.
- **[Trade-off] No real auth in M1**: JWT is consumed but not issued by this slice. **Mitigation**: a dev-only token-issuer endpoint with hardcoded test users; production auth is a separate slice once we choose between Auth0 / Clerk / self-hosted.

## Migration Plan

Steps:
1. Branch `slice/module-1-ingredients-implementation` from `master`; companion script captures Base SHA.
2. Domain entities + value objects (TDD red → green per entity).
3. Migrations + repositories + integration tests (Postgres in Docker).
4. Application services (use-cases) + unit tests.
5. Controllers + DTOs + E2E tests (supertest).
6. RBAC guards + auth middleware + audit interceptor.
7. UoM engine + 100% unit coverage.
8. Category seed + i18n bundle (`/locales/{es,en}.json`).
9. CSV Import / Export endpoints + streaming validation.
10. `InventoryCostResolver` M1 impl.
11. Re-tighten `apps/api/eslint.config.mjs` (remove the `warn` overrides; rules back to `error`).
12. Open PR; address CodeRabbit feedback; request Gate F.
13. Squash-merge → archive change → retro at `retros/module-1-ingredients-implementation.md`.

Rollback: if a regression surfaces post-merge, revert the squash-commit on `master` (single revert PR) and re-open the slice for fix work; data-model on a fresh DB is destroyed by the migration rollback.

## Open Questions

- **Auth issuance** (where does the JWT come from in dev / prod?): defer to follow-up slice. M1 ships consumer + dev-only test issuer; production decision (Auth0 vs Clerk vs self-hosted) is a separate slice.
- **Materialised path vs recursive CTE** for Category tree queries: defer to implementation; both are valid; picking at task time based on actual query patterns observed in tests.
