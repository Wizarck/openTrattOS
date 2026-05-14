import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ChapterSection, Locale } from '../../types';
import { csvRow, emptyChapter, pdfHeading } from './chapter-helpers';

/**
 * Chapter renderer for lot lifecycle (slice #1 m3-lot-aggregate +
 * slice #2 m3-lot-consumption-events). Reads `lots` + `stock_moves`
 * filtered by `(organization_id, created_at BETWEEN range)`.
 *
 * Cross-BC contract pattern: raw SQL via DataSource, no import on
 * `apps/api/src/inventory/`.
 */
@Injectable()
export class ChapterLotRenderer {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async render(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    _locale: Locale,
    locationIds?: ReadonlyArray<string>,
  ): Promise<ChapterSection> {
    const lots = await this.queryLots(organizationId, rangeStart, rangeEnd, locationIds);
    const moves = await this.queryStockMoves(
      organizationId,
      rangeStart,
      rangeEnd,
      locationIds,
    );

    if (lots.length === 0 && moves.length === 0) {
      return emptyChapter(
        'CAPÍTULO LOT — ciclo de vida de lotes',
        'CAPÍTULO LOT — ciclo de vida de lotes',
        'Sin lotes registrados en este rango.',
      );
    }

    const csvParts: string[] = [];
    csvParts.push('## CAPÍTULO LOT — ciclo de vida de lotes');
    csvParts.push(
      csvRow([
        'kind',
        'id',
        'lot_code',
        'supplier_id',
        'received_at',
        'expires_at',
        'quantity',
        'unit',
        'location_id',
        'created_at',
        'move_kind',
      ]),
    );

    const pdfLines: string[] = [];
    pdfLines.push(pdfHeading('CAPÍTULO LOT — ciclo de vida de lotes'));

    for (const l of lots) {
      csvParts.push(
        csvRow([
          'lot',
          l.id,
          l.lot_code ?? '',
          l.supplier_id ?? '',
          toIso(l.received_at),
          l.expires_at ? toIso(l.expires_at) : '',
          l.quantity_received ?? '',
          l.unit ?? '',
          l.location_id ?? '',
          toIso(l.created_at),
          '',
        ]),
      );
      pdfLines.push(
        `${toIso(l.created_at)}  LOTE ${l.lot_code ?? l.id}  qty=${l.quantity_received}${l.unit ?? ''}`,
      );
    }
    for (const m of moves) {
      csvParts.push(
        csvRow([
          'stock_move',
          m.id,
          '',
          '',
          '',
          '',
          m.quantity ?? '',
          m.unit ?? '',
          m.location_id ?? '',
          toIso(m.created_at),
          m.kind ?? '',
        ]),
      );
      pdfLines.push(
        `${toIso(m.created_at)}  MOVIMIENTO  ${m.kind ?? ''}  lot=${m.lot_id}  qty=${m.quantity}${m.unit ?? ''}`,
      );
    }
    return {
      csvSection: csvParts.join('\n') + '\n',
      pdfSection: Buffer.from(pdfLines.join('\n') + '\n', 'utf8'),
      rowCount: lots.length + moves.length,
    };
  }

  private async queryLots(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    locationIds?: ReadonlyArray<string>,
  ): Promise<LotRow[]> {
    const hasLocFilter = locationIds && locationIds.length > 0;
    const params: unknown[] = [organizationId, rangeStart, rangeEnd];
    let locClause = '';
    if (hasLocFilter) {
      params.push([...locationIds]);
      locClause = ' AND location_id = ANY($4::uuid[])';
    }
    try {
      const sql = `
        SELECT id, lot_code, supplier_id, received_at, expires_at,
               quantity_received, unit, location_id, created_at
        FROM lots
        WHERE organization_id = $1
          AND created_at BETWEEN $2 AND $3
          ${locClause}
        ORDER BY created_at ASC, id ASC
      `;
      return (await this.ds.query(sql, params)) as LotRow[];
    } catch {
      return [];
    }
  }

  private async queryStockMoves(
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    locationIds?: ReadonlyArray<string>,
  ): Promise<StockMoveRow[]> {
    const hasLocFilter = locationIds && locationIds.length > 0;
    const params: unknown[] = [organizationId, rangeStart, rangeEnd];
    let locClause = '';
    if (hasLocFilter) {
      params.push([...locationIds]);
      locClause = ' AND location_id = ANY($4::uuid[])';
    }
    try {
      const sql = `
        SELECT id, lot_id, kind, quantity, unit, location_id, created_at
        FROM stock_moves
        WHERE organization_id = $1
          AND created_at BETWEEN $2 AND $3
          ${locClause}
        ORDER BY created_at ASC, id ASC
      `;
      return (await this.ds.query(sql, params)) as StockMoveRow[];
    } catch {
      return [];
    }
  }
}

interface LotRow {
  id: string;
  lot_code: string | null;
  supplier_id: string | null;
  received_at: Date | string;
  expires_at: Date | string | null;
  quantity_received: string | number | null;
  unit: string | null;
  location_id: string | null;
  created_at: Date | string;
}

interface StockMoveRow {
  id: string;
  lot_id: string;
  kind: string | null;
  quantity: string | number | null;
  unit: string | null;
  location_id: string | null;
  created_at: Date | string;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}
