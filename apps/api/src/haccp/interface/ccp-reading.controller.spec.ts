import 'reflect-metadata';
import {
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ROLES_METADATA_KEY } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import type { CcpReadingService } from '../application/ccp-reading.service';
import type { OutOfSpecWithoutActionQuery } from '../application/out-of-spec-without-action.query';
import type { RecentReadingsQuery } from '../application/recent-readings.query';
import { CcpReadingController } from './ccp-reading.controller';
import { OutOfSpecRequiresCorrectiveActionError } from '../domain/errors';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';

function fakeReq(user: AuthenticatedUserPayload | undefined): Request {
  return { user } as unknown as Request;
}

describe('CcpReadingController', () => {
  let readings: jest.Mocked<Pick<CcpReadingService, 'recordReading'>>;
  let recent: jest.Mocked<Pick<RecentReadingsQuery, 'recentReadings'>>;
  let probe: jest.Mocked<
    Pick<OutOfSpecWithoutActionQuery, 'lastOutOfSpecUnresolved'>
  >;
  let ctrl: CcpReadingController;

  beforeEach(() => {
    readings = {
      recordReading: jest.fn(),
    } as unknown as jest.Mocked<Pick<CcpReadingService, 'recordReading'>>;
    recent = {
      recentReadings: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<RecentReadingsQuery, 'recentReadings'>>;
    probe = {
      lastOutOfSpecUnresolved: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<
      Pick<OutOfSpecWithoutActionQuery, 'lastOutOfSpecUnresolved'>
    >;
    ctrl = new CcpReadingController(
      readings as unknown as CcpReadingService,
      recent as unknown as RecentReadingsQuery,
      probe as unknown as OutOfSpecWithoutActionQuery,
    );
  });

  it('rejects unauthenticated callers on record', async () => {
    await expect(
      ctrl.record(
        {
          organizationId: ORG,
          ccpId: 'cooler-meat-fridge',
          readingValue: 1.4,
        },
        fakeReq(undefined),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects cross-org callers on record', async () => {
    await expect(
      ctrl.record(
        {
          organizationId: OTHER_ORG,
          ccpId: 'cooler-meat-fridge',
          readingValue: 1.4,
        },
        fakeReq({ userId: 'u', organizationId: ORG, role: 'OWNER' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps OutOfSpecRequiresCorrectiveActionError → 422', async () => {
    readings.recordReading.mockRejectedValue(
      new OutOfSpecRequiresCorrectiveActionError('out of spec'),
    );
    await expect(
      ctrl.record(
        {
          organizationId: ORG,
          ccpId: 'cooler-meat-fridge',
          readingValue: 6.5,
        },
        fakeReq({ userId: 'u', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('returns the persisted reading on the happy path', async () => {
    const reading = {
      id: 'r1',
      organizationId: ORG,
      ccpId: 'cooler-meat-fridge',
      readingValue: 1.4,
      inSpec: true,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readings.recordReading.mockResolvedValue(reading as any);
    const res = await ctrl.record(
      {
        organizationId: ORG,
        ccpId: 'cooler-meat-fridge',
        readingValue: 1.4,
      },
      fakeReq({ userId: 'u', organizationId: ORG, role: 'MANAGER' }),
    );
    expect(res.reading).toBe(reading);
  });

  it('record method carries @Roles("OWNER", "MANAGER") metadata', () => {
    const proto = CcpReadingController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const fn = proto.record;
    expect(typeof fn).toBe('function');
    const roles = Reflect.getMetadata(ROLES_METADATA_KEY, fn) as
      | string[]
      | undefined;
    expect(roles).toEqual(['OWNER', 'MANAGER']);
  });

  it('list method carries @Roles("OWNER", "MANAGER") metadata', () => {
    const proto = CcpReadingController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const fn = proto.list;
    const roles = Reflect.getMetadata(ROLES_METADATA_KEY, fn) as
      | string[]
      | undefined;
    expect(roles).toEqual(['OWNER', 'MANAGER']);
  });

  it('lastOutOfSpecUnresolved method carries @Roles("OWNER", "MANAGER") metadata', () => {
    const proto = CcpReadingController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const fn = proto.lastOutOfSpecUnresolved;
    const roles = Reflect.getMetadata(ROLES_METADATA_KEY, fn) as
      | string[]
      | undefined;
    expect(roles).toEqual(['OWNER', 'MANAGER']);
  });
});
