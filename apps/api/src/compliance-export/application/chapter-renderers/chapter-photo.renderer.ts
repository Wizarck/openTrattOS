import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ChapterSection, Locale } from '../../types';
import { csvRow, emptyChapter, pdfHeading } from './chapter-helpers';

/**
 * Chapter renderer for photo provenance (slice #18 m3-photo-storage-
 * lifecycle). Reads `photos` filtered by `(organization_id, created_at
 * BETWEEN range)`.
 *
 * Per j9 §Edge cases: when zero photos in range, the chapter renders as
 * a single line "Sin fotos de aprovisionamiento en este rango." — the
 * chapter is INCLUDED for completeness (the operator can prove nothing
 * was hidden); empty is honest.
 */
@Injectable()
export class ChapterPhotoRenderer {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async render(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    _locale: Locale,
    _locationIds?: ReadonlyArray<string>,
  ): Promise<ChapterSection> {
    const rows = await this.queryPhotos(organizationId, rangeStart, rangeEnd);
    if (rows.length === 0) {
      return emptyChapter(
        'CAPÍTULO PHOTO — proveniencia de fotos',
        'CAPÍTULO PHOTO — proveniencia de fotos',
        'Sin fotos de aprovisionamiento en este rango.',
      );
    }

    const csvParts: string[] = [];
    csvParts.push('## CAPÍTULO PHOTO — proveniencia de fotos');
    csvParts.push(
      csvRow([
        'id',
        's3_key',
        'mime_type',
        'byte_size',
        'retention_class',
        'uploaded_by_user_id',
        'created_at',
        'deleted_at',
      ]),
    );

    const pdfLines: string[] = [];
    pdfLines.push(pdfHeading('CAPÍTULO PHOTO — proveniencia de fotos'));

    for (const p of rows) {
      csvParts.push(
        csvRow([
          p.id,
          p.s3_key,
          p.mime_type,
          p.byte_size,
          p.retention_class,
          p.uploaded_by_user_id ?? '',
          toIso(p.created_at),
          p.deleted_at ? toIso(p.deleted_at) : '',
        ]),
      );
      pdfLines.push(
        `${toIso(p.created_at)}  PHOTO ${p.id}  size=${p.byte_size}B  class=${p.retention_class}`,
      );
    }
    return {
      csvSection: csvParts.join('\n') + '\n',
      pdfSection: Buffer.from(pdfLines.join('\n') + '\n', 'utf8'),
      rowCount: rows.length,
    };
  }

  private async queryPhotos(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<PhotoRow[]> {
    try {
      const sql = `
        SELECT id, s3_key, mime_type, byte_size, retention_class,
               uploaded_by_user_id, created_at, deleted_at
        FROM photos
        WHERE organization_id = $1
          AND created_at BETWEEN $2 AND $3
        ORDER BY created_at ASC, id ASC
      `;
      return (await this.ds.query(sql, [
        organizationId,
        rangeStart,
        rangeEnd,
      ])) as PhotoRow[];
    } catch {
      return [];
    }
  }
}

interface PhotoRow {
  id: string;
  s3_key: string;
  mime_type: string;
  byte_size: number;
  retention_class: string;
  uploaded_by_user_id: string | null;
  created_at: Date | string;
  deleted_at: Date | string | null;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}
