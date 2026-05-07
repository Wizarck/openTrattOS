import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AgentCredential } from '../domain/agent-credential.entity';
import { AgentCredentialsService } from '../application/agent-credentials.service';
import { AgentCredentialsController } from './agent-credentials.controller';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const SAMPLE_PUBKEY = 'MCowBQYDK2VwAyEAEXAMPLE_PUBLIC_KEY_BASE64_PLACEHOLDER1234567';

function fakeReq(user?: unknown): Request {
  return { user, params: {} } as unknown as Request;
}

describe('AgentCredentialsController', () => {
  let service: jest.Mocked<AgentCredentialsService>;
  let ctrl: AgentCredentialsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      revoke: jest.fn(),
      deleteHard: jest.fn(),
    } as unknown as jest.Mocked<AgentCredentialsService>;
    ctrl = new AgentCredentialsController(service);
  });

  it('create() rejects unauthenticated callers (defence in depth)', async () => {
    await expect(
      ctrl.create(
        { agentName: 'hermes', publicKey: SAMPLE_PUBKEY, role: 'OWNER' },
        fakeReq(undefined),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('create() forwards orgId from req.user (NOT from body)', async () => {
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    service.create.mockResolvedValue(row);
    const req = fakeReq({ userId: 'u', organizationId: ORG_A, role: 'OWNER' });

    const res = await ctrl.create(
      { agentName: 'hermes', publicKey: SAMPLE_PUBKEY, role: 'OWNER' },
      req,
    );
    expect(service.create).toHaveBeenCalledWith({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    expect(res.data.id).toBe(row.id);
    expect(res.data.agentName).toBe('hermes');
    expect(res.data.role).toBe('OWNER');
  });

  it('create() response does NOT echo the public key back', async () => {
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    service.create.mockResolvedValue(row);
    const res = await ctrl.create(
      { agentName: 'hermes', publicKey: SAMPLE_PUBKEY, role: 'OWNER' },
      fakeReq({ userId: 'u', organizationId: ORG_A, role: 'OWNER' }),
    );
    const json = JSON.stringify(res);
    expect(json).not.toContain(SAMPLE_PUBKEY);
  });

  it('list() returns response shape per row', async () => {
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    service.list.mockResolvedValue([row]);
    const out = await ctrl.list(fakeReq({ userId: 'u', organizationId: ORG_A, role: 'OWNER' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: row.id,
      agentName: 'hermes',
      role: 'OWNER',
      revokedAt: null,
    });
    expect(out[0]).not.toHaveProperty('publicKey');
  });

  it('revoke() returns the soft-deleted row in WriteResponseDto envelope', async () => {
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    row.revoke();
    service.revoke.mockResolvedValue(row);
    const res = await ctrl.revoke(
      row.id,
      fakeReq({ userId: 'u', organizationId: ORG_A, role: 'OWNER' }),
    );
    expect(res.data.revokedAt).toBe(row.revokedAt!.toISOString());
    expect(res.missingFields).toEqual([]);
  });

  it('delete() returns the deleted id in the envelope', async () => {
    service.deleteHard.mockResolvedValue(undefined);
    const id = '33333333-3333-4333-8333-333333333333';
    const res = await ctrl.delete(
      id,
      fakeReq({ userId: 'u', organizationId: ORG_A, role: 'OWNER' }),
    );
    expect(res.data).toEqual({ id });
    expect(service.deleteHard).toHaveBeenCalledWith(id, ORG_A);
  });
});
