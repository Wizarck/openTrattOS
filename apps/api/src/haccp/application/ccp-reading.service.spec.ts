import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import { AuditEventType } from '../../audit-log/application/types';
import { CcpReading } from '../domain/ccp-reading.entity';
import { CorrectiveAction } from '../domain/corrective-action.entity';
import { FsmsStandard } from '../domain/fsms-standard.entity';
import {
  CcpNotInFsmsStandardError,
  OutOfSpecRequiresCorrectiveActionError,
  ReadingShapeError,
} from '../domain/errors';
import { HACCP_RECORD_AGGREGATE_TYPE } from '../types';
import { CcpReadingService } from './ccp-reading.service';
import { CorrectiveActionService } from './corrective-action.service';
import { FsmsStandardService } from './fsms-standard.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const FSMS_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const ACTION_ID = '44444444-4444-4444-8444-444444444444';

function makeStandard(overrides: Partial<FsmsStandard> = {}): FsmsStandard {
  const s = new FsmsStandard();
  s.id = overrides.id ?? FSMS_ID;
  s.organizationId = overrides.organizationId ?? ORG;
  s.name = overrides.name ?? 'casa-aitona-2026';
  s.version = overrides.version ?? 'v2';
  s.effectiveFrom = overrides.effectiveFrom ?? new Date('2026-01-01T00:00:00Z');
  s.effectiveUntil = overrides.effectiveUntil ?? null;
  s.ccpDefinitions = overrides.ccpDefinitions ?? [
    {
      id: 'cooler-meat-fridge',
      label: 'Cooler — meat fridge',
      inputType: 'numeric',
      unit: '°C',
      specMin: -2,
      specMax: 2,
    },
  ];
  s.createdAt = overrides.createdAt ?? new Date();
  return s;
}

describe('CcpReadingService', () => {
  let repo: jest.Mocked<Pick<Repository<CcpReading>, 'save'>>;
  let fsmsService: jest.Mocked<
    Pick<FsmsStandardService, 'getStandardById' | 'listVersions'>
  >;
  let correctiveActions: jest.Mocked<
    Pick<CorrectiveActionService, 'recordAdHoc' | 'findById'>
  >;
  let emitter: EventEmitter2;
  let service: CcpReadingService;
  let savedRow: CcpReading | null;

  beforeEach(() => {
    savedRow = null;
    repo = {
      save: jest.fn(async (row: CcpReading) => {
        savedRow = { ...row, createdAt: new Date() } as CcpReading;
        return savedRow;
      }),
    } as unknown as jest.Mocked<Pick<Repository<CcpReading>, 'save'>>;
    fsmsService = {
      getStandardById: jest.fn(),
      listVersions: jest.fn().mockResolvedValue([makeStandard()]),
    } as unknown as jest.Mocked<
      Pick<FsmsStandardService, 'getStandardById' | 'listVersions'>
    >;
    correctiveActions = {
      recordAdHoc: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<CorrectiveActionService, 'recordAdHoc' | 'findById'>
    >;
    emitter = new EventEmitter2();
    service = new CcpReadingService(
      repo as unknown as Repository<CcpReading>,
      fsmsService as unknown as FsmsStandardService,
      correctiveActions as unknown as CorrectiveActionService,
      emitter,
    );
  });

  it('records an in-spec numeric reading + emits CCP_READING_RECORDED', async () => {
    const events: unknown[] = [];
    emitter.on(AuditEventType.CCP_READING_RECORDED, (e) => events.push(e));

    const result = await service.recordReading({
      organizationId: ORG,
      ccpId: 'cooler-meat-fridge',
      readingValue: 1.4,
      actorUserId: ACTOR,
    });

    expect(result.inSpec).toBe(true);
    expect(result.specMin).toBe(-2);
    expect(result.specMax).toBe(2);
    expect(result.fsmsStandardVersion).toBe('v2');
    expect(result.fsmsStandardId).toBe(FSMS_ID);
    expect(result.correctiveActionId).toBeNull();
    expect(events).toHaveLength(1);
    const env = events[0] as Record<string, unknown>;
    expect(env.aggregateType).toBe(HACCP_RECORD_AGGREGATE_TYPE);
    expect(env.actorUserId).toBe(ACTOR);
    expect(env.actorKind).toBe('user');
  });

  it('refuses an out-of-spec reading when no corrective action is supplied', async () => {
    await expect(
      service.recordReading({
        organizationId: ORG,
        ccpId: 'cooler-meat-fridge',
        readingValue: 6.5,
      }),
    ).rejects.toBeInstanceOf(OutOfSpecRequiresCorrectiveActionError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('records an out-of-spec reading with a predefined correctiveActionId', async () => {
    correctiveActions.findById.mockResolvedValue({
      id: ACTION_ID,
      organizationId: ORG,
    } as CorrectiveAction);
    const events: unknown[] = [];
    emitter.on(AuditEventType.CCP_READING_RECORDED, (e) => events.push(e));

    const result = await service.recordReading({
      organizationId: ORG,
      ccpId: 'cooler-meat-fridge',
      readingValue: 6.5,
      correctiveActionId: ACTION_ID,
    });

    expect(result.inSpec).toBe(false);
    expect(result.correctiveActionId).toBe(ACTION_ID);
    expect(correctiveActions.findById).toHaveBeenCalledWith(ORG, ACTION_ID);
    expect(events).toHaveLength(1);
  });

  it('creates an ad-hoc corrective action when correctiveActionInput is supplied', async () => {
    correctiveActions.recordAdHoc.mockResolvedValue({
      id: 'created-id',
      organizationId: ORG,
    } as CorrectiveAction);

    const result = await service.recordReading({
      organizationId: ORG,
      ccpId: 'cooler-meat-fridge',
      readingValue: 6.5,
      correctiveActionInput: {
        name: 'Descartar lote',
        notes: 'demasiado caliente',
      },
    });

    expect(correctiveActions.recordAdHoc).toHaveBeenCalledTimes(1);
    const adHocArg = correctiveActions.recordAdHoc.mock.calls[0][0];
    expect(adHocArg.organizationId).toBe(ORG);
    expect(adHocArg.fsmsStandardId).toBe(FSMS_ID);
    expect(adHocArg.ccpId).toBe('cooler-meat-fridge');
    expect(adHocArg.name).toBe('Descartar lote');
    expect(result.correctiveActionId).toBe('created-id');
  });

  it('throws CcpNotInFsmsStandardError when the ccpId is unknown', async () => {
    fsmsService.listVersions.mockResolvedValueOnce([makeStandard()]);
    await expect(
      service.recordReading({
        organizationId: ORG,
        ccpId: 'unknown-ccp',
        readingValue: 1,
      }),
    ).rejects.toBeInstanceOf(CcpNotInFsmsStandardError);
  });

  it('pins the FSMS standard version at write time', async () => {
    const result = await service.recordReading({
      organizationId: ORG,
      ccpId: 'cooler-meat-fridge',
      readingValue: 0,
      actorUserId: ACTOR,
    });
    expect(result.fsmsStandardVersion).toBe('v2');
    expect(result.fsmsStandardId).toBe(FSMS_ID);
  });

  it('honours an explicit fsmsStandardId override', async () => {
    const overrideStandard = makeStandard({
      id: 'override-id',
      version: 'v9',
    });
    fsmsService.getStandardById.mockResolvedValue(overrideStandard);

    const result = await service.recordReading({
      organizationId: ORG,
      ccpId: 'cooler-meat-fridge',
      fsmsStandardId: 'override-id',
      readingValue: 0,
    });

    expect(result.fsmsStandardVersion).toBe('v9');
    expect(fsmsService.listVersions).not.toHaveBeenCalled();
  });

  it('evaluates checkbox CCPs as in-spec when checked=true', async () => {
    fsmsService.listVersions.mockResolvedValueOnce([
      makeStandard({
        ccpDefinitions: [
          {
            id: 'surface-clean',
            label: 'Worksurface clean',
            inputType: 'checkbox',
          },
        ],
      }),
    ]);

    const result = await service.recordReading({
      organizationId: ORG,
      ccpId: 'surface-clean',
      readingExtras: { checked: true },
    });

    expect(result.inSpec).toBe(true);
  });

  it('refuses checkbox CCP when readingExtras lacks the boolean', async () => {
    fsmsService.listVersions.mockResolvedValueOnce([
      makeStandard({
        ccpDefinitions: [
          {
            id: 'surface-clean',
            label: 'Worksurface clean',
            inputType: 'checkbox',
          },
        ],
      }),
    ]);
    await expect(
      service.recordReading({
        organizationId: ORG,
        ccpId: 'surface-clean',
        readingExtras: {},
      }),
    ).rejects.toBeInstanceOf(ReadingShapeError);
  });

  it('evaluates multi-select CCPs as in-spec when every expected option is selected', async () => {
    fsmsService.listVersions.mockResolvedValueOnce([
      makeStandard({
        ccpDefinitions: [
          {
            id: 'allergen-checklist',
            label: 'Allergen-handling check',
            inputType: 'multi-select',
            expectedOptions: ['gloves', 'separate-tools', 'separate-board'],
          },
        ],
      }),
    ]);

    const inSpec = await service.recordReading({
      organizationId: ORG,
      ccpId: 'allergen-checklist',
      readingExtras: {
        selected: ['gloves', 'separate-tools', 'separate-board'],
      },
    });
    expect(inSpec.inSpec).toBe(true);
  });

  it('throws ReadingShapeError when both readingValue and readingExtras are missing', async () => {
    await expect(
      service.recordReading({
        organizationId: ORG,
        ccpId: 'cooler-meat-fridge',
      }),
    ).rejects.toBeInstanceOf(ReadingShapeError);
  });
});
