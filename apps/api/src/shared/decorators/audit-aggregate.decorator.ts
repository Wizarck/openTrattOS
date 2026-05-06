import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const AUDIT_AGGREGATE_KEY = 'audit-aggregate';

/**
 * Per-handler metadata read by `BeforeAfterAuditInterceptor`. The interceptor
 * only fires when `req.agentContext?.viaAgent === true` AND the handler
 * carries this metadata.
 *
 * - `aggregateType`: stable identifier (`recipe`, `menu_item`, `ingredient`,
 *   etc.) — matches the `aggregate_type` column in `audit_log`.
 * - `idExtractor`: pulls the aggregate id from the request. Defaults to
 *   `req.params.id`. Pass `null` for create operations where no id exists
 *   yet — the interceptor synthesises the id from the response payload.
 */
export interface AuditAggregateMeta {
  aggregateType: string;
  idExtractor: ((req: Request) => string | null) | null;
}

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: decorator for write controllers.
 *
 * Usage:
 *
 *     @Put(':id')
 *     @AuditAggregate('recipe')
 *     async update(...) { ... }
 *
 *     @Post()
 *     @AuditAggregate('recipe', null)  // create — no before
 *     async create(...) { ... }
 *
 *     @Put(':id/lines/:lineId/source')
 *     @AuditAggregate('recipe', (req) => req.params?.id ?? null)
 *     async setLineSource(...) { ... }
 */
export const AuditAggregate = (
  aggregateType: string,
  idExtractor: AuditAggregateMeta['idExtractor'] = (req) =>
    (req.params as { id?: string } | undefined)?.id ?? null,
): MethodDecorator =>
  SetMetadata(AUDIT_AGGREGATE_KEY, { aggregateType, idExtractor });
