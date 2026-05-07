export interface AuditLogRowDetailProps {
  payloadBefore: unknown;
  payloadAfter: unknown;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
}
