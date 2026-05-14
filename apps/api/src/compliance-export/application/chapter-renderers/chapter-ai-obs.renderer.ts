import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ChapterSection, Locale } from '../../types';
import { csvRow, emptyChapter, pdfHeading } from './chapter-helpers';

/**
 * Chapter renderer for AI cost / observability (slice #19 m3-ai-obs-
 * budget-tier-emitter). Reads `ai_usage_rollup` filtered by
 * `(organization_id, bucket_at BETWEEN range)`.
 */
@Injectable()
export class ChapterAiObsRenderer {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async render(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    _locale: Locale,
    _locationIds?: ReadonlyArray<string>,
  ): Promise<ChapterSection> {
    const rows = await this.queryRollups(organizationId, rangeStart, rangeEnd);
    if (rows.length === 0) {
      return emptyChapter(
        'CAPÍTULO AI-OBS — coste de IA + uso',
        'CAPÍTULO AI-OBS — coste de IA + uso',
        'Sin actividad de IA en este rango.',
      );
    }

    const csvParts: string[] = [];
    csvParts.push('## CAPÍTULO AI-OBS — coste de IA + uso');
    csvParts.push(
      csvRow([
        'bucket_at',
        'capability_name',
        'model_id',
        'provider',
        'invocation_count',
        'estimated_cost_eur',
        'error_count',
      ]),
    );

    const pdfLines: string[] = [];
    pdfLines.push(pdfHeading('CAPÍTULO AI-OBS — coste de IA + uso'));

    for (const r of rows) {
      csvParts.push(
        csvRow([
          toIso(r.bucket_at),
          r.capability_name ?? '',
          r.model_id ?? '',
          r.provider ?? '',
          r.invocation_count ?? '',
          r.estimated_cost_eur ?? '',
          r.error_count ?? '',
        ]),
      );
      pdfLines.push(
        `${toIso(r.bucket_at)}  ${r.capability_name ?? ''}  ${r.model_id ?? ''}  invocations=${r.invocation_count}  cost=€${r.estimated_cost_eur}`,
      );
    }
    return {
      csvSection: csvParts.join('\n') + '\n',
      pdfSection: Buffer.from(pdfLines.join('\n') + '\n', 'utf8'),
      rowCount: rows.length,
    };
  }

  private async queryRollups(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<AiRollupRow[]> {
    try {
      const sql = `
        SELECT bucket_at, capability_name, model_id, provider,
               invocation_count, estimated_cost_eur, error_count
        FROM ai_usage_rollup
        WHERE organization_id = $1
          AND bucket_at BETWEEN $2 AND $3
        ORDER BY bucket_at ASC, capability_name ASC, model_id ASC
      `;
      return (await this.ds.query(sql, [
        organizationId,
        rangeStart,
        rangeEnd,
      ])) as AiRollupRow[];
    } catch {
      return [];
    }
  }
}

interface AiRollupRow {
  bucket_at: Date | string;
  capability_name: string | null;
  model_id: string | null;
  provider: string | null;
  invocation_count: number | string | null;
  estimated_cost_eur: string | number | null;
  error_count: number | string | null;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}
