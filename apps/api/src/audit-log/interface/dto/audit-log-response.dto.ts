import { AuditActorKind } from '../../domain/audit-log.entity';

export interface AuditLogResponseDto {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: AuditActorKind;
  agentName: string | null;
  payloadBefore: unknown;
  payloadAfter: unknown;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
  createdAt: string;
}

export interface AuditLogPageDto {
  rows: AuditLogResponseDto[];
  total: number;
  limit: number;
  offset: number;
}
