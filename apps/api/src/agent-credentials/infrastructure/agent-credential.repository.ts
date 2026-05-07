import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AgentCredential } from '../domain/agent-credential.entity';

@Injectable()
export class AgentCredentialRepository extends Repository<AgentCredential> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(AgentCredential, dataSource.createEntityManager());
  }

  /**
   * Look up an agent credential by id, scoped to its owning organization.
   * Returns `null` when the row is missing or belongs to another org.
   * Used by the signature middleware on the hot path.
   */
  async findActiveByIdScoped(id: string, organizationId: string): Promise<AgentCredential | null> {
    return this.findOne({
      where: { id, organizationId, revokedAt: IsNull() },
    });
  }

  /** Used by the signature middleware when looking up by id alone (org check happens after). */
  async findById(id: string): Promise<AgentCredential | null> {
    return this.findOne({ where: { id } });
  }

  async listByOrganization(organizationId: string): Promise<AgentCredential[]> {
    return this.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Creation guard. Returns the matching row regardless of revoked state so
   * the controller can return HTTP 409 `AGENT_NAME_TAKEN` consistently.
   */
  async findByOrgAndAgentName(organizationId: string, agentName: string): Promise<AgentCredential | null> {
    return this.findOne({ where: { organizationId, agentName } });
  }
}
