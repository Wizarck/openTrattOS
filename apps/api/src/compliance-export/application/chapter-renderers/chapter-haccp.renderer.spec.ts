import type { DataSource } from 'typeorm';
import { ChapterHaccpRenderer } from './chapter-haccp.renderer';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeDs(
  readings: unknown[] = [],
  actions: unknown[] = [],
): { ds: DataSource; calls: Array<{ sql: string; params: unknown[] }> } {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const ds = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('haccp_ccp_readings')) return readings;
      if (sql.includes('haccp_corrective_actions')) return actions;
      return [];
    }),
  } as unknown as DataSource;
  return { ds, calls };
}

describe('ChapterHaccpRenderer.render', () => {
  it('returns the empty-range marker when no readings + no actions match', async () => {
    const { ds } = makeDs();
    const renderer = new ChapterHaccpRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(0);
    expect(section.csvSection).toContain('Sin registros HACCP en este rango.');
  });

  it('applies the tenant + range filter on every query', async () => {
    const { ds, calls } = makeDs();
    const renderer = new ChapterHaccpRenderer(ds);
    const start = new Date('2026-02-01');
    const end = new Date('2026-04-30');
    await renderer.render(ORG, start, end, 'es-ES');
    for (const c of calls) {
      expect(c.params[0]).toBe(ORG);
      expect(c.params[1]).toBe(start);
      expect(c.params[2]).toBe(end);
    }
  });

  it('appends the location IN-list filter when locationIds are supplied', async () => {
    const { ds, calls } = makeDs();
    const renderer = new ChapterHaccpRenderer(ds);
    await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
      ['loc-a', 'loc-b'],
    );
    const haccpQuery = calls.find((c) => c.sql.includes('haccp_ccp_readings'))!;
    expect(haccpQuery.sql).toContain('location_id = ANY($4::uuid[])');
    expect(haccpQuery.params[3]).toEqual(['loc-a', 'loc-b']);
  });

  it('serialises readings + corrective actions into the chapter CSV', async () => {
    const { ds } = makeDs(
      [
        {
          id: 'r1',
          ccp_name: 'frozen',
          value: '-18',
          unit: 'C',
          in_spec: true,
          recorded_at: '2026-02-15T10:00:00Z',
          recorded_by: 'u1',
          location_id: 'loc-1',
          fsms_standard_id: 'fs-1',
          notes: null,
        },
      ],
      [
        {
          id: 'a1',
          ccp_reading_id: 'r1',
          action_kind: 'cooler_check',
          recorded_at: '2026-02-15T10:05:00Z',
          recorded_by: 'u1',
          notes: null,
        },
      ],
    );
    const renderer = new ChapterHaccpRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(2);
    expect(section.csvSection).toContain('reading,r1,frozen');
    expect(section.csvSection).toContain('corrective_action,a1,cooler_check');
  });
});
