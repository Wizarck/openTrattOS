import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentCredential } from '../domain/agent-credential.entity';
import { AgentCredentialRepository } from '../infrastructure/agent-credential.repository';
import { UserRole } from '../../iam/domain/user.entity';

export interface CreateAgentCredentialInput {
  organizationId: string;
  agentName: string;
  publicKey: string;
  role: UserRole;
}

/**
 * Wave 1.13 [3c] — m2-mcp-agent-registry-bench. Application service for the
 * `agent_credentials` REST surface.
 *
 * Per ADR-AGENT-CRED-1, all operations are per-org scoped. Soft-delete via
 * `revokedAt`; the unique index covers ALL rows (active + revoked) so
 * re-registering the same `agentName` after revocation requires a hard
 * DELETE first — operators do that via the runbook.
 */
@Injectable()
export class AgentCredentialsService {
  constructor(private readonly repo: AgentCredentialRepository) {}

  async create(input: CreateAgentCredentialInput): Promise<AgentCredential> {
    const existing = await this.repo.findByOrgAndAgentName(
      input.organizationId,
      input.agentName,
    );
    if (existing) {
      throw new ConflictException({ code: 'AGENT_NAME_TAKEN' });
    }
    const row = AgentCredential.create({
      organizationId: input.organizationId,
      agentName: input.agentName,
      publicKey: input.publicKey,
      role: input.role,
    });
    return this.repo.save(row);
  }

  async list(organizationId: string): Promise<AgentCredential[]> {
    return this.repo.listByOrganization(organizationId);
  }

  async getById(id: string, organizationId: string): Promise<AgentCredential> {
    const row = await this.repo.findOneBy({ id, organizationId });
    if (!row) {
      throw new NotFoundException({ code: 'AGENT_CREDENTIAL_NOT_FOUND' });
    }
    return row;
  }

  async revoke(id: string, organizationId: string): Promise<AgentCredential> {
    const row = await this.getById(id, organizationId);
    row.revoke();
    return this.repo.save(row);
  }

  async deleteHard(id: string, organizationId: string): Promise<void> {
    const row = await this.getById(id, organizationId);
    await this.repo.remove(row);
  }
}
