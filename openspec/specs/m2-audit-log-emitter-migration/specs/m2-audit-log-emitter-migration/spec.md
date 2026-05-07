# Spec: m2-audit-log-emitter-migration

> Wave 1.18. Acceptance scenarios for migrating 5 cost.* legacy event channels to envelope shape.

## Scenario: WHEN any of the 5 legacy channels emit, THEN the bus carries an AuditEventEnvelope

```
GIVEN  Any code path that today emits one of:
         - INGREDIENT_OVERRIDE_CHANGED
         - RECIPE_ALLERGENS_OVERRIDE_CHANGED
         - RECIPE_SOURCE_OVERRIDE_CHANGED
         - RECIPE_INGREDIENT_UPDATED
         - SUPPLIER_PRICE_UPDATED
WHEN   The emit site runs after this slice
THEN   The payload structurally matches AuditEventEnvelope:
         { organizationId, aggregateType, aggregateId, actorUserId|null,
           actorKind, payloadAfter, [reason], [agentName] }
       AND The aggregateType matches the channel's domain object
       AND The aggregateId is the entity UUID (recipeId, ingredientId, supplierItemId)
       AND The BC-specific fields previously at the root (recipeIngredientId,
            sourceOverrideRef, field, kind, ingredientId-on-supplier-event)
            now live in payloadAfter as flat keys.
```

## Scenario: WHEN the subscriber receives a legacy-channel envelope, THEN it persists as-is

```
GIVEN  AuditLogSubscriber's @OnEvent(INGREDIENT_OVERRIDE_CHANGED) handler
       OR any of the other 4 legacy-channel handlers
WHEN   The handler fires with a valid envelope
THEN   The handler delegates directly to persistEnvelope(channel, payload)
       AND The handler does NOT translate per-type fields
       AND The persisted audit_log row's event_type, aggregate_type,
            aggregate_id, payload_after are byte-identical to the
            pre-migration baseline.
```

## Scenario: WHEN cost.service handles SUPPLIER_PRICE_UPDATED, THEN it reads ingredientId from payloadAfter

```
GIVEN  cost.service.onSupplierPriceUpdated handler is registered for the channel
WHEN   The bus delivers an AuditEventEnvelope with:
         organizationId='org-1', aggregateType='supplier_item',
         aggregateId='si-1', payloadAfter={ ingredientId: 'ing-1' }
THEN   The handler reads evt.organizationId AND evt.payloadAfter.ingredientId
       AND It calls recipesUsingIngredient('org-1', 'ing-1')
       AND For each recipe id, calls recordSnapshot('org-1', recipeId,
            'SUPPLIER_PRICE_CHANGE')
       AND Behaviour is identical to the pre-migration legacy event shape.
```

## Scenario: WHEN cost.service handles RECIPE_INGREDIENT_UPDATED or RECIPE_SOURCE_OVERRIDE_CHANGED, THEN it reads recipeId from aggregateId

```
GIVEN  cost.service handler is registered for either channel
WHEN   The bus delivers an envelope with aggregateType='recipe',
       aggregateId='rec-1', organizationId='org-1'
THEN   The handler reads evt.organizationId AND evt.aggregateId
       AND It calls recordSnapshot('org-1', 'rec-1', appropriate-reason)
       AND Behaviour is identical to the pre-migration legacy shape.
```

## Scenario: WHEN dashboard.service handles SUPPLIER_PRICE_UPDATED, THEN it reads supplierItemId from aggregateId

```
GIVEN  dashboard.service.handleSupplierPriceUpdated handler is registered
WHEN   The bus delivers an envelope with aggregateType='supplier_item',
       aggregateId='si-1', organizationId='org-1'
THEN   The handler reads evt.organizationId AND evt.aggregateId (=supplierItemId)
       AND It invalidates cache entries with `${organizationId}|` prefix
       AND It logs the supplierItemId for diagnostics.
```

## Scenario: WHEN labels.service handles INGREDIENT_OVERRIDE_CHANGED or RECIPE_ALLERGENS_OVERRIDE_CHANGED, THEN it flushes its cache without reading any field

```
GIVEN  labels.service handlers are registered for both channels
WHEN   Either handler fires with any envelope shape
THEN   The handler calls cache.clear()
       AND It does NOT read any field from the envelope (cache flush is
            unconditional; the legacy ad-hoc shape never carried fields it
            cared about).
```

## Scenario: WHEN code or tests still reference legacy event interfaces, THEN compilation fails

```
GIVEN  The 5 legacy interfaces (SupplierPriceUpdatedEvent,
       RecipeIngredientUpdatedEvent, RecipeSourceOverrideChangedEvent,
       RecipeAllergensOverrideChangedEvent, IngredientOverrideChangedEvent)
       are deleted from cost/application/cost.events.ts
WHEN   tsc runs against apps/api
THEN   No compile errors are reported (every reference has been migrated)
       AND `grep -rn 'SupplierPriceUpdatedEvent' apps/api/src` returns 0
       AND The 4 other legacy interface names are likewise absent.
```

## Scenario: WHEN persisted audit_log rows are read after the migration, THEN their shape is identical to pre-migration

```
GIVEN  An equivalent emit-site action before vs after this slice
       (e.g. an Owner overrides an ingredient's allergen field)
WHEN   The audit_log row is persisted in either world
THEN   The row's event_type, aggregate_type, aggregate_id, actor_user_id,
       actor_kind, agent_name, payload_before, payload_after, reason are
       structurally equivalent
       AND Operator queries (GET /audit-log) return functionally identical
            results across the migration boundary.
```
