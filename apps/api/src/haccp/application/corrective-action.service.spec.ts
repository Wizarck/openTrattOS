import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import { AuditEventType } from '../../audit-log/application/types';
import { CorrectiveAction } from '../domain/corrective-action.entity';
import { CorrectiveActionNotFoundError } from '../domain/errors';
import { CorrectiveActionService } from './corrective-action.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const FSMS_ID = '22222222-2222-4222-8222-222222222222';

describe('CorrectiveActionService', () => {
  let repo: jest.Mocked<
    Pick<Repository<CorrectiveAction>, 'save' | 'findOne' | 'find'>
  >;
  let emitter: EventEmitter2;
  let service: CorrectiveActionService;

  beforeEach(() => {
    repo = {
      save: jest.fn(async (row: CorrectiveAction) => ({
        ...row,
        createdAt: new Date(),
      })),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<CorrectiveAction>, 'save' | 'findOne' | 'find'>
    >;
    emitter = new EventEmitter2();
    service = new CorrectiveActionService(
      repo as unknown as Repository<CorrectiveAction>,
      emitter,
    );
  });

  it('records a predefined action with creation_mode=predefined and emits the envelope', async () => {
    const events: unknown[] = [];
    emitter.on(AuditEventType.CCP_CORRECTIVE_ACTION_RECORDED, (e) =>
      events.push(e),
    );

    const action = await service.recordPredefined({
      organizationId: ORG,
      fsmsStandardId: FSMS_ID,
      ccpId: 'cooler-meat-fridge',
      name: 'Dividir lote',
      notes: 'protocolo M3',
    });

    expect(action.creationMode).toBe('predefined');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    const env = events[0] as Record<string, unknown>;
    expect(env.aggregateType).toBe('haccp_record');
    expect((env.payloadAfter as Record<string, unknown>).creationMode).toBe(
      'predefined',
    );
  });

  it('records an ad-hoc action with creation_mode=ad-hoc', async () => {
    const events: unknown[] = [];
    emitter.on(AuditEventType.CCP_CORRECTIVE_ACTION_RECORDED, (e) =>
      events.push(e),
    );

    const action = await service.recordAdHoc({
      organizationId: ORG,
      fsmsStandardId: FSMS_ID,
      ccpId: 'cooler-meat-fridge',
      name: 'Descartar lote',
    });

    expect(action.creationMode).toBe('ad-hoc');
    expect(events).toHaveLength(1);
    expect(
      (
        (events[0] as Record<string, unknown>).payloadAfter as Record<
          string,
          unknown
        >
      ).creationMode,
    ).toBe('ad-hoc');
  });

  it('findById throws CorrectiveActionNotFoundError when no match', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findById(ORG, 'missing-id')).rejects.toBeInstanceOf(
      CorrectiveActionNotFoundError,
    );
  });

  it('findById asserts same-org via the where clause', async () => {
    repo.findOne.mockResolvedValue({
      id: 'cae-1',
      organizationId: ORG,
    } as CorrectiveAction);
    const got = await service.findById(ORG, 'cae-1');
    expect(got.id).toBe('cae-1');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'cae-1', organizationId: ORG },
    });
  });

  it('listForCcp returns predefined first, then up to 10 ad-hoc', async () => {
    const predefined: CorrectiveAction[] = [
      { id: 'p1', creationMode: 'predefined' } as CorrectiveAction,
    ];
    const adHoc: CorrectiveAction[] = [
      { id: 'a1', creationMode: 'ad-hoc' } as CorrectiveAction,
    ];
    repo.find.mockImplementation((opts) => {
      const where = (opts as { where: Record<string, unknown> }).where;
      if (where.creationMode === 'predefined') return Promise.resolve(predefined);
      return Promise.resolve(adHoc);
    });

    const got = await service.listForCcp(ORG, FSMS_ID, 'cooler-meat-fridge');
    expect(got.map((c) => c.id)).toEqual(['p1', 'a1']);
  });
});
