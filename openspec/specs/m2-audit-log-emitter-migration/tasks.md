# Tasks: m2-audit-log-emitter-migration

> Wave 1.18. 3 stages, single PR. Slice #3 of 4.

## Stage 1 — Consumers read from envelope

- [ ] `apps/api/src/cost/application/cost.service.ts` — update 3 handlers (`onSupplierPriceUpdated`, `onRecipeIngredientUpdated`, `onRecipeSourceOverrideChanged`) to accept `AuditEventEnvelope` parameter; read `evt.organizationId`, `evt.aggregateId`, `evt.payloadAfter.X` per the mapping table.
- [ ] `apps/api/src/cost/application/cost.service.spec.ts` — adapt fixture builders for the 3 handler tests.
- [ ] `apps/api/src/dashboard/application/dashboard.service.ts` — update `handleSupplierPriceUpdated` to envelope.
- [ ] `apps/api/src/dashboard/application/dashboard.service.spec.ts` — adapt fixture builder.
- [ ] `apps/api/src/labels/application/labels.service.ts` — update parameter type on `onIngredientOverrideChanged` + `onRecipeAllergensOverrideChanged` (no field reads inside).
- [ ] `apps/api/src/labels/application/labels.service.spec.ts` — adapt the 2 fixtures emitting these channels.
- [ ] Run apps/api unit suite green at end of stage.

## Stage 2 — Emit sites + subscriber + delete legacy interfaces (atomic)

- [ ] `apps/api/src/ingredients/application/ingredients.service.ts` — emit envelope on INGREDIENT_OVERRIDE_CHANGED.
- [ ] `apps/api/src/recipes/application/recipes-allergens.service.ts` — emit envelope on RECIPE_ALLERGENS_OVERRIDE_CHANGED.
- [ ] `apps/api/src/recipes/application/recipes.service.ts` — emit envelope on RECIPE_SOURCE_OVERRIDE_CHANGED + RECIPE_INGREDIENT_UPDATED.
- [ ] `apps/api/src/suppliers/interface/supplier-items.controller.ts` — emit envelope on the 3 SUPPLIER_PRICE_UPDATED sites.
- [ ] `apps/api/src/audit-log/application/audit-log.subscriber.ts` — replace the 5 translator handlers with `persistEnvelope`-based ones; delete the now-unused `persistTranslated` private method; remove imports of the 5 legacy event interfaces.
- [ ] `apps/api/src/cost/application/cost.events.ts` — delete the 5 legacy event interfaces (`SupplierPriceUpdatedEvent`, `RecipeIngredientUpdatedEvent`, `RecipeSourceOverrideChangedEvent`, `RecipeAllergensOverrideChangedEvent`, `IngredientOverrideChangedEvent`). Keep channel constants. Keep `SubRecipeCostChangedEvent` + `AgentActionExecutedEvent`.
- [ ] `apps/api/src/audit-log/application/audit-log.subscriber.spec.ts` — adapt 5 tests' fixture shapes to envelope (assertions stay the same).
- [ ] `apps/api/src/audit-log/application/audit-log.subscriber.ts` — also adapt validateEnvelope's call site or leave (it already accepts envelope shape directly).
- [ ] grep checks: 0 references to deleted interfaces.

## Stage 3 — Verification + PR + Gate F

- [ ] `npm run build --workspace=apps/api` clean.
- [ ] `npm run lint --workspace=apps/api` clean.
- [ ] `npm test --workspace=apps/api` green; net delta TBD (tests adapted, no new ones expected).
- [ ] grep `IngredientOverrideChangedEvent\|RecipeIngredientUpdatedEvent\|RecipeSourceOverrideChangedEvent\|RecipeAllergensOverrideChangedEvent\|SupplierPriceUpdatedEvent` in apps/api/src returns zero.
- [ ] PR `proposal(m2-audit-log-emitter-migration): legacy translators → envelope shape (Wave 1.18)`.
- [ ] CI green; squash-merge.
- [ ] Retro `retros/m2-audit-log-emitter-migration.md`.
- [ ] Memory updates: `project_m1_state.md` + `MEMORY.md`.
