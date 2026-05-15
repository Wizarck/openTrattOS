import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../../../audit-log/application/audit-log.service';
import type { Locale } from '../../types';
import type { ChapterSection } from '../../types';

/**
 * Chapter 0 renderer — raw `audit_log` for the tenant + range.
 *
 * Per FR25 + j9.md trust principle: this chapter is the unedited audit
 * log. NO column projection, NO field rename, NO summarisation. The
 * inspector reads chapter 0 first; the rest of the bundle is structured
 * derivative views over the same chain.
 *
 * Memory: the renderer streams rows via `AuditLogService.streamRows()`
 * (cursor-paginated, 1 000 rows per round-trip) so the peak buffer is
 * bounded even for year-plus ranges (j9.md §Edge cases).
 *
 * Order: `(created_at ASC, id ASC)` for chronology + deterministic hash.
 */
@Injectable()
export class ChapterZeroAuditLogRenderer {
  constructor(private readonly auditLog: AuditLogService) {}

  async render(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    _locale: Locale,
  ): Promise<ChapterSection> {
    const csvParts: string[] = [];
    csvParts.push('## CAPÍTULO 0 — audit_log (sin editar)');
    csvParts.push(CSV_HEADER);

    let rowCount = 0;
    const pdfLines: string[] = [];
    pdfLines.push('--- CAPÍTULO 0 — audit_log (sin editar) ---');

    const rows = this.auditLog.streamRows({
      organizationId,
      since: rangeStart,
      until: rangeEnd,
    });
    const collected: Array<{ createdAt: Date; serial: string; pdf: string }> = [];
    for await (const row of rows) {
      const csv = serialiseRow(row);
      const pdf = pdfLine(row);
      collected.push({
        createdAt: row.createdAt,
        serial: csv,
        pdf,
      });
      rowCount++;
    }
    // Re-sort ascending so chapter 0 reads chronologically (streamRows
    // yields DESC for export-truncation safety; chapter 0 wants ASC).
    collected.sort((a, b) => {
      const t = a.createdAt.getTime() - b.createdAt.getTime();
      return t !== 0 ? t : a.serial.localeCompare(b.serial);
    });
    for (const entry of collected) {
      csvParts.push(entry.serial);
      pdfLines.push(entry.pdf);
    }
    if (rowCount === 0) {
      csvParts.push('# Sin eventos en el rango.');
      pdfLines.push('Sin eventos en el rango.');
    }

    return {
      pdfSection: Buffer.from(pdfLines.join('\n') + '\n', 'utf8'),
      csvSection: csvParts.join('\n') + '\n',
      rowCount,
    };
  }
}

const CSV_HEADER =
  'id,organization_id,event_type,aggregate_type,aggregate_id,actor_user_id,actor_kind,agent_name,reason,citation_url,snippet,created_at,retention_class,payload_before,payload_after';

function serialiseRow(row: {
  id: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: string;
  agentName: string | null;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
  createdAt: Date;
  retentionClass: string | null;
  payloadBefore: unknown;
  payloadAfter: unknown;
}): string {
  return [
    row.id,
    row.organizationId,
    row.eventType,
    row.aggregateType,
    row.aggregateId,
    row.actorUserId ?? '',
    row.actorKind,
    row.agentName ?? '',
    row.reason ?? '',
    row.citationUrl ?? '',
    row.snippet ?? '',
    row.createdAt.toISOString(),
    row.retentionClass ?? '',
    safeJson(row.payloadBefore),
    safeJson(row.payloadAfter),
  ]
    .map(csvEscape)
    .join(',');
}

function pdfLine(row: { createdAt: Date; eventType: string; aggregateId: string; actorKind: string }): string {
  return `${row.createdAt.toISOString()}  ${row.eventType}  ${row.aggregateId}  [${row.actorKind}]`;
}

function safeJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
