import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Resolves the "before" state of an aggregate for the
 * `BeforeAfterAuditInterceptor`. Implementations typically delegate to the
 * BC's primary read service:
 *
 *     registry.register('recipe', (id, req) =>
 *       this.recipesService.findById(req.user.organizationId, id),
 *     );
 *
 * The resolver MAY return `null` (e.g. when the entity does not exist) —
 * the interceptor treats `null` as "no before captured".
 *
 * Resolvers MUST NOT throw. If the underlying read fails (e.g. transient DB
 * error during the audit fetch), the resolver SHOULD return `null` and let
 * the primary handler proceed unaffected.
 */
export type AuditResolver = (id: string, req: Request) => Promise<unknown | null>;

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: per-aggregate-type resolver
 * registry, populated by each BC's `onApplicationBootstrap` hook.
 *
 * Singleton-scoped. Kept on the registry rather than relying on
 * `@Inject` of services from the interceptor because the interceptor lives
 * in the `shared/` module which has zero domain-knowledge — and the
 * resolver list is open-ended (any future BC may register).
 */
@Injectable()
export class AuditResolverRegistry {
  private readonly resolvers = new Map<string, AuditResolver>();

  register(aggregateType: string, resolver: AuditResolver): void {
    this.resolvers.set(aggregateType, resolver);
  }

  resolverFor(aggregateType: string): AuditResolver | undefined {
    return this.resolvers.get(aggregateType);
  }

  /** Test/diagnostic helper. */
  registeredTypes(): string[] {
    return [...this.resolvers.keys()];
  }
}
