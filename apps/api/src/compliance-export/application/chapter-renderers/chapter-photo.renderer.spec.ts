import type { DataSource } from 'typeorm';
import { ChapterPhotoRenderer } from './chapter-photo.renderer';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeDs(rows: unknown[] = []): { ds: DataSource } {
  const ds = {
    query: jest.fn(async () => rows),
  } as unknown as DataSource;
  return { ds };
}

describe('ChapterPhotoRenderer.render', () => {
  it('emits the exact j9 §Edge-cases marker when no photos in range', async () => {
    const { ds } = makeDs();
    const renderer = new ChapterPhotoRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(0);
    expect(section.csvSection).toContain(
      'Sin fotos de aprovisionamiento en este rango.',
    );
    expect(section.pdfSection.toString()).toContain(
      'Sin fotos de aprovisionamiento en este rango.',
    );
  });

  it('renders photo metadata rows', async () => {
    const { ds } = makeDs([
      {
        id: 'p1',
        s3_key: `org/${ORG}/photos/p1.jpg`,
        mime_type: 'image/jpeg',
        byte_size: 12345,
        retention_class: 'full_res_90d',
        uploaded_by_user_id: 'u1',
        created_at: '2026-02-15T10:00:00Z',
        deleted_at: null,
      },
    ]);
    const renderer = new ChapterPhotoRenderer(ds);
    const section = await renderer.render(
      ORG,
      new Date('2026-02-01'),
      new Date('2026-04-30'),
      'es-ES',
    );
    expect(section.rowCount).toBe(1);
    expect(section.csvSection).toContain('p1,org/11111111');
    expect(section.csvSection).toContain('image/jpeg');
  });
});
