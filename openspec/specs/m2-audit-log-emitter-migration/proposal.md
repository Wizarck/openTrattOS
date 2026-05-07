# Proposal: m2-audit-log-emitter-migration

> **Wave 1.18** — Migrates the 5 `cost.*` legacy event channels (INGREDIENT_OVERRIDE_CHANGED / RECIPE_ALLERGENS_OVERRIDE_CHANGED / RECIPE_SOURCE_OVERRIDE_CHANGED / RECIPE_INGREDIENT_UPDATED / SUPPLIER_PRICE_UPDATED) from ad-hoc per-event payload shapes to the canonical `AuditEventEnvelope`. Eliminates the 5 per-type translators in `AuditLogSubscriber`. **Slice #3 of the user's 4-slice backend tech-debt batch.**

## Problem

Wave 1.9 (`m2-audit-log`) shipped the canonical `audit_log` table + `AuditLogSubscriber`. New event types (AI suggestions accept/reject, recipe cost rebuilt, agent forensic) emit the canonical `AuditEventEnvelope` shape directly; the subscriber persists them as-is. **Five legacy channels (one from cost / ingredients / recipes / supplier-items each, plus the agent.action-executed lean channel) keep their pre-Wave-1.9 ad-hoc payload shapes**; the subscriber translates each one per-type into the envelope before persistence.

The Wave 1.9 retro flagged the translators as a deliberate scope reduction: instead of migrating 7 emit sites + 3 non-audit `@OnEvent` consumer services (cost / dashboard / labels) atomically, the slice translated at the subscriber. ADR-025 (Wave 1.14) reinforced the intent — **new code MUST emit envelope shape; legacy translators are scoped to remain until `m2-audit-log-emitter-migration` ships**. That follow-up is this slice.

The lean `AGENT_ACTION_EXECUTED` channel from `AgentAuditMiddleware` stays as-is — it's intentionally request-anchored (per ADR-026 forensic split), and migrating it to envelope shape would erase the channel separation. The 5 cost.* legacy channels DO migrate.

Today's surface:

- **8 emit sites** for the 5 channels (1 ingredients, 1 recipes-allergens, 2 recipes, 4 suppliers).
- **11 `@OnEvent` consumers** across 4 services: 5 in `AuditLogSubscriber` (translators), 3 in `cost.service` (cost recompute), 1 in `dashboard.service` (cache invalidation), 2 in `labels.service` (cache invalidation).
- **5 typed event interfaces** in `cost/application/cost.events.ts` (`SupplierPriceUpdatedEvent`, `RecipeIngredientUpdatedEvent`, `RecipeSourceOverrideChangedEvent`, `RecipeAllergensOverrideChangedEvent`, `IngredientOverrideChangedEvent`).

After this slice:

- Emit sites publish `AuditEventEnvelope` with the BC-specific fields in `payloadAfter`.
- The subscriber's 5 translators become 5 trivial `persistEnvelope`-style handlers (channel-name documentation preserved).
- Non-audit consumers read fields off the envelope (root for `organizationId`, `aggregateId` for the primary identifier, `payloadAfter.X` for secondary fields).
- The 5 typed event interfaces are deleted from `cost.events.ts`.

## Goals

1. **All 5 emit sites publish envelope shape.** Every `events.emit(CHANNEL, ...)` call constructs an `AuditEventEnvelope<TBefore, TAfter>` with the right `aggregateType`, `aggregateId`, `actorUserId` / `actorKind`, and BC-specific fields in `payloadAfter`.
2. **Subscriber translators replaced with envelope handlers.** Each of the 5 `@OnEvent(...)` handlers becomes `return this.persistEnvelope(channel, envelope)` — same signature, no per-type field translation.
3. **Non-audit consumers read from envelope.**
   - `cost.service.onSupplierPriceUpdated` reads `evt.organizationId` (root) + `evt.payloadAfter.ingredientId`.
   - `cost.service.onRecipeIngredientUpdated` reads `evt.organizationId` (root) + `evt.aggregateId` (recipeId).
   - `cost.service.onRecipeSourceOverrideChanged` reads `evt.organizationId` (root) + `evt.aggregateId` (recipeId).
   - `dashboard.service.handleSupplierPriceUpdated` reads `evt.organizationId` (root) + `evt.aggregateId` (supplierItemId).
   - `labels.service.onIngredientOverrideChanged` and `onRecipeAllergensOverrideChanged`: no field reads (cache flush only); switch to envelope-typed parameter for clarity.
4. **Delete the 5 legacy event interfaces** from `cost/application/cost.events.ts`. Channel constants stay (the bus channel name is the `event_type` discriminator). Re-export the envelope types from a shared location if helpful for the emit sites.
5. **Audit_log row shape unchanged.** Operators querying `audit_log` see the same `event_type` + `aggregate_type` + `aggregate_id` + `payload_after` shape as today; the migration is mechanical at the publisher / consumer boundary, not at the persisted row level.

## Non-goals

- **Migrating `AGENT_ACTION_EXECUTED` (lean) to envelope shape.** Per ADR-026, the lean channel is intentionally request-anchored; the rich envelope path goes through `AGENT_ACTION_FORENSIC`. Out of scope.
- **Schema migration / data backfill.** Persisted rows are unchanged; only the in-memory event shape changes between emit and consume. No DB work.
- **Renaming the channel constants.** The bus channel names (`cost.ingredient-override-changed`, etc.) stay — they're the discriminator. Renaming would break operator dashboards and is unnecessary scope.
- **Deleting the SUB_RECIPE_COST_CHANGED legacy interface.** That channel does NOT have an audit subscriber (it's purely an internal cost-domain cascade event). It's NOT in scope for the migration; left as-is.
- **Tightening `payloadAfter` type discriminator.** TypeScript discriminated-union typing per channel is a follow-up (`m2-audit-log-emitter-typed-payloads`); today `payloadAfter: unknown` is fine.

## What changes (high level)

**`apps/api/src/cost/application/cost.events.ts`:**
- Delete the 5 legacy event interfaces: `SupplierPriceUpdatedEvent`, `RecipeIngredientUpdatedEvent`, `RecipeSourceOverrideChangedEvent`, `RecipeAllergensOverrideChangedEvent`, `IngredientOverrideChangedEvent`.
- Keep the 5 channel constants (`SUPPLIER_PRICE_UPDATED`, etc.) — they're the bus discriminator.
- Keep `SubRecipeCostChangedEvent` (different channel, no audit migration).
- Keep `AgentActionExecutedEvent` + `AGENT_ACTION_FORENSIC` (lean channel stays as-is per ADR-026).

**8 emit sites publish envelope:**
- `apps/api/src/ingredients/application/ingredients.service.ts` (1 site for INGREDIENT_OVERRIDE_CHANGED).
- `apps/api/src/recipes/application/recipes-allergens.service.ts` (1 site for RECIPE_ALLERGENS_OVERRIDE_CHANGED).
- `apps/api/src/recipes/application/recipes.service.ts` (2 sites: RECIPE_SOURCE_OVERRIDE_CHANGED + RECIPE_INGREDIENT_UPDATED).
- `apps/api/src/suppliers/interface/supplier-items.controller.ts` (3 sites for SUPPLIER_PRICE_UPDATED).
- `apps/api/src/labels/application/labels.service.spec.ts` (2 sites in tests; emit dummy envelopes).

Each emit site constructs:
```ts
events.emit(CHANNEL, {
  organizationId: ...,
  aggregateType: '...',
  aggregateId: ...,
  actorUserId: ...,  // null for system-driven
  actorKind: '...',  // 'user' | 'system'
  payloadAfter: { /* BC-specific fields */ },
  reason: '...',  // optional
} as AuditEventEnvelope);
```

**Subscriber translators → simple persistEnvelope:**
- `apps/api/src/audit-log/application/audit-log.subscriber.ts` — replace each of the 5 `onXxx()` translators with `persistEnvelope(CHANNEL, payload)`.

**Non-audit consumers read off envelope:**
- `apps/api/src/cost/application/cost.service.ts` (3 handlers).
- `apps/api/src/dashboard/application/dashboard.service.ts` (1 handler).
- `apps/api/src/labels/application/labels.service.ts` (2 handlers).

**Tests updated:**
- `audit-log.subscriber.spec.ts` — translator-shape tests removed; envelope-shape tests added (5 simple persistence assertions).
- `cost.service.spec.ts` + `dashboard.service.spec.ts` + `labels.service.spec.ts` — adapt event payload construction to envelope shape.
- INT specs (`recipes.service.int.spec.ts`, `recipes-allergens.service.int.spec.ts`, etc.) — adapt event-emission assertions if any read root fields.

## Acceptance

1. `grep -rn "SupplierPriceUpdatedEvent\|RecipeIngredientUpdatedEvent\|RecipeSourceOverrideChangedEvent\|RecipeAllergensOverrideChangedEvent\|IngredientOverrideChangedEvent" apps/api/src` returns zero matches (the legacy interfaces are deleted).
2. The 5 subscriber handlers each contain only a single statement: `return this.persistEnvelope(...)`. No per-type field translation logic remains.
3. Non-audit consumers (cost / dashboard / labels) compile against `AuditEventEnvelope` parameter types; their handler bodies read `evt.organizationId`, `evt.aggregateId`, `evt.payloadAfter.X` instead of legacy root-level fields.
4. apps/api unit suite passes (current 801 → ≥801; some tests adapted, no net new tests required).
5. apps/api INT suite passes against real Postgres; persisted `audit_log` rows are byte-identical for equivalent input events vs the pre-migration baseline.
6. Build clean, lint clean, CodeRabbit clean, Storybook unaffected.

## Risk + mitigation

- **Risk: a consumer reads a legacy field that's not in the envelope shape and silently drops behaviour.** Mitigation: TypeScript catches it at compile time (the interface change is the contract). Plus the per-handler unit tests assert behaviour explicitly.
- **Risk: a missed emit site stays on legacy shape; the subscriber's deleted translator means no audit row is written.** Mitigation: grep for legacy event interface usage + grep for `events.emit\(<CHANNEL_CONSTANT>` finds every emit site. INT spec coverage for cost service rollups exercises the cost cascade end-to-end.
- **Risk: subscriber's `validateEnvelope()` is too strict and rejects valid envelope payloads when emitter forgets `actorUserId` / `actorKind`.** Mitigation: deliberate decision — strict envelope validation IS the discipline. Emit sites that forget required fields surface the bug fast.
- **Risk: `payloadAfter` shape drift between emit and persist.** Mitigation: emit sites construct objects that match the audit_log row's expected `payload_after` shape. INT spec asserts row.payload_after content equals the emit-site object.

## Open questions

None at the time of writing — Gate D picks confirmed (envelope with BC-fields in payloadAfter / flat keys / preserve channel-per-handler / delete legacy interfaces).

## Related slices + threads

- Wave 1.9 `m2-audit-log` (`1e420a6`) — established the subscriber + envelope + hybrid translation pattern this slice eliminates the legacy half of.
- Wave 1.14 `m2-audit-log-forensic-split` (`339b039`) — codified ADR-025 with "legacy translators are scoped to remain until `m2-audit-log-emitter-migration` ships".
- Wave 1.16 `m2-mcp-bench-ci` (`772080e`) — slice #1 of this 4-slice batch.
- Wave 1.17 `m2-agent-credential-rotation` (`a5c2ce9`) — slice #2 of this 4-slice batch.

## Filed follow-ups

- `m2-audit-log-emitter-typed-payloads` — discriminated-union typing for `payloadAfter` per channel (today: `unknown`).
- `m2-audit-log-supplier-recipe-line-events` (filed in Wave 1.9) — capture SUPPLIER_PRICE_UPDATED + RECIPE_INGREDIENT_UPDATED forward-going (no historical persistence to backfill).
