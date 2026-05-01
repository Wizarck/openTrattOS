import { Injectable } from '@nestjs/common';
import { stringify } from 'csv-stringify';
import { Writable } from 'node:stream';
import { Category } from '../domain/category.entity';
import { CategoryRepository } from '../infrastructure/category.repository';
import { IngredientRepository } from '../infrastructure/ingredient.repository';

export interface ExportOptions {
  organizationId: string;
  /** Override the page size used internally (defaults to 200). Test override; prod leaves the default. */
  pageSize?: number;
  /** When true, include soft-deleted (`isActive=false`) rows. Default false. */
  includeInactive?: boolean;
}

const DEFAULT_PAGE_SIZE = 200;
export const EXPORT_HEADER = ['name', 'categoryName', 'baseUnitType', 'internalCode', 'densityFactor', 'notes'] as const;

@Injectable()
export class IngredientExportService {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly categories: CategoryRepository,
  ) {}

  /**
   * Streams the org's ingredient list as CSV through `dest`. Cursor-paginates
   * the underlying query so heap usage stays bounded regardless of total
   * row count (per design.md §D5). Categories are loaded once at the top
   * of the export and cached locally; the slug-path is round-trip safe with
   * the import schema.
   */
  async exportToStream(dest: Writable, options: ExportOptions): Promise<{ rowsExported: number }> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const onlyActive = !options.includeInactive;

    const allCats = await this.categories.findBy({ organizationId: options.organizationId });
    const slugByCategoryId = this.buildSlugIndex(allCats);

    const stringifier = stringify({
      header: true,
      columns: [...EXPORT_HEADER],
    });
    stringifier.pipe(dest, { end: true });

    let cursor: string | null = null;
    let rowsExported = 0;
    while (true) {
      const page = await this.ingredients.pageByOrganization(options.organizationId, cursor, pageSize, onlyActive);
      for (const ing of page.items) {
        const categorySlug = slugByCategoryId.get(ing.categoryId) ?? '';
        await new Promise<void>((resolve, reject) => {
          stringifier.write(
            {
              name: ing.name,
              categoryName: categorySlug,
              baseUnitType: ing.baseUnitType,
              internalCode: ing.internalCode,
              densityFactor: ing.densityFactor === null || ing.densityFactor === undefined ? '' : String(ing.densityFactor),
              notes: ing.notes ?? '',
            },
            (err) => (err ? reject(err) : resolve()),
          );
        });
        rowsExported += 1;
      }
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    stringifier.end();
    return { rowsExported };
  }

  private buildSlugIndex(categories: readonly Category[]): Map<string, string> {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const slug = new Map<string, string>();
    for (const c of categories) {
      const segments = [c.name];
      let current: Category | undefined = c;
      while (current && current.parentId !== null) {
        const parent = byId.get(current.parentId);
        if (!parent) break;
        segments.unshift(parent.name);
        current = parent;
      }
      slug.set(c.id, segments.join('/'));
    }
    return slug;
  }
}
