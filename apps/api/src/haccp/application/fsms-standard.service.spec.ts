import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditEventType } from '../../audit-log/application/types';
import {
  FsmsStandardConflictError,
  FsmsStandardNotFoundError,
} from '../domain/errors';
import { FsmsStandard } from '../domain/fsms-standard.entity';
import { FsmsStandardService } from './fsms-standard.service';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeStandard(overrides: Partial<FsmsStandard> = {}): FsmsStandard {
  const s = new FsmsStandard();
  s.id = overrides.id ?? '22222222-2222-4222-8222-222222222222';
  s.organizationId = overrides.organizationId ?? ORG;
  s.name = overrides.name ?? 'casa-aitona-2026';
  s.version = overrides.version ?? 'v2';
  s.effectiveFrom = overrides.effectiveFrom ?? new Date('2026-01-01T00:00:00Z');
  s.effectiveUntil = overrides.effectiveUntil ?? null;
  s.ccpDefinitions = overrides.ccpDefinitions ?? [];
  s.createdAt = overrides.createdAt ?? new Date();
  return s;
}

describe('FsmsStandardService', () => {
  let repo: jest.Mocked<
    Pick<
      Repository<FsmsStandard>,
      'findOne' | 'find' | 'save' | 'createQueryBuilder'
    > & { manager: EntityManager }
  >;
  let txRepo: jest.Mocked<Pick<Repository<FsmsStandard>, 'findOne' | 'save'>>;
  let emitter: EventEmitter2;
  let service: FsmsStandardService;

  beforeEach(() => {
    txRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (row: FsmsStandard) => ({
        ...row,
        createdAt: new Date(),
      })),
    } as unknown as jest.Mocked<Pick<Repository<FsmsStandard>, 'findOne' | 'save'>>;

    const manager = {
      transaction: jest.fn(
        async (cb: (mgr: EntityManager) => Promise<unknown>) =>
          cb({
            getRepository: () => txRepo,
          } as unknown as EntityManager),
      ),
    } as unknown as EntityManager;

    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager,
    } as unknown as jest.Mocked<
      Pick<
        Repository<FsmsStandard>,
        'findOne' | 'find' | 'save' | 'createQueryBuilder'
      > & { manager: EntityManager }
    >;

    emitter = new EventEmitter2();
    service = new FsmsStandardService(
      repo as unknown as Repository<FsmsStandard>,
      emitter,
    );
  });

  describe('configureFsmsStandards', () => {
    it('persists a new row + emits FSMS_STANDARD_CONFIGURED', async () => {
      const events: unknown[] = [];
      emitter.on(AuditEventType.FSMS_STANDARD_CONFIGURED, (e) => events.push(e));

      const saved = await service.configureFsmsStandards({
        organizationId: ORG,
        name: 'casa-aitona-2026',
        version: 'v2',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        ccpDefinitions: [],
      });

      expect(saved.version).toBe('v2');
      expect(txRepo.save).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      const env = events[0] as Record<string, unknown>;
      expect((env.payloadAfter as Record<string, unknown>).version).toBe('v2');
      expect((env.payloadAfter as Record<string, unknown>).ccpDefinitionsCount).toBe(0);
    });

    it('terminates the prior active row when terminatesPrior=true', async () => {
      const prior = makeStandard({
        id: 'prior-id',
        version: 'v1',
        effectiveUntil: null,
      });
      txRepo.findOne.mockResolvedValueOnce(prior);

      const effectiveFrom = new Date('2026-07-01T00:00:00Z');
      await service.configureFsmsStandards({
        organizationId: ORG,
        name: 'casa-aitona-2026',
        version: 'v2',
        effectiveFrom,
        ccpDefinitions: [],
        terminatesPrior: true,
      });

      // First save terminates prior; second save persists new.
      expect(txRepo.save).toHaveBeenCalledTimes(2);
      const firstCall = txRepo.save.mock.calls[0][0] as FsmsStandard;
      expect(firstCall.id).toBe('prior-id');
      expect(firstCall.effectiveUntil).toBe(effectiveFrom);
    });

    it('throws FsmsStandardConflictError when version matches prior active', async () => {
      const prior = makeStandard({
        id: 'prior-id',
        version: 'v2',
        effectiveUntil: null,
      });
      txRepo.findOne.mockResolvedValueOnce(prior);
      await expect(
        service.configureFsmsStandards({
          organizationId: ORG,
          name: 'casa-aitona-2026',
          version: 'v2',
          effectiveFrom: new Date('2026-07-01T00:00:00Z'),
          ccpDefinitions: [],
          terminatesPrior: true,
        }),
      ).rejects.toBeInstanceOf(FsmsStandardConflictError);
    });
  });

  describe('getActiveStandard', () => {
    it('resolves the row whose window covers `at` via query builder', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(makeStandard({ version: 'v2' })),
      } as unknown as SelectQueryBuilder<FsmsStandard>;
      repo.createQueryBuilder.mockReturnValue(qb);
      const got = await service.getActiveStandard(
        ORG,
        'casa-aitona-2026',
        new Date('2026-05-15T00:00:00Z'),
      );
      expect(got.version).toBe('v2');
      expect(qb.andWhere).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('fsms.effective_from', 'DESC');
      expect(qb.limit).toHaveBeenCalledWith(1);
    });

    it('throws FsmsStandardNotFoundError when no row matches', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as unknown as SelectQueryBuilder<FsmsStandard>;
      repo.createQueryBuilder.mockReturnValue(qb);
      await expect(
        service.getActiveStandard(ORG, 'casa-aitona-2026'),
      ).rejects.toBeInstanceOf(FsmsStandardNotFoundError);
    });
  });

  describe('listVersions', () => {
    it('returns rows ordered by name ASC, effective_from DESC', async () => {
      const rows = [makeStandard({ version: 'v2' }), makeStandard({ version: 'v1' })];
      repo.find.mockResolvedValue(rows);
      const got = await service.listVersions(ORG, 'casa-aitona-2026');
      expect(got).toBe(rows);
      expect(repo.find).toHaveBeenCalledWith({
        where: { organizationId: ORG, name: 'casa-aitona-2026' },
        order: { name: 'ASC', effectiveFrom: 'DESC' },
      });
    });
  });
});
