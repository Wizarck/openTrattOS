# 2026-05-06 — `m2-audit-log-cleanup` archived as no-op

> **Decision date**: 2026-05-06
> **Decided by**: Owner + reviewing agent
> **Slice originally proposed in**: `retros/m2-audit-log.md` §"Things to file as follow-ups"
> **Verdict**: archived as no-op; replaced by 3 more-targeted follow-up slices (`m2-audit-log-cost-history-merge`, `m2-audit-log-fts`, `m2-audit-log-export`).

## Context

`m2-audit-log` (Wave 1.9, PR #90, squash `1e420a6`) shipped the canonical `audit_log` table + `@OnEvent` subscriber + cross-BC backfill. The retro filed a follow-up `m2-audit-log-cleanup` whose stated scope was:

> Drop redundant per-BC audit columns + tables now that audit_log is the canonical source: `recipe_cost_history` table, `ingredients.overrides` jsonb (or document as "current value, not history"), `recipes.aggregated_allergens_override` jsonb. Coordinate with consumers — labels.service / dashboard.service / cost.service may still read these as cache; cleanup must not break read paths.

A Gate D investigation before scoping the slice revealed that **none of the columns or tables listed are actually redundant**. The cleanup as proposed has zero targets.

## What the investigation found

Inventory of every "audit-shaped" column/table in the M2 schema and its actual role:

| Item | Role | Why NOT droppable |
|---|---|---|
| `recipe_cost_history` table | Per-component cost history (Journey 2 "what changed") | Read by `getHistory()` (`/cost-history` endpoint, default 14d window) and `computeCostDelta()` (per-component delta between two timestamps). The new `audit_log.payload_after` for `RECIPE_COST_REBUILT` events stores `{reason, totalCost, componentCount}` only — **NO per-component breakdown**. Dropping the table loses Journey 2 entirely. |
| `ingredients.overrides` jsonb | Current chef-applied override (read every time the entity is read) | The audit_log captures the *change event* with field name + actor + reason. The jsonb holds the *current value* applied at read time. Different shape, different consumer. |
| `recipes.aggregated_allergens_override` jsonb | Current Manager+ override on aggregated allergens | Same pattern as `ingredients.overrides` — current value, not history. |
| `recipes.diet_flags_override` jsonb | Current Manager+ override on diet flags | Same. |
| `recipes.cross_contamination_note` + `_allergens[]` | Current cross-contamination tag set | Same. |
| `ai_suggestions.acted_by_user_id` / `acted_at` / `accepted_value` / `rejected_reason` | Cache lookup load-bearing fields | The `ai_suggestions` cache excludes rejected rows + reuses accepted rows with chef tweaks. `effectiveValue()` reads `accepted_value` directly. Dropping these breaks cache logic + `applySuggestion` flow. |

**Conclusion**: every "audit-shaped" field in the existing per-BC tables either holds *current state* (the override/cache/tweak that gets applied at read time) or carries *richer per-component data* (cost history) that audit_log cannot replace. The audit_log captures change events; the per-BC columns hold current values + rich history. They are complements, not duplicates.

## What this means for the architecture

The slice's *intent* — close the loop on audit centralisation — is still valid. But the right way to close it is NOT a global drop; it's **targeted migrations**, slice by slice, where audit_log can subsume a specific concern:

- For `recipe_cost_history`: only droppable if the per-component breakdown moves into `audit_log.payload_after`, which is a real schema + endpoint migration. Filed as `m2-audit-log-cost-history-merge` (Wave 1.10).
- For override jsonb columns: NOT droppable at all (current state ≠ history).
- For `ai_suggestions` audit fields: NOT droppable (cache load-bearing).

## What we're shipping instead

Three follow-up slices that each do *targeted* work in the audit_log domain:

1. **`m2-audit-log-cost-history-merge` (Wave 1.10)** — extend `RECIPE_COST_REBUILT` payload to include per-component breakdown; migrate `/cost-history` + `/cost-delta` endpoints to read from audit_log; drop `recipe_cost_history` table after read paths verify.
2. **`m2-audit-log-fts` (Wave 1.11)** — Postgres FTS (`tsvector` + GIN) over `payload_before`, `payload_after`, `reason`, `snippet` so the chef can search "all changes that mention 'beef chuck'".
3. **`m2-audit-log-export` (Wave 1.12)** — `GET /audit-log/export.csv` streaming + paginated for offline analysis / compliance dumps.

After Wave 1.12 closes, the audit_log domain is "left well" and we move on to the next backlog item.

## Memory + retro updates

- This memo replaces the `m2-audit-log-cleanup` line item in the project state memory.
- The `retros/m2-audit-log.md` "Things to file as follow-ups" section's first bullet (`m2-audit-log-cleanup`) is **superseded by this memo**; the retro stays as historical context but readers should consult this file for the current decision.
- Three new slice candidates added to the backlog in `project_m1_state.md`.

## Lessons retained

- **Verify "audit-shaped" before assuming "redundant"**. Just because a column carries `appliedBy` / `appliedAt` / `reason` does not mean it's a candidate for centralisation — those fields can equally hold the current authoritative value of a per-entity override. Always check the read-paths before proposing a drop.
- **Follow-up bullets in retros are speculative until investigated**. The `m2-audit-log-cleanup` bullet was filed in the heat of the slice's retro authoring; a Gate D investigation 6 hours later showed it was based on a misreading of which columns were pure audit. Future retro authoring should mark such bullets as `_speculative — verify before scheduling_` or similar.
