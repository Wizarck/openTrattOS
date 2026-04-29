## Context

A Recipe is a cost; a MenuItem is the actual sellable thing — Recipe × Location × Channel with sellingPrice and target margin. The same Recipe (e.g. tagliatelle bolognesa) can be sold in 3 Locations on 2 Channels (dine-in, delivery) with different prices, mapping to 6 MenuItems. ADR-016 governs margin status colour. This slice unblocks `#9 m2-owner-dashboard` (top/bottom-5 ranking).

## Goals / Non-Goals

**Goals:**
- MenuItem CRUD (FR29–32): create / read / update / soft-delete.
- Read-time margin computation: `sellingPrice − liveRecipeCost` (absolute and %), status colour per ADR-016 (FR31).
- Margin report per MenuItem (FR32).
- `MarginPanel` UI component (shared with `#3`; either ships first, idempotent).
- RBAC: Owner/Manager write; Staff read-only.

**Non-Goals:**
- Top/bottom-5 ranking: `#9`.
- AI yield/waste suggestions: `#6`.

## Decisions

- **Composite uniqueness on `(orgId, recipeId, locationId, channel)`**: a Recipe can only have one MenuItem per Location+Channel. **Rationale**: prevents double-bookkeeping (two MenuItems for the same dish in the same place). Constraint enforced at DB level.
- **`channel` as enum** (`dine-in`, `delivery`, `takeaway`, `catering`, `other`). **Rationale**: small fixed set in M2; avoids free-text data quality issues. Future additions are migrations.
- **Margin computation read-time, not stored**. **Rationale**: cost changes upstream invalidate stored margin. Same pattern as `#3` cost rollup.
- **Status colour from ADR-016**: green = margin ≥ target, amber = within 5pp below target, red = >5pp below. Paired with text label per accessibility rules (NFR — never colour-only).
- **`MarginPanel` shared with `#3`**: whichever lands first ships the component; the other change consumes it. Component lives in `packages/ui-kit/`.

## Risks / Trade-offs

- [Risk] Channel taxonomy too rigid for some clients. **Mitigation**: include `other` enum value as escape hatch; M3 may extend.
- [Risk] Margin computation latency on large catalogs (e.g. 500 MenuItems). **Mitigation**: read-time per item but cached for 60s in dashboard contexts (`#9`); single-MenuItem view always live.
- [Risk] Soft-delete semantics for MenuItems referencing soft-deleted Recipes (`#2` Discontinued badge). **Mitigation**: MenuItem inherits the badge from its Recipe; UI shows both states clearly.

## Migration Plan

Steps:
1. MenuItemsService + MenuItemsController in `apps/api/src/menu-items/`.
2. Composite-unique index migration on `(organization_id, recipe_id, location_id, channel)`.
3. Margin computation depends on `#3 m2-cost-rollup-and-audit`'s `liveRecipeCost` accessor; if `#3` not yet merged, MenuItemsService stub returns 503 with informative error.
4. `MarginPanel` UI in `packages/ui-kit/src/margin-panel/` (or consume from `#3` if already merged).
5. RBAC: existing `RolesGuard` enforces Manager+ for writes.

Rollback: revert; `#1` schema remains. Other slices (`#9`) stub their MenuItem reads.

## Open Questions

(none.)
