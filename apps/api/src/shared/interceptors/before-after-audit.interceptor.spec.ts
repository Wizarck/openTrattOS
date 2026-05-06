import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { lastValueFrom, of } from 'rxjs';
import { AuditEventType } from '../../audit-log/application/types';
import { AuditResolverRegistry } from '../application/audit-resolver-registry';
import { BeforeAfterAuditInterceptor } from './before-after-audit.interceptor';

function makeCtx(req: Partial<Request>, handler: () => unknown = () => {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req as Request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('BeforeAfterAuditInterceptor', () => {
  let events: { emit: jest.Mock };
  let reflector: Pick<Reflector, 'get'>;
  let resolvers: AuditResolverRegistry;
  let interceptor: BeforeAfterAuditInterceptor;

  const ORG = '11111111-1111-4111-8111-111111111111';
  const USER = '22222222-2222-4222-8222-222222222222';
  const ID = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    events = { emit: jest.fn() };
    reflector = { get: jest.fn() };
    resolvers = new AuditResolverRegistry();
    interceptor = new BeforeAfterAuditInterceptor(
      reflector as Reflector,
      events as unknown as EventEmitter2,
      resolvers,
    );
  });

  it('skips when viaAgent !== true (UI/REST traffic)', async () => {
    const ctx = makeCtx({ agentContext: undefined });
    const result$ = await interceptor.intercept(ctx, { handle: () => of('result') });
    await lastValueFrom(result$);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('skips when handler lacks @AuditAggregate metadata', async () => {
    (reflector.get as jest.Mock).mockReturnValue(undefined);
    const ctx = makeCtx({
      agentContext: { viaAgent: true, agentName: 'claude', capabilityName: null },
      user: { userId: USER, organizationId: ORG, role: 'OWNER' as const },
    } as Partial<Request>);
    const result$ = await interceptor.intercept(ctx, { handle: () => of('result') });
    await lastValueFrom(result$);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('emits envelope with before captured + after from response', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      aggregateType: 'recipe',
      idExtractor: (req: Request) => (req.params as { id: string }).id,
    });
    const before = { id: ID, name: 'old', portions: 2 };
    const after = { id: ID, name: 'new', portions: 4 };
    resolvers.register('recipe', async () => before);

    const ctx = makeCtx({
      agentContext: {
        viaAgent: true,
        agentName: 'claude-desktop',
        capabilityName: 'recipes.update',
      },
      user: { userId: USER, organizationId: ORG, role: 'OWNER' as const },
      params: { id: ID },
    } as Partial<Request>);

    const result$ = await interceptor.intercept(ctx, { handle: () => of(after) });
    await lastValueFrom(result$);

    expect(events.emit).toHaveBeenCalledTimes(1);
    const [channel, payload] = events.emit.mock.calls[0];
    expect(channel).toBe(AuditEventType.AGENT_ACTION_EXECUTED);
    expect(payload).toMatchObject({
      organizationId: ORG,
      aggregateType: 'recipe',
      aggregateId: ID,
      actorUserId: USER,
      actorKind: 'agent',
      agentName: 'claude-desktop',
      payloadBefore: before,
      payloadAfter: after,
      reason: 'recipes.update',
    });
  });

  it('unwraps WriteResponseDto.data for `after`', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      aggregateType: 'recipe',
      idExtractor: () => ID,
    });
    resolvers.register('recipe', async () => ({ id: ID }));

    const wrapped = {
      data: { id: ID, name: 'wrapped' },
      missingFields: [],
      nextRequired: null,
    };
    const ctx = makeCtx({
      agentContext: { viaAgent: true, agentName: 'x', capabilityName: 'recipes.update' },
      user: { userId: USER, organizationId: ORG, role: 'OWNER' as const },
      params: { id: ID },
    } as Partial<Request>);
    const result$ = await interceptor.intercept(ctx, { handle: () => of(wrapped) });
    await lastValueFrom(result$);

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit.mock.calls[0][1].payloadAfter).toEqual({
      id: ID,
      name: 'wrapped',
    });
  });

  it('captures before=null for create operations (idExtractor=null)', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      aggregateType: 'recipe',
      idExtractor: null,
    });
    const created = { id: ID, name: 'newly-created' };
    const ctx = makeCtx({
      agentContext: { viaAgent: true, agentName: 'x', capabilityName: 'recipes.create' },
      user: { userId: USER, organizationId: ORG, role: 'OWNER' as const },
    } as Partial<Request>);
    const result$ = await interceptor.intercept(ctx, { handle: () => of(created) });
    await lastValueFrom(result$);

    expect(events.emit).toHaveBeenCalledTimes(1);
    const payload = events.emit.mock.calls[0][1];
    expect(payload.payloadBefore).toBeNull();
    expect(payload.payloadAfter).toEqual(created);
    // aggregateId synthesised from response
    expect(payload.aggregateId).toBe(ID);
  });

  it('falls back to before=null when resolver throws', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      aggregateType: 'recipe',
      idExtractor: () => ID,
    });
    resolvers.register('recipe', async () => {
      throw new Error('db lost');
    });
    const after = { id: ID, name: 'x' };
    const ctx = makeCtx({
      agentContext: { viaAgent: true, agentName: 'x', capabilityName: 'recipes.update' },
      user: { userId: USER, organizationId: ORG, role: 'OWNER' as const },
    } as Partial<Request>);
    const result$ = await interceptor.intercept(ctx, { handle: () => of(after) });
    await lastValueFrom(result$);

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit.mock.calls[0][1].payloadBefore).toBeNull();
  });

  it('skips emission when no aggregate id can be derived', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      aggregateType: 'recipe',
      idExtractor: null,
    });
    // Handler returns void, no id in response.
    const ctx = makeCtx({
      agentContext: { viaAgent: true, agentName: 'x', capabilityName: 'recipes.update' },
      user: { userId: USER, organizationId: ORG, role: 'OWNER' as const },
    } as Partial<Request>);
    const result$ = await interceptor.intercept(ctx, { handle: () => of(undefined) });
    await lastValueFrom(result$);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('skips emission when req.user is missing (pre-auth)', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      aggregateType: 'recipe',
      idExtractor: () => ID,
    });
    resolvers.register('recipe', async () => ({ id: ID }));
    const ctx = makeCtx({
      agentContext: { viaAgent: true, agentName: 'x', capabilityName: 'recipes.update' },
      // req.user undefined — pre-auth probe
    } as Partial<Request>);
    const result$ = await interceptor.intercept(ctx, { handle: () => of({ id: ID }) });
    await lastValueFrom(result$);
    expect(events.emit).not.toHaveBeenCalled();
  });
});
