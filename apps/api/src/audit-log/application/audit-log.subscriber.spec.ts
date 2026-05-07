import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { AuditLogSubscriber } from './audit-log.subscriber';
import { AuditEventTypeName } from './types';
import type { AuditEventEnvelope } from './types';
import type { AgentActionExecutedEvent } from '../../cost/application/cost.events';

const ORG = '00000000-0000-4000-8000-00000000aaaa';

describe('AuditLogSubscriber', () => {
  let subscriber: AuditLogSubscriber;
  let recordSpy: jest.Mock;

  beforeEach(async () => {
    recordSpy = jest.fn(async () => undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogSubscriber,
        { provide: AuditLogService, useValue: { record: recordSpy } },
      ],
    }).compile();
    subscriber = module.get(AuditLogSubscriber);
  });

  describe('cost-domain channels (envelope shape post-Wave-1.18)', () => {
    it('persists INGREDIENT_OVERRIDE_CHANGED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ingredient',
        aggregateId: 'ing-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { field: 'allergens' },
        reason: 'manager override',
      };
      await subscriber.onIngredientOverrideChanged(event);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [eventType, envelope] = recordSpy.mock.calls[0];
      expect(eventType).toBe(AuditEventTypeName['cost.ingredient-override-changed']);
      expect(envelope).toEqual(event);
    });

    it('persists RECIPE_ALLERGENS_OVERRIDE_CHANGED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: 'user-2',
        actorKind: 'user',
        payloadAfter: { kind: 'allergens-override' },
      };
      await subscriber.onRecipeAllergensOverrideChanged(event);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][1]).toEqual(event);
    });

    it('persists RECIPE_SOURCE_OVERRIDE_CHANGED envelope as-is (system actor)', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { recipeIngredientId: 'rl-1', sourceOverrideRef: 'sup-1' },
      };
      await subscriber.onRecipeSourceOverrideChanged(event);
      const [, envelope] = recordSpy.mock.calls[0];
      expect(envelope.actorKind).toBe('system');
      expect(envelope.actorUserId).toBeNull();
    });

    it('persists RECIPE_INGREDIENT_UPDATED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { recipeIngredientId: 'rl-2' },
      };
      await subscriber.onRecipeIngredientUpdated(event);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][1].payloadAfter).toEqual({ recipeIngredientId: 'rl-2' });
    });

    it('persists SUPPLIER_PRICE_UPDATED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'supplier_item',
        aggregateId: 'si-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { ingredientId: 'ing-1' },
      };
      await subscriber.onSupplierPriceUpdated(event);
      const [, envelope] = recordSpy.mock.calls[0];
      expect(envelope.aggregateType).toBe('supplier_item');
      expect(envelope.aggregateId).toBe('si-1');
      expect(envelope.actorKind).toBe('system');
    });

    it('translates AgentActionExecutedEvent (with org) — lean channel still uses translator', async () => {
      const event: AgentActionExecutedEvent = {
        executedBy: 'user-3',
        viaAgent: true,
        agentName: 'claude-desktop',
        capabilityName: 'recipes.read',
        organizationId: ORG,
        timestamp: '2026-05-06T11:42:08Z',
      };
      await subscriber.onAgentActionExecuted(event);
      const [, envelope] = recordSpy.mock.calls[0];
      expect(envelope.actorKind).toBe('agent');
      expect(envelope.agentName).toBe('claude-desktop');
      expect(envelope.aggregateType).toBe('organization');
      expect(envelope.aggregateId).toBe(ORG);
    });

    it('skips AgentActionExecutedEvent without organizationId', async () => {
      const event: AgentActionExecutedEvent = {
        executedBy: null,
        viaAgent: true,
        agentName: 'unknown',
        capabilityName: null,
        organizationId: null,
        timestamp: '2026-05-06T11:42:08Z',
      };
      await subscriber.onAgentActionExecuted(event);
      expect(recordSpy).not.toHaveBeenCalled();
    });
  });

  describe('new envelope-shaped events', () => {
    it('persists AI_SUGGESTION_ACCEPTED envelope as-is', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ai_suggestion',
        aggregateId: 'sug-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { status: 'accepted' },
        citationUrl: 'https://fdc.nal.usda.gov/x',
        snippet: 'USDA: ...',
      };
      await subscriber.onAiSuggestionAccepted(envelope);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [eventType, persisted] = recordSpy.mock.calls[0];
      expect(eventType).toBe('AI_SUGGESTION_ACCEPTED');
      expect(persisted).toEqual(envelope);
    });

    it('skips envelope-shaped event with missing required fields', async () => {
      const bad = { organizationId: ORG } as unknown as AuditEventEnvelope;
      await subscriber.onAiSuggestionAccepted(bad);
      expect(recordSpy).not.toHaveBeenCalled();
    });

    it('persists AI_SUGGESTION_REJECTED with reason', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ai_suggestion',
        aggregateId: 'sug-2',
        actorUserId: 'user-1',
        actorKind: 'user',
        reason: 'wrong region',
      };
      await subscriber.onAiSuggestionRejected(envelope);
      expect(recordSpy.mock.calls[0][1].reason).toBe('wrong region');
    });

    it('persists RECIPE_COST_REBUILT (system event)', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { reason: 'INITIAL', totalCost: 12.5, componentCount: 3 },
      };
      await subscriber.onRecipeCostRebuilt(envelope);
      expect(recordSpy).toHaveBeenCalledTimes(1);
    });

    it('persists AGENT_ACTION_FORENSIC envelope as-is (rich aggregate-anchored)', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: '00000000-0000-4000-8000-00000000bbbb',
        actorUserId: 'user-9',
        actorKind: 'agent',
        agentName: 'claude-desktop',
        payloadBefore: { name: 'before' },
        payloadAfter: { name: 'after' },
        reason: 'recipes.update',
      };
      await subscriber.onAgentActionForensic(envelope);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [eventType, persisted] = recordSpy.mock.calls[0];
      expect(eventType).toBe('AGENT_ACTION_FORENSIC');
      expect(persisted).toEqual(envelope);
    });

    it('skips AGENT_ACTION_FORENSIC payload missing envelope shape', async () => {
      const bad = { organizationId: ORG } as unknown as AuditEventEnvelope;
      await subscriber.onAgentActionForensic(bad);
      expect(recordSpy).not.toHaveBeenCalled();
    });

    it('AGENT_ACTION_FORENSIC swallows record() failure without re-throw', async () => {
      recordSpy.mockRejectedValueOnce(new Error('db down'));
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'menu_item',
        aggregateId: '00000000-0000-4000-8000-00000000cccc',
        actorUserId: null,
        actorKind: 'agent',
      };
      await expect(subscriber.onAgentActionForensic(envelope)).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('catches record() errors without re-throwing', async () => {
      recordSpy.mockRejectedValueOnce(new Error('db down'));
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ingredient',
        aggregateId: 'ing-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { field: 'allergens' },
        reason: 'x',
      };
      // Should NOT throw — the emitter must never see DB failures.
      await expect(subscriber.onIngredientOverrideChanged(event)).resolves.toBeUndefined();
    });

    it('skips a broken envelope payload without throwing', async () => {
      // Payload missing required envelope fields — validateEnvelope rejects.
      const broken = null as unknown as AuditEventEnvelope;
      await expect(subscriber.onIngredientOverrideChanged(broken)).resolves.toBeUndefined();
      expect(recordSpy).not.toHaveBeenCalled();
    });
  });
});
