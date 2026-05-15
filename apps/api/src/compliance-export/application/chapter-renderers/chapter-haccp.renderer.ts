import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ChapterSection, Locale } from '../../types';
import { csvRow, emptyChapter, pdfHeading } from './chapter-helpers';

/**
 * Chapter renderer for HACCP records (slice #9 m3-ccp-reading-aggregate).
 * Reads `haccp_ccp_readings` + `haccp_corrective_actions` filtered by
 * `(organization_id, recorded_at BETWEEN range)`.
 *
 * The renderer is read-only on the haccp BC — we use the raw DataSource
 * with parameterised SQL so this slice does NOT take an import dep on
 * `apps/api/src/haccp/`. (Cross-BC contract pattern.)
 */
@Injectable()
export class ChapterHaccpRenderer {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async render(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    _locale: Locale,
    locationIds?: ReadonlyArray<string>,
  ): Promise<ChapterSection> {
    const readings = await this.queryReadings(
      organizationId,
      rangeStart,
      rangeEnd,
      locationIds,
    );
    const actions = await this.queryCorrectiveActions(
      organizationId,
      rangeStart,
      rangeEnd,
    );

    if (readings.length === 0 && actions.length === 0) {
      return emptyChapter(
        'CAPÍTULO HACCP — lecturas CCP + acciones correctivas',
        'CAPÍTULO HACCP — lecturas CCP + acciones correctivas',
        'Sin registros HACCP en este rango.',
      );
    }

    const csvParts: string[] = [];
    csvParts.push('## CAPÍTULO HACCP — lecturas CCP + acciones correctivas');
    csvParts.push(
      csvRow([
        'kind',
        'id',
        'ccp_name',
        'value',
        'unit',
        'in_spec',
        'recorded_at',
        'recorded_by',
        'location_id',
        'fsms_standard_id',
        'notes',
      ]),
    );

    const pdfLines: string[] = [];
    pdfLines.push(pdfHeading('CAPÍTULO HACCP — lecturas CCP + acciones correctivas'));

    for (const r of readings) {
      csvParts.push(
        csvRow([
          'reading',
          r.id,
          r.ccp_name,
          r.value,
          r.unit,
          r.in_spec === null ? '' : r.in_spec ? 'true' : 'false',
          toIso(r.recorded_at),
          r.recorded_by ?? '',
          r.location_id ?? '',
          r.fsms_standard_id ?? '',
          r.notes ?? '',
        ]),
      );
      pdfLines.push(
        `${toIso(r.recorded_at)}  CCP=${r.ccp_name} value=${r.value}${r.unit ?? ''} in_spec=${r.in_spec}`,
      );
    }
    for (const a of actions) {
      csvParts.push(
        csvRow([
          'corrective_action',
          a.id,
          a.action_kind ?? '',
          '',
          '',
          '',
          toIso(a.recorded_at),
          a.recorded_by ?? '',
          '',
          '',
          a.notes ?? '',
        ]),
      );
      pdfLines.push(
        `${toIso(a.recorded_at)}  ACCIÓN  ${a.action_kind ?? ''}  reading=${a.ccp_reading_id}`,
      );
    }
    return {
      csvSection: csvParts.join('\n') + '\n',
      pdfSection: Buffer.from(pdfLines.join('\n') + '\n', 'utf8'),
      rowCount: readings.length + actions.length,
    };
  }

  private async queryReadings(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    locationIds?: ReadonlyArray<string>,
  ): Promise<HaccpReadingRow[]> {
    const hasLocFilter = locationIds && locationIds.length > 0;
    const params: unknown[] = [organizationId, rangeStart, rangeEnd];
    let locClause = '';
    if (hasLocFilter) {
      params.push([...locationIds]);
      locClause = ' AND location_id = ANY($4::uuid[])';
    }
    try {
      const sql = `
        SELECT id, ccp_name, value, unit, in_spec, recorded_at,
               recorded_by, location_id, fsms_standard_id, notes
        FROM haccp_ccp_readings
        WHERE organization_id = $1
          AND recorded_at BETWEEN $2 AND $3
          ${locClause}
        ORDER BY recorded_at ASC, id ASC
      `;
      return (await this.ds.query(sql, params)) as HaccpReadingRow[];
    } catch {
      return [];
    }
  }

  private async queryCorrectiveActions(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<HaccpCorrectiveActionRow[]> {
    try {
      const sql = `
        SELECT id, ccp_reading_id, action_kind, recorded_at, recorded_by, notes
        FROM haccp_corrective_actions
        WHERE organization_id = $1
          AND recorded_at BETWEEN $2 AND $3
        ORDER BY recorded_at ASC, id ASC
      `;
      return (await this.ds.query(sql, [organizationId, rangeStart, rangeEnd])) as HaccpCorrectiveActionRow[];
    } catch {
      return [];
    }
  }
}

interface HaccpReadingRow {
  id: string;
  ccp_name: string;
  value: string;
  unit: string | null;
  in_spec: boolean | null;
  recorded_at: Date | string;
  recorded_by: string | null;
  location_id: string | null;
  fsms_standard_id: string | null;
  notes: string | null;
}

interface HaccpCorrectiveActionRow {
  id: string;
  ccp_reading_id: string;
  action_kind: string | null;
  recorded_at: Date | string;
  recorded_by: string | null;
  notes: string | null;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}
