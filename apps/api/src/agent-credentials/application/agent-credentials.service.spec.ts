import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentCredential } from '../domain/agent-credential.entity';
import { AgentCredentialRepository } from '../infrastructure/agent-credential.repository';
import { AgentCredentialsService } from './agent-credentials.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function makeRepo(): jest.Mocked<AgentCredentialRepository> {
  return {
    findByOrgAndAgentName: jest.fn(),
    findOneBy: jest.fn(),
    findActiveByIdScoped: jest.fn(),
    findById: jest.fn(),
    listByOrganization: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<AgentCredentialRepository>;
}

const SAMPLE_PUBKEY =
  'MCowBQYDK2VwAyEAEXAMPLE_PUBLIC_KEY_BASE64_PLACEHOLDER1234567';

describe('AgentCredentialsService — create()', () => {
  it('persists a fresh credential when no row exists for (org, agentName)', async () => {
    const repo = makeRepo();
    repo.findByOrgAndAgentName.mockResolvedValue(null);
    repo.save.mockImplementation(async (row) => row as AgentCredential);
    const svc = new AgentCredentialsService(repo);

    const row = await svc.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.organizationId).toBe(ORG_A);
    expect(row.agentName).toBe('hermes');
    expect(row.publicKey).toBe(SAMPLE_PUBKEY);
    expect(row.role).toBe('OWNER');
    expect(row.revokedAt).toBeNull();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects with ConflictException AGENT_NAME_TAKEN when an active row exists', async () => {
    const repo = makeRepo();
    const existing = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    repo.findByOrgAndAgentName.mockResolvedValue(existing);
    const svc = new AgentCredentialsService(repo);

    await expect(
      svc.create({
        organizationId: ORG_A,
        agentName: 'hermes',
        publicKey: SAMPLE_PUBKEY,
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects with ConflictException even when the existing row is revoked', async () => {
    const repo = makeRepo();
    const existing = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    existing.revoke();
    repo.findByOrgAndAgentName.mockResolvedValue(existing);
    const svc = new AgentCredentialsService(repo);

    await expect(
      svc.create({
        organizationId: ORG_A,
        agentName: 'hermes',
        publicKey: SAMPLE_PUBKEY,
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AgentCredentialsService — list/get/revoke/delete', () => {
  it('list() returns rows scoped to the calling org', async () => {
    const repo = makeRepo();
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    repo.listByOrganization.mockResolvedValue([row]);
    const svc = new AgentCredentialsService(repo);

    const rows = await svc.list(ORG_A);
    expect(rows).toEqual([row]);
    expect(repo.listByOrganization).toHaveBeenCalledWith(ORG_A);
  });

  it('getById() throws NotFound when org-scope mismatches', async () => {
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(null);
    const svc = new AgentCredentialsService(repo);

    await expect(svc.getById('some-id', ORG_B)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revoke() sets revokedAt and persists', async () => {
    const repo = makeRepo();
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    repo.findOneBy.mockResolvedValue(row);
    repo.save.mockImplementation(async (r) => r as AgentCredential);
    const svc = new AgentCredentialsService(repo);

    const updated = await svc.revoke(row.id, ORG_A);
    expect(updated.revokedAt).toBeInstanceOf(Date);
    expect(updated.revokedAt!.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('revoke() is idempotent when called twice', async () => {
    const repo = makeRepo();
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    const initialRevoke = new Date(Date.now() - 10_000);
    row.revoke(initialRevoke);
    repo.findOneBy.mockResolvedValue(row);
    repo.save.mockImplementation(async (r) => r as AgentCredential);
    const svc = new AgentCredentialsService(repo);

    const updated = await svc.revoke(row.id, ORG_A);
    expect(updated.revokedAt).toEqual(initialRevoke);
  });

  it('deleteHard() removes the row when scope matches', async () => {
    const repo = makeRepo();
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    repo.findOneBy.mockResolvedValue(row);
    const svc = new AgentCredentialsService(repo);

    await svc.deleteHard(row.id, ORG_A);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});

describe('AgentCredentialsService — rotate() (Wave 1.17)', () => {
  const NEW_PUBKEY =
    'MCowBQYDK2VwAyEAEXAMPLE_NEW_PUBKEY_BASE64_PLACEHOLDER12345';

  it('updates publicKey on an active row + persists', async () => {
    const repo = makeRepo();
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    repo.findOneBy.mockResolvedValue(row);
    repo.save.mockImplementation(async (r) => r as AgentCredential);
    const svc = new AgentCredentialsService(repo);

    const updated = await svc.rotate(row.id, ORG_A, NEW_PUBKEY);

    expect(updated.id).toBe(row.id);
    expect(updated.publicKey).toBe(NEW_PUBKEY);
    expect(updated.revokedAt).toBeNull();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictException AGENT_CREDENTIAL_REVOKED on a revoked row', async () => {
    const repo = makeRepo();
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    row.revoke();
    repo.findOneBy.mockResolvedValue(row);
    const svc = new AgentCredentialsService(repo);

    await expect(svc.rotate(row.id, ORG_A, NEW_PUBKEY)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.save).not.toHaveBeenCalled();
    // Original key untouched on the in-memory row.
    expect(row.publicKey).toBe(SAMPLE_PUBKEY);
  });

  it('throws NotFoundException on missing id (per-org-scoped)', async () => {
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(null);
    const svc = new AgentCredentialsService(repo);

    await expect(svc.rotate('missing-id', ORG_A, NEW_PUBKEY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rotation across org boundaries returns NotFound (no existence leak)', async () => {
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(null); // queried with ORG_B but row is in ORG_A
    const svc = new AgentCredentialsService(repo);

    await expect(svc.rotate('some-id', ORG_B, NEW_PUBKEY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AgentCredential entity', () => {
  it('isActive() returns true when revokedAt is null', () => {
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    expect(row.isActive()).toBe(true);
  });

  it('isActive() returns false after revoke()', () => {
    const row = AgentCredential.create({
      organizationId: ORG_A,
      agentName: 'hermes',
      publicKey: SAMPLE_PUBKEY,
      role: 'OWNER',
    });
    row.revoke();
    expect(row.isActive()).toBe(false);
  });
});
