import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentIdempotencyService } from './application/agent-idempotency.service';
import { AuditResolverRegistry } from './application/audit-resolver-registry';
import { AgentIdempotencyKey } from './domain/agent-idempotency-key.entity';

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: globally-available cross-cutting
 * services consumed by every BC module's `onApplicationBootstrap` hook
 * (AuditResolverRegistry) and the global IdempotencyMiddleware
 * (AgentIdempotencyService).
 *
 * `@Global()` decoration eliminates the need for each BC module to import
 * SharedModule explicitly — the providers are reachable from any module's
 * DI graph, including TestingModules built ad-hoc by INT specs.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AgentIdempotencyKey])],
  providers: [AuditResolverRegistry, AgentIdempotencyService],
  exports: [AuditResolverRegistry, AgentIdempotencyService, TypeOrmModule],
})
export class SharedModule {}
