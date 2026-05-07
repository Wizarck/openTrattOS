/**
 * Wire shape mirroring apps/api `AuditLogResponseDto`. Keep aligned with
 * `apps/api/src/audit-log/interface/dto/audit-log-response.dto.ts`.
 */
export interface AuditLogRow {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: 'user' | 'agent' | 'system';
  agentName: string | null;
  payloadBefore: unknown;
  payloadAfter: unknown;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
  /** ISO-8601 timestamp string. */
  createdAt: string;
}

export interface AuditLogTableProps {
  rows: AuditLogRow[];
  expandedRowId: string | null;
  onToggleExpand: (id: string) => void;
  loading?: boolean;
}
