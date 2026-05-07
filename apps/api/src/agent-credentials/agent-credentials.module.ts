import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditResolverRegistry } from '../shared/application/audit-resolver-registry';
import { SharedModule } from '../shared/shared.module';
import { AgentCredentialsService } from './application/agent-credentials.service';
import { AgentCredential } from './domain/agent-credential.entity';
import { AgentCredentialRepository } from './infrastructure/agent-credential.repository';
import { AgentCredentialsController } from './interface/agent-credentials.controller';

/**
 * Wave 1.13 [3c] — m2-mcp-agent-registry-bench BC. Owns the
 * `agent_credentials` table + REST surface.
 *
 * Registers a `findById`-shaped resolver against `AuditResolverRegistry`
 * for `aggregate_type='agent_credential'` so the existing 3a
 * `BeforeAfterAuditInterceptor` can capture `payload_before` on revoke /
 * delete operations. Public keys are NOT stripped from the resolved row
 * — they are server-side internal state and the audit table already
 * lives behind Owner+Manager RBAC.
 */
@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([AgentCredential])],
  providers: [AgentCredentialsService, AgentCredentialRepository],
  controllers: [AgentCredentialsController],
  exports: [AgentCredentialsService, AgentCredentialRepository],
})
export class AgentCredentialsModule implements OnApplicationBootstrap {
  constructor(
    private readonly repo: AgentCredentialRepository,
    private readonly registry: AuditResolverRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register('agent_credential', async (id, req) => {
      const orgId = (req as { user?: { organizationId?: string } }).user?.organizationId;
      if (!orgId) return null;
      try {
        return (await this.repo.findOne({ where: { id, organizationId: orgId } })) ?? null;
      } catch {
        return null;
      }
    });
  }
}
