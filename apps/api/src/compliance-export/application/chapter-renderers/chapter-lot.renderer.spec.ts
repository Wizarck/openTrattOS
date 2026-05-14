import type { DataSource } from 'typeorm';
import { ChapterLotRenderer } from './chapter-lot.renderer';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeDs(
  lots: unknown[] = [],
  moves: unknown[] = [],
): { ds: DataSource } {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM lots')) return lots;
      if (sql.includes('FROM stock_moves')) return moves;
      return [];
    }),
  } as unknown as DataSource;
  return { ds };
}

describe('ChapterLotRenderer.render', () => {
  it('emits the empty-range marker when no lots/moves match', async () => {
    const { ds } = makeDs();
    const renderer = new ChapterLotRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(0);
    expect(section.csvSection).toContain('Sin lotes registrados en este rango.');
  });

  it('renders lot + stock_move rows ordered chronologically', async () => {
    const { ds } = makeDs(
      [
        {
          id: 'l1',
          lot_code: 'TUNA-001',
          supplier_id: 's1',
          received_at: '2026-02-10T10:00:00Z',
          expires_at: null,
          quantity_received: 50,
          unit: 'kg',
          location_id: 'loc-1',
          created_at: '2026-02-10T10:00:00Z',
        },
      ],
      [
        {
          id: 'm1',
          lot_id: 'l1',
          kind: 'consume',
          quantity: 10,
          unit: 'kg',
          location_id: 'loc-1',
          created_at: '2026-02-12T11:00:00Z',
        },
      ],
    );
    const renderer = new ChapterLotRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(2);
    expect(section.csvSection).toContain('lot,l1,TUNA-001');
    expect(section.csvSection).toContain('stock_move,m1');
  });
});
