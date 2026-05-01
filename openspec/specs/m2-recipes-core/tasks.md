## 1. Cycle detector utility

- [x] 1.1 Implement `apps/api/src/recipes/cycle-detector.ts` — DFS with visited-set + back-edge detection
- [x] 1.2 Configurable depth cap (default 10); throws `DepthLimitError` when exceeded
- [x] 1.3 Cycle error returns `{code: "CYCLE", node1Id, node1Name, node2Id, node2Name, direction}`
- [x] 1.4 Unit tests: 20+ fixtures (no-cycle, direct cycle, indirect, deep chain, branching)

## 2. RecipesService

- [x] 2.1 `create(orgId, userId, dto)` — validates lines, runs CycleDetector, persists Recipe + RecipeIngredients in one transaction
- [x] 2.2 `findAll(orgId, filters)` — supports `selectableForSubRecipe=true` filter (excludes `isActive=false`)
- [x] 2.3 `findOne(orgId, id)` — includes RecipeIngredient lines + nested sub-recipe payloads (depth-1 expansion)
- [x] 2.4 `update(orgId, userId, id, dto)` — runs CycleDetector against new graph; refreshes `updatedBy`/`updatedAt`
- [x] 2.5 `softDelete(orgId, userId, id)` — sets `isActive=false`; rejects if active MenuItems reference it (return 409 with names)
- [x] 2.6 Discontinued-badge synthesis: when `isActive=false`, response payload adds `displayLabel="(Discontinued)"`

## 3. RecipesController + RBAC

- [x] 3.1 `POST /recipes` — Owner+Manager only
- [x] 3.2 `GET /recipes` — all roles (Staff included for read)
- [x] 3.3 `GET /recipes/:id` — all roles
- [x] 3.4 `PUT /recipes/:id` — Owner+Manager only
- [x] 3.5 `DELETE /recipes/:id` — Owner+Manager only (soft-delete)
- [x] 3.6 RBAC guard wired against existing `RolesGuard`

## 4. RecipePicker UI component

- [ ] 4.1 Create `packages/ui-kit/src/recipe-picker/` with TypeScript + accessibility (ARIA combobox)
- [ ] 4.2 Search-by-name with debounced query against `GET /recipes?q=&selectableForSubRecipe=true`
- [ ] 4.3 Render Discontinued items differently when shown in existing-ref context (faded + badge)
- [ ] 4.4 Storybook story covering default, empty, loading, with-discontinued states
- [ ] 4.5 Unit tests + Playwright smoke test

## 5. Tests

- [x] 5.1 E2E: create A → create B referencing A → attempt to make A reference B → 422 with cycle error including both names
- [x] 5.2 E2E: depth-cap exceeded returns 422 with code DEPTH_LIMIT
- [x] 5.3 E2E: soft-delete with active MenuItem refs returns 409
- [ ] 5.4 E2E: Staff cannot POST/PUT/DELETE; can GET
- [x] 5.5 E2E: cross-org isolation — user from org A cannot read Recipe from org B (404 not 403)

## 6. Verification

- [x] 6.1 Run `openspec validate m2-recipes-core` — must pass
- [ ] 6.2 Recipe view <1s slow Wi-Fi NFR check (lighthouse / DevTools throttling)
- [ ] 6.3 Manual smoke: Journey 1 + Journey 4 walkthroughs in staging
