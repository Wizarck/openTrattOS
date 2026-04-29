## 1. MenuItemsService

- [ ] 1.1 `create(orgId, userId, dto)` — validates Recipe + Location refs, applies composite-uniqueness check, persists
- [ ] 1.2 `findOne(orgId, id)` — returns MenuItem with inherited Recipe status (Discontinued badge synthesis)
- [ ] 1.3 `update(orgId, userId, id, dto)` — updates `sellingPrice`, `targetMargin`, `channel`; refreshes audit fields
- [ ] 1.4 `softDelete(orgId, userId, id)` — sets `isActive=false`
- [ ] 1.5 `getMargin(orgId, id)` — calls `#3 m2-cost-rollup-and-audit` `liveRecipeCost`, computes margin, returns with status colour
- [ ] 1.6 Status thresholds per ADR-016: green ≥target, amber within 5pp below, red >5pp below
- [ ] 1.7 NO_SOURCE handling: if cost unavailable, return `{cost: null, status: "unknown", warning}` instead of 5xx

## 2. Migration + constraints

- [ ] 2.1 Composite unique index migration: `(organization_id, recipe_id, location_id, channel) WHERE is_active = true`
- [ ] 2.2 CHECK constraint on `channel` enum values
- [ ] 2.3 Verify down-migration cleanly drops constraints

## 3. Endpoints

- [ ] 3.1 `POST /menu-items` — Manager+ only
- [ ] 3.2 `GET /menu-items` — all roles; supports filter `?locationId=&channel=&isActive=`
- [ ] 3.3 `GET /menu-items/:id` — all roles; includes Discontinued badge if applicable
- [ ] 3.4 `PUT /menu-items/:id` — Manager+ only
- [ ] 3.5 `DELETE /menu-items/:id` — Owner+Manager only (soft-delete)
- [ ] 3.6 `GET /menu-items/:id/margin` — all roles; returns full margin report

## 4. UI components

- [ ] 4.1 `packages/ui-kit/src/margin-panel/` — if not already shipped by `#3`, ship here; consumed by `#3` and `#9` too
- [ ] 4.2 Status colour paired with text label ("On target" / "Below target by Xpp" / "At risk" / "Cost unknown")
- [ ] 4.3 Storybook stories: green / amber / red / unknown / discontinued / cross-org-blocked
- [ ] 4.4 ARIA: status colour announced via `aria-label`, never colour-only

## 5. Tests

- [ ] 5.1 Unit: composite-uniqueness rejects duplicate
- [ ] 5.2 Unit: status thresholds (green/amber/red boundaries)
- [ ] 5.3 Unit: NO_SOURCE returns "unknown" status without crashing
- [ ] 5.4 Unit: invalid channel rejected
- [ ] 5.5 E2E: Manager creates MenuItem; Staff GET works; Staff POST 403
- [ ] 5.6 E2E: Recipe soft-delete propagates Discontinued badge to dependent MenuItem
- [ ] 5.7 Performance: `GET /menu-items/:id/margin` p95 <200ms

## 6. Verification

- [ ] 6.1 Run `openspec validate m2-menus-margins` — must pass
- [ ] 6.2 Manual smoke: Journey 1 final step (chef saves Recipe → creates MenuItem)
- [ ] 6.3 Manual smoke: Recipe price change reflects in MenuItem margin within 200ms
