# Design: m2-audit-log-emitter-migration

> Wave 1.18. Companion: `proposal.md`. Slice #3 of 4.

## Mapping table — legacy fields → envelope

| Channel                          | aggregateType    | aggregateId        | actorUserId          | actorKind | payloadAfter (BC-specific)                                |
|---|---|---|---|---|---|
| INGREDIENT_OVERRIDE_CHANGED      | `ingredient`     | ingredientId       | appliedBy ?? null    | `user`    | `{ field }`                                                |
| RECIPE_ALLERGENS_OVERRIDE_CHANGED| `recipe`         | recipeId           | appliedBy ?? null    | `user`    | `{ kind }`                                                 |
| RECIPE_SOURCE_OVERRIDE_CHANGED   | `recipe`         | recipeId           | null                 | `system`  | `{ recipeIngredientId, sourceOverrideRef }`                |
| RECIPE_INGREDIENT_UPDATED        | `recipe`         | recipeId           | null                 | `system`  | `{ recipeIngredientId }`                                   |
| SUPPLIER_PRICE_UPDATED           | `supplier_item`  | supplierItemId     | null                 | `system`  | `{ ingredientId }`                                         |

The `INGREDIENT_OVERRIDE_CHANGED` channel additionally carries `reason` at the envelope root (not under `payloadAfter`); the legacy interface had it as a top-level field and it semantically belongs at the envelope's `reason` slot.

## Consumer field mapping

```
cost.service.onSupplierPriceUpdated:
  evt.organizationId              → evt.organizationId  (root, unchanged)
  evt.ingredientId                → evt.payloadAfter.ingredientId

cost.service.onRecipeIngredientUpdated:
  evt.organizationId              → evt.organizationId  (root, unchanged)
  evt.recipeId                    → evt.aggregateId

cost.service.onRecipeSourceOverrideChanged:
  evt.organizationId              → evt.organizationId  (root, unchanged)
  evt.recipeId                    → evt.aggregateId

dashboard.service.handleSupplierPriceUpdated:
  evt.organizationId              → evt.organizationId  (root, unchanged)
  evt.supplierItemId              → evt.aggregateId

labels.service.onIngredientOverrideChanged:        no field reads (cache.clear())
labels.service.onRecipeAllergensOverrideChanged:   no field reads (cache.clear())
```

## Subscriber refactor shape

Today (5 translators, ~70 LOC):

```ts
@OnEvent(AuditEventType.INGREDIENT_OVERRIDE_CHANGED)
onIngredientOverrideChanged(event: IngredientOverrideChangedEvent): Promise<void> {
  return this.persistTranslated(AuditEventType.INGREDIENT_OVERRIDE_CHANGED, () => ({
    organizationId: event.organizationId,
    aggregateType: 'ingredient',
    aggregateId: event.ingredientId,
    actorUserId: event.appliedBy ?? null,
    actorKind: 'user',
    payloadAfter: { field: event.field },
    reason: event.reason,
  }));
}
// + 4 similar handlers for the other channels
```

After (5 simple handlers, ~25 LOC total):

```ts
@OnEvent(AuditEventType.INGREDIENT_OVERRIDE_CHANGED)
onIngredientOverrideChanged(payload: AuditEventEnvelope): Promise<void> {
  return this.persistEnvelope(AuditEventType.INGREDIENT_OVERRIDE_CHANGED, payload);
}
// + 4 similar handlers
```

Per Gate D F3, we keep the 5 separate handlers (one per channel) rather than collapsing into a generic handler. This preserves the channel-name documentation for future contributors AND lets unit tests assert per-channel behaviour.

The `persistTranslated()` private method becomes unused after this refactor. Delete it for clean removal.

## Stage plan

The slice is large enough to warrant a 4-stage breakdown so each stage can be verified independently before moving on. **Each stage is type-safe and runs the full unit test suite green** — no "intermediate broken state" stage.

**Stage 1 — Subscriber + interfaces.** Replace the 5 translator handlers with `persistEnvelope`-based handlers; delete the 5 legacy interfaces from `cost/application/cost.events.ts`; delete the now-unused `persistTranslated` method. **This stage breaks compile** because emit sites + non-audit consumers still use legacy types — but it's the cleanest atomic refactor unit. Move it to LAST in the stage order to keep each push compile-green.

**Revised stage plan:**

1. **Stage 1 — Emit sites publish envelope.** Update each of the 8 emit sites (one per call to `events.emit`). Each emit site builds the envelope inline. Tests that emit on these channels (e.g. `labels.service.spec.ts` test setup) update their fixture payloads. **The subscriber's translators still accept the legacy shape via the validateEnvelope path which already accepts envelope-shaped payloads as-is**, so this stage is forward-compatible. INT specs continue to pass because the persisted row matches.
2. **Stage 2 — Non-audit consumers read from envelope.** Update cost.service / dashboard.service / labels.service handlers + their unit tests. The handler parameter type changes from the deleted legacy interface to `AuditEventEnvelope`. Field reads change per the mapping table above. Compile-clean after this stage.
3. **Stage 3 — Subscriber refactor + delete legacy interfaces.** Now that emit sites + consumers all speak envelope, the 5 subscriber translators become trivial `persistEnvelope` handlers. Delete the 5 legacy event interfaces from `cost.events.ts`. Delete `persistTranslated`. Update the subscriber unit spec.
4. **Stage 4 — Verification + PR.** Full apps/api unit + INT + lint + build. Final grep checks confirm zero remaining references to legacy interfaces.

## Sub-decisions

### SD1 — Stage 1 emits envelope while subscriber still has translators (forward-compat)

The subscriber's `persistTranslated()` builds the envelope from the legacy event shape; if the emit site already emits envelope shape, the translator's mapping function receives an envelope as input but treats it as the legacy shape — fields like `event.organizationId` resolve fine (envelope has it at root), `event.ingredientId` resolves to `undefined` (envelope has it at `aggregateId`).

**That breaks Stage 1 in subtle ways.** The persisted `payloadAfter.field` would be `undefined` because the translator reads `event.field` and the envelope has it at `payloadAfter.field`. **Mitigation**: Stage 1 + Stage 3 must land together OR the subscriber must temporarily accept either shape during Stage 1 (an `if (isEnvelope) persistEnvelope else persistTranslated` branch).

**Decision: bundle Stage 1 + Stage 3 into a single commit ("emitters → envelope; subscriber → persistEnvelope; delete legacy interfaces").** Stage 2 (consumers) can be independent because consumer reads are field-by-field. Final stage plan:

1. **Stage 1 — Consumers read from envelope.** cost.service / dashboard.service / labels.service handlers updated to read envelope fields. Build green; tests adapted.
2. **Stage 2 — Emit sites + subscriber + interfaces (atomic).** All emit sites publish envelope; all 5 subscriber translators replaced with `persistEnvelope`; legacy interfaces deleted. Build green; tests adapted.
3. **Stage 3 — Verification + PR.**

This is the right shape. The slice is fundamentally a 2-commit refactor with cross-cutting churn.

### SD2 — `payloadAfter` flat keys vs nested

Picked flat keys per Gate D F2. `payloadAfter: { recipeIngredientId, sourceOverrideRef }` reads naturally and matches the existing translator's output. Nested (`payloadAfter: { data: {...} }`) adds a layer for no benefit at this scale.

### SD3 — Keep INGREDIENT_OVERRIDE_CHANGED's `reason` at envelope root

The legacy interface has `reason: string` at the root. The translator maps it to `envelope.reason`. The envelope has a top-level `reason` field (per the existing shape; used by AI suggestions for rejection reasons). After migration the emit site builds `{ ..., reason: 'manager override' }` at the envelope root, NOT under `payloadAfter`. Semantic match.

### SD4 — Test fixtures: keep representative spread

Some unit tests emit dummy events to exercise consumer behaviour (`labels.service.spec.ts` emits `INGREDIENT_OVERRIDE_CHANGED` to assert cache flush). These need updating to envelope shape. Fixture builders are usually one-line objects — easy to update.

### SD5 — INT spec assertion changes

INT specs that read persisted rows (e.g. `audit-log.service.int.spec.ts`) are unchanged because the row shape doesn't change. INT specs that exercise event emission as a side effect (e.g. `recipes.service.int.spec.ts` emitting RECIPE_INGREDIENT_UPDATED) might assert event payload shape — check during Stage 2 implementation.

## Test strategy

**Unit:**

- `audit-log.subscriber.spec.ts` — adapt the 5 translator-shape tests to envelope-shape inputs. The assertions stay (recordSpy received envelope with right `event_type`, `aggregate_type`, etc.). Net: same test count, same assertions, different fixture shape.
- `cost.service.spec.ts` — adapt tests that fire `SUPPLIER_PRICE_UPDATED` / `RECIPE_INGREDIENT_UPDATED` / `RECIPE_SOURCE_OVERRIDE_CHANGED` events; payload shape changes; behaviour unchanged.
- `dashboard.service.spec.ts` — adapt the SUPPLIER_PRICE_UPDATED test fixture.
- `labels.service.spec.ts` — adapt the 2 emit-and-flush tests.

**INT:**

- `audit-log.service.int.spec.ts` — no change (reads persisted rows).
- `cost.service.int.spec.ts` — adapt event payload shape assertions if any read root fields.
- `recipes-allergens.service.int.spec.ts` — same.

**Lint clean** is critical: deleting the legacy interfaces leaves dangling `import` lines. Run `npm run lint` after each stage to surface them.

## Out-of-scope follow-ups

Listed in proposal.md `Filed follow-ups`. Notable: `m2-audit-log-emitter-typed-payloads`, `m2-audit-log-supplier-recipe-line-events`.
