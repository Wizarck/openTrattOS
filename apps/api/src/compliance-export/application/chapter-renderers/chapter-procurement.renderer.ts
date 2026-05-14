import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ChapterSection, Locale } from '../../types';
import { csvRow, emptyChapter, pdfHeading } from './chapter-helpers';

/**
 * Chapter renderer for procurement (slices #6 + #7 m3-po-aggregate /
 * m3-gr-aggregate-reconciliation). Reads `purchase_orders` +
 * `goods_receipts` filtered by `(organization_id, created_at BETWEEN range)`.
 */
@Injectable()
export class ChapterProcurementRenderer {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async render(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    _locale: Locale,
    locationIds?: ReadonlyArray<string>,
  ): Promise<ChapterSection> {
    const pos = await this.queryPurchaseOrders(
      organizationId,
      rangeStart,
      rangeEnd,
      locationIds,
    );
    const grs = await this.queryGoodsReceipts(
      organizationId,
      rangeStart,
      rangeEnd,
      locationIds,
    );

    if (pos.length === 0 && grs.length === 0) {
      return emptyChapter(
        'CAPÍTULO PROCUREMENT — PO + GR + reconciliación',
        'CAPÍTULO PROCUREMENT — PO + GR + reconciliación',
        'Sin actividad de aprovisionamiento en este rango.',
      );
    }

    const csvParts: string[] = [];
    csvParts.push('## CAPÍTULO PROCUREMENT — PO + GR + reconciliación');
    csvParts.push(
      csvRow([
        'kind',
        'id',
        'po_number',
        'gr_number',
        'supplier_id',
        'location_id',
        'status',
        'total_amount',
        'created_at',
      ]),
    );

    const pdfLines: string[] = [];
    pdfLines.push(pdfHeading('CAPÍTULO PROCUREMENT — PO + GR + reconciliación'));

    for (const p of pos) {
      csvParts.push(
        csvRow([
          'purchase_order',
          p.id,
          p.po_number ?? '',
          '',
          p.supplier_id ?? '',
          p.location_id ?? '',
          p.status ?? '',
          p.total_amount ?? '',
          toIso(p.created_at),
        ]),
      );
      pdfLines.push(
        `${toIso(p.created_at)}  PO ${p.po_number ?? p.id}  status=${p.status}`,
      );
    }
    for (const g of grs) {
      csvParts.push(
        csvRow([
          'goods_receipt',
          g.id,
          '',
          g.gr_number ?? '',
          g.supplier_id ?? '',
          g.location_id ?? '',
          g.status ?? '',
          '',
          toIso(g.created_at),
        ]),
      );
      pdfLines.push(
        `${toIso(g.created_at)}  GR ${g.gr_number ?? g.id}  po=${g.po_id ?? ''}  status=${g.status}`,
      );
    }
    return {
      csvSection: csvParts.join('\n') + '\n',
      pdfSection: Buffer.from(pdfLines.join('\n') + '\n', 'utf8'),
      rowCount: pos.length + grs.length,
    };
  }

  private async queryPurchaseOrders(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    locationIds?: ReadonlyArray<string>,
  ): Promise<PoRow[]> {
    const hasLocFilter = locationIds && locationIds.length > 0;
    const params: unknown[] = [organizationId, rangeStart, rangeEnd];
    let locClause = '';
    if (hasLocFilter) {
      params.push([...locationIds]);
      locClause = ' AND location_id = ANY($4::uuid[])';
    }
    try {
      const sql = `
        SELECT id, po_number, supplier_id, location_id, status,
               total_amount, created_at
        FROM purchase_orders
        WHERE organization_id = $1
          AND created_at BETWEEN $2 AND $3
          ${locClause}
        ORDER BY created_at ASC, id ASC
      `;
      return (await this.ds.query(sql, params)) as PoRow[];
    } catch {
      return [];
    }
  }

  private async queryGoodsReceipts(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    locationIds?: ReadonlyArray<string>,
  ): Promise<GrRow[]> {
    const hasLocFilter = locationIds && locationIds.length > 0;
    const params: unknown[] = [organizationId, rangeStart, rangeEnd];
    let locClause = '';
    if (hasLocFilter) {
      params.push([...locationIds]);
      locClause = ' AND location_id = ANY($4::uuid[])';
    }
    try {
      const sql = `
        SELECT id, gr_number, po_id, supplier_id, location_id, status, created_at
        FROM goods_receipts
        WHERE organization_id = $1
          AND created_at BETWEEN $2 AND $3
          ${locClause}
        ORDER BY created_at ASC, id ASC
      `;
      return (await this.ds.query(sql, params)) as GrRow[];
    } catch {
      return [];
    }
  }
}

interface PoRow {
  id: string;
  po_number: string | null;
  supplier_id: string | null;
  location_id: string | null;
  status: string | null;
  total_amount: string | number | null;
  created_at: Date | string;
}

interface GrRow {
  id: string;
  gr_number: string | null;
  po_id: string | null;
  supplier_id: string | null;
  location_id: string | null;
  status: string | null;
  created_at: Date | string;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}
