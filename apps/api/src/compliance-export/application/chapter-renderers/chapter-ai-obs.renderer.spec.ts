import type { DataSource } from 'typeorm';
import { ChapterAiObsRenderer } from './chapter-ai-obs.renderer';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeDs(rows: unknown[] = []): { ds: DataSource } {
  const ds = {
    query: jest.fn(async () => rows),
  } as unknown as DataSource;
  return { ds };
}

describe('ChapterAiObsRenderer.render', () => {
  it('emits the empty marker when no rollups match', async () => {
    const { ds } = makeDs();
    const renderer = new ChapterAiObsRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(0);
    expect(section.csvSection).toContain('Sin actividad de IA en este rango.');
  });

  it('renders rollup rows with capability + model + cost columns', async () => {
    const { ds } = makeDs([
      {
        bucket_at: '2026-02-15T10:00:00Z',
        capability_name: 'inventory.ingest-invoice-photo',
        model_id: 'claude-3-5-sonnet',
        provider: 'anthropic',
        invocation_count: 12,
        estimated_cost_eur: '0.42',
        error_count: 0,
      },
    ]);
    const renderer = new ChapterAiObsRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(1);
    expect(section.csvSection).toContain(
      'inventory.ingest-invoice-photo',
    );
    expect(section.csvSection).toContain('claude-3-5-sonnet');
    expect(section.csvSection).toContain('0.42');
  });
});
