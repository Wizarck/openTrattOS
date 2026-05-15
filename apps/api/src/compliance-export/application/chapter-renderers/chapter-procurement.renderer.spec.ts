import type { DataSource } from 'typeorm';
import { ChapterProcurementRenderer } from './chapter-procurement.renderer';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeDs(pos: unknown[] = [], grs: unknown[] = []): { ds: DataSource } {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM purchase_orders')) return pos;
      if (sql.includes('FROM goods_receipts')) return grs;
      return [];
    }),
  } as unknown as DataSource;
  return { ds };
}

describe('ChapterProcurementRenderer.render', () => {
  it('emits the empty marker when no PO + no GR match the range', async () => {
    const { ds } = makeDs();
    const renderer = new ChapterProcurementRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(0);
    expect(section.csvSection).toContain(
      'Sin actividad de aprovisionamiento en este rango.',
    );
  });

  it('renders PO and GR rows with kind markers', async () => {
    const { ds } = makeDs(
      [
        {
          id: 'po1',
          po_number: 'PO-2026-001',
          supplier_id: 's1',
          location_id: 'loc-1',
          status: 'sent',
          total_amount: '1200.00',
          created_at: '2026-02-12T10:00:00Z',
        },
      ],
      [
        {
          id: 'gr1',
          gr_number: 'GR-2026-001',
          po_id: 'po1',
          supplier_id: 's1',
          location_id: 'loc-1',
          status: 'confirmed',
          created_at: '2026-02-15T11:00:00Z',
        },
      ],
    );
    const renderer = new ChapterProcurementRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(2);
    expect(section.csvSection).toContain('purchase_order,po1,PO-2026-001');
    expect(section.csvSection).toContain('goods_receipt,gr1');
  });
});
