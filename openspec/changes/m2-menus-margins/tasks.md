## 1. MenuItemsService

- [x] 1.1 `create(orgId, dto)` — validates Recipe + Location refs (typed errors when missing); applies composite-uniqueness check via partial unique index on `(organizationId, recipeId, locationId, channel) WHERE is_active = true`; persists. Surfaces unique-violation as `MenuItemDuplicateError`.
- [x] 1.2 `findOne(orgId, id)` — returns `MenuItemView { menuItem, displayLabel, recipeDiscontinued }`. `displayLabel` synthesises the Discontinued suffix when the parent Recipe is soft-deleted.
- [x] 1.3 `update(orgId, id, dto)` — channel / sellingPrice / targetMargin via `applyUpdate`; refreshes `updatedBy`; honours composite uniqueness on channel rotation.
- [x] 1.4 `softDelete(orgId, id)` — sets `isActive=false`. Inactive rows are excluded from the partial unique index, so recreation of the (recipe, location, channel) combo is allowed afterwards.
- [x] 1.5 `getMargin(orgId, id)` — calls `CostService.computeRecipeCost`; computes absolute + percent margin + Δ vs target. Currency comes from CostService (org currency).
- [x] 1.6 Status thresholds per ADR-016 — `MenuItemsService.classify(marginVsTargetPp)`: `on_target` ≥ 0; `below_target` within 5pp below; `at_risk` > 5pp below; `unknown` when cost null.
- [x] 1.7 NO_SOURCE handling: when CostService throws `CostRecipeNotFoundError`, when ANY component is `unresolved`, or when any other upstream error fires, return `{ cost: null, status: 'unknown', warnings: [...] }` instead of 5xx.

## 2. Migration + constraints

- [x] 2.1 Migration `0013_menu_items_unique_per_recipe_location_channel.ts` adds partial unique index `uq_menu_items_active_recipe_location_channel ON menu_items (organization_id, recipe_id, location_id, channel) WHERE is_active = true`.
- [x] 2.2 Existing `ck_menu_items_channel_enum` CHECK from migration `0009` already enforces channel enum — no extra work in this slice.
- [x] 2.3 Down-migration cleanly drops the unique index (only this slice's contribution; foundation tables stay).

## 3. Endpoints

- [x] 3.1 `POST /menu-items` — Owner+Manager only
- [x] 3.2 `GET /menu-items?organizationId=…&locationId=…&channel=…&isActive=…` — all roles; filter optional
- [x] 3.3 `GET /menu-items/:id?organizationId=…` — all roles; surfaces `displayLabel` + `recipeDiscontinued`
- [x] 3.4 `PUT /menu-items/:id?organizationId=…` — Owner+Manager only
- [x] 3.5 `DELETE /menu-items/:id?organizationId=…` — Owner+Manager only (soft-delete; 204)
- [x] 3.6 `GET /menu-items/:id/margin?organizationId=…` — all roles; full `MarginReport` with status colour + label + warnings

## 4. UI components

- [ ] 4.1 `packages/ui-kit/src/margin-panel/` — DEFERRED to UX track (shared with `#3 m2-cost-rollup-and-audit`)
- [ ] 4.2 Status colour paired with text label — DEFERRED (component-level concern)
- [ ] 4.3 Storybook stories — DEFERRED
- [ ] 4.4 ARIA: status colour announced via `aria-label`, never colour-only — DEFERRED

## 5. Tests

- [x] 5.1 Unit: composite-uniqueness rejects duplicate (`MenuItemDuplicateError`)
- [x] 5.2 Unit: status thresholds across boundaries (`classify(0)`, `classify(-0.05)`, `classify(-0.0501)`, etc.)
- [x] 5.3 Unit: NO_SOURCE returns "unknown" status without crashing (3 cases: unresolved component, `CostRecipeNotFoundError`, generic `Error`)
- [x] 5.4 Unit: invalid channel rejected at the entity factory (already covered in `m2-data-model`'s `menu-item.entity.spec.ts`); mirrored at DTO validation.
- [x] 5.5 INT (Docker-deferred): `menu-items.service.int.spec.ts` covers create + duplicate + recreate-after-softdelete + Discontinued-badge propagation.
- [x] 5.6 INT (Docker-deferred): Recipe soft-delete propagates Discontinued badge to dependent MenuItem displayLabel (covered in `menu-items.service.int.spec.ts`).
- [x] 5.7 Performance: `menu-items.service.perf.spec.ts` asserts p95 <200ms across 50 samples (in-process; DB latency not modelled — same pattern as `cost.service.perf.spec.ts`).

## 6. Verification

- [x] 6.1 Run `openspec validate m2-menus-margins` — must pass
- [ ] 6.2 Manual smoke: Journey 1 final step (chef saves Recipe → creates MenuItem) — DEFERRED to first staging deploy
- [ ] 6.3 Manual smoke: Recipe price change reflects in MenuItem margin within 200ms — DEFERRED
