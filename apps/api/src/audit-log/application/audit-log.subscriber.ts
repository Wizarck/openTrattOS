import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AgentActionExecutedEvent,
  IngredientOverrideChangedEvent,
  RecipeAllergensOverrideChangedEvent,
  RecipeIngredientUpdatedEvent,
  RecipeSourceOverrideChangedEvent,
  SupplierPriceUpdatedEvent,
} from '../../cost/application/cost.events';
import { AuditLogService } from './audit-log.service';
import {
  AuditEventEnvelope,
  AuditEventType,
  AuditEventTypeName,
} from './types';

/**
 * Single subscriber: persists one audit_log row per emitted event.
 *
 * Two payload shape conventions:
 * 1. **Legacy events** (already on the bus before this slice): published as
 *    ad-hoc shapes by cost / ingredients / recipes / supplier-items /
 *    agent-middleware. Translated to envelope per type by this subscriber.
 * 2. **New events introduced by this slice** (AI suggestions accept/reject,
 *    recipe cost rebuilt): emitter publishes the canonical
 *    `AuditEventEnvelope` shape directly; subscriber persists as-is.
 *
 * Each handler is wrapped in try/catch — a transient DB failure logs + drops
 * the row but does NOT propagate to the emitter (per ADR-AUDIT-WRITER).
 */
@Injectable()
export class AuditLogSubscriber {
  private readonly logger = new Logger(AuditLogSubscriber.name);

  constructor(private readonly auditLog: AuditLogService) {}

  // ------------- New events (envelope shape) -------------

  @OnEvent(AuditEventType.AI_SUGGESTION_ACCEPTED)
  onAiSuggestionAccepted(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.AI_SUGGESTION_ACCEPTED, payload);
  }

  @OnEvent(AuditEventType.AI_SUGGESTION_REJECTED)
  onAiSuggestionRejected(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.AI_SUGGESTION_REJECTED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_COST_REBUILT)
  onRecipeCostRebuilt(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_COST_REBUILT, payload);
  }

  // ------------- Legacy events (translate per-type) -------------

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

  @OnEvent(AuditEventType.RECIPE_ALLERGENS_OVERRIDE_CHANGED)
  onRecipeAllergensOverrideChanged(
    event: RecipeAllergensOverrideChangedEvent,
  ): Promise<void> {
    return this.persistTranslated(AuditEventType.RECIPE_ALLERGENS_OVERRIDE_CHANGED, () => ({
      organizationId: event.organizationId,
      aggregateType: 'recipe',
      aggregateId: event.recipeId,
      actorUserId: event.appliedBy ?? null,
      actorKind: 'user',
      payloadAfter: { kind: event.kind },
    }));
  }

  @OnEvent(AuditEventType.RECIPE_SOURCE_OVERRIDE_CHANGED)
  onRecipeSourceOverrideChanged(
    event: RecipeSourceOverrideChangedEvent,
  ): Promise<void> {
    return this.persistTranslated(AuditEventType.RECIPE_SOURCE_OVERRIDE_CHANGED, () => ({
      organizationId: event.organizationId,
      aggregateType: 'recipe',
      aggregateId: event.recipeId,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: {
        recipeIngredientId: event.recipeIngredientId,
        sourceOverrideRef: event.sourceOverrideRef,
      },
    }));
  }

  @OnEvent(AuditEventType.RECIPE_INGREDIENT_UPDATED)
  onRecipeIngredientUpdated(event: RecipeIngredientUpdatedEvent): Promise<void> {
    return this.persistTranslated(AuditEventType.RECIPE_INGREDIENT_UPDATED, () => ({
      organizationId: event.organizationId,
      aggregateType: 'recipe',
      aggregateId: event.recipeId,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: { recipeIngredientId: event.recipeIngredientId },
    }));
  }

  @OnEvent(AuditEventType.SUPPLIER_PRICE_UPDATED)
  onSupplierPriceUpdated(event: SupplierPriceUpdatedEvent): Promise<void> {
    return this.persistTranslated(AuditEventType.SUPPLIER_PRICE_UPDATED, () => ({
      organizationId: event.organizationId,
      aggregateType: 'supplier_item',
      aggregateId: event.supplierItemId,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: { ingredientId: event.ingredientId },
    }));
  }

  @OnEvent(AuditEventType.AGENT_ACTION_EXECUTED)
  onAgentActionExecuted(event: AgentActionExecutedEvent): Promise<void> {
    // Pre-auth probes can fire this with `organizationId === null`. We need an
    // organization to anchor the audit row, so skip in that case (logged at
    // info — forensics on unauthenticated requests is out of scope here).
    if (!event.organizationId) {
      this.logger.debug(
        `audit-log.subscriber.skipped: AGENT_ACTION_EXECUTED — no organizationId (pre-auth probe)`,
      );
      return Promise.resolve();
    }
    return this.persistTranslated(AuditEventType.AGENT_ACTION_EXECUTED, () => ({
      organizationId: event.organizationId as string,
      aggregateType: 'organization',
      aggregateId: event.organizationId as string,
      actorUserId: event.executedBy,
      actorKind: 'agent',
      agentName: event.agentName,
      payloadAfter: {
        capabilityName: event.capabilityName,
        timestamp: event.timestamp,
      },
    }));
  }

  // ------------- Internals -------------

  private async persistEnvelope(
    channel: AuditEventType,
    envelope: unknown,
  ): Promise<void> {
    const validated = this.validateEnvelope(envelope);
    if (validated === null) {
      this.logger.warn(
        `audit-log.subscriber.skipped: ${channel} — payload missing envelope shape`,
      );
      return;
    }
    try {
      await this.auditLog.record(AuditEventTypeName[channel], validated);
    } catch (err) {
      this.logError(channel, validated.aggregateId, err);
    }
  }

  private async persistTranslated(
    channel: AuditEventType,
    translate: () => AuditEventEnvelope,
  ): Promise<void> {
    let envelope: AuditEventEnvelope;
    try {
      envelope = translate();
    } catch (err) {
      this.logError(channel, '<unknown>', err);
      return;
    }
    try {
      await this.auditLog.record(AuditEventTypeName[channel], envelope);
    } catch (err) {
      this.logError(channel, envelope.aggregateId, err);
    }
  }

  private logError(channel: string, aggregateId: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(
      `audit-log.subscriber.error: ${channel} aggregate=${aggregateId} ${message}`,
    );
  }

  private validateEnvelope(payload: unknown): AuditEventEnvelope | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Partial<AuditEventEnvelope>;
    if (
      typeof candidate.organizationId !== 'string' ||
      typeof candidate.aggregateType !== 'string' ||
      typeof candidate.aggregateId !== 'string' ||
      (candidate.actorUserId !== null && typeof candidate.actorUserId !== 'string') ||
      (candidate.actorKind !== 'user' &&
        candidate.actorKind !== 'agent' &&
        candidate.actorKind !== 'system')
    ) {
      return null;
    }
    return candidate as AuditEventEnvelope;
  }
}
