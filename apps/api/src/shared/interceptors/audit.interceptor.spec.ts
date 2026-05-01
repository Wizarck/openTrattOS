import { CallHandler, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';
import { AuthenticatedUserPayload } from '../guards/roles.guard';
import { AuditInterceptor } from './audit.interceptor';

function makeCtx(method: string, body: Record<string, unknown>, user: AuthenticatedUserPayload | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, body, user }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

const next: CallHandler = { handle: () => of('ok') };

const userA: AuthenticatedUserPayload = {
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role: 'MANAGER',
};

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  beforeEach(() => {
    interceptor = new AuditInterceptor();
  });

  it('passes GET/HEAD/OPTIONS through without touching the body', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const body = { existing: 'data' };
      const ctx = makeCtx(method, body, userA);
      interceptor.intercept(ctx, next);
      expect(body).toEqual({ existing: 'data' });
    }
  });

  it('throws Unauthorized when mutating verb has no user', () => {
    expect(() => interceptor.intercept(makeCtx('POST', {}, undefined), next)).toThrow(UnauthorizedException);
    expect(() => interceptor.intercept(makeCtx('PATCH', {}, undefined), next)).toThrow(UnauthorizedException);
    expect(() => interceptor.intercept(makeCtx('DELETE', {}, undefined), next)).toThrow(UnauthorizedException);
  });

  it('on POST sets createdBy + updatedBy from the JWT', () => {
    const body: Record<string, unknown> = { name: 'thing' };
    interceptor.intercept(makeCtx('POST', body, userA), next);
    expect(body['createdBy']).toBe(userA.userId);
    expect(body['updatedBy']).toBe(userA.userId);
  });

  it('on PATCH sets updatedBy only (leaves createdBy untouched on the entity)', () => {
    const body: Record<string, unknown> = { name: 'patched' };
    interceptor.intercept(makeCtx('PATCH', body, userA), next);
    expect(body['createdBy']).toBeUndefined();
    expect(body['updatedBy']).toBe(userA.userId);
  });

  it('strips DTO-supplied createdBy / updatedBy (anti-tampering)', () => {
    const tampered: Record<string, unknown> = {
      name: 'thing',
      createdBy: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      updatedBy: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      created_by: 'sneaky-snake-case',
      updated_by: 'sneaky-snake-case',
    };
    interceptor.intercept(makeCtx('POST', tampered, userA), next);
    expect(tampered['createdBy']).toBe(userA.userId);
    expect(tampered['updatedBy']).toBe(userA.userId);
    expect(tampered['created_by']).toBeUndefined();
    expect(tampered['updated_by']).toBeUndefined();
  });
});
