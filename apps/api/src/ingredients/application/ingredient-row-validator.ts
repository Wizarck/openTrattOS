import { Category } from '../domain/category.entity';
import { BaseUnitType, Ingredient } from '../domain/ingredient.entity';

const BASE_UNIT_TYPES: ReadonlySet<BaseUnitType> = new Set(['WEIGHT', 'VOLUME', 'UNIT']);

/** Required + optional CSV columns (case-insensitive header match in the parser). */
export interface IngredientCsvRow {
  name: string;
  categoryName: string;
  baseUnitType: string;
  internalCode?: string;
  densityFactor?: string;
  notes?: string;
}

export interface RowError {
  rowIndex: number;
  column: string;
  code: string;
  message: string;
  value?: string;
}

export type RowValidation =
  | { ok: true; ingredient: Ingredient }
  | { ok: false; errors: RowError[] };

/**
 * Resolves a `categoryName` cell to a Category id. Supports a slug-path syntax
 * `parent/child/grand-child` (matched by `Category.name` segments) and a flat
 * case-insensitive lookup. Ambiguous flat lookups (same name under different
 * parents) are rejected — caller is told to use the slug path.
 */
export class CategoryResolver {
  private readonly byId: Map<string, Category>;
  private readonly bySlugPath: Map<string, Category>;
  private readonly byNameLowerCount: Map<string, Category[]>;

  constructor(categories: readonly Category[]) {
    this.byId = new Map(categories.map((c) => [c.id, c]));
    this.byNameLowerCount = new Map();
    for (const c of categories) {
      const key = c.name.toLowerCase();
      const list = this.byNameLowerCount.get(key) ?? [];
      list.push(c);
      this.byNameLowerCount.set(key, list);
    }
    this.bySlugPath = new Map();
    for (const c of categories) {
      this.bySlugPath.set(this.slugPath(c, this.byId), c);
    }
  }

  private slugPath(c: Category, byId: ReadonlyMap<string, Category>): string {
    const segments: string[] = [c.name];
    let current = c;
    while (current.parentId !== null) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      segments.unshift(parent.name);
      current = parent;
    }
    return segments.join('/');
  }

  resolve(input: string): { ok: true; categoryId: string } | { ok: false; code: string; hint?: string } {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return { ok: false, code: 'CATEGORY_NOT_FOUND' };
    }
    if (trimmed.includes('/')) {
      const path = trimmed.toLowerCase();
      // Path is case-insensitive on segment names
      for (const [slug, cat] of this.bySlugPath) {
        if (slug.toLowerCase() === path) {
          return { ok: true, categoryId: cat.id };
        }
      }
      return { ok: false, code: 'CATEGORY_NOT_FOUND' };
    }
    const matches = this.byNameLowerCount.get(trimmed.toLowerCase()) ?? [];
    if (matches.length === 0) {
      return { ok: false, code: 'CATEGORY_NOT_FOUND' };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        code: 'CATEGORY_AMBIGUOUS_NAME',
        hint: 'Use slug path (e.g. dry-pantry/oils-vinegars)',
      };
    }
    return { ok: true, categoryId: matches[0].id };
  }
}

/**
 * Validates a single parsed CSV row against the M1 Ingredient invariants.
 * Returns either an Ingredient ready to persist, or a list of errors keyed
 * by the offending column. Caller is responsible for passing a fresh
 * `categoriesByName` resolver per import session (categories are org-scoped).
 */
export class IngredientRowValidator {
  constructor(
    private readonly organizationId: string,
    private readonly resolver: CategoryResolver,
  ) {}

  validate(row: IngredientCsvRow, rowIndex: number): RowValidation {
    const errors: RowError[] = [];

    // Required: name
    if (!row.name || row.name.trim().length === 0) {
      errors.push({
        rowIndex,
        column: 'name',
        code: 'INGREDIENT_NAME_REQUIRED',
        message: 'name must be a non-empty string',
        value: row.name,
      });
    }

    // Required: baseUnitType
    if (!BASE_UNIT_TYPES.has(row.baseUnitType as BaseUnitType)) {
      errors.push({
        rowIndex,
        column: 'baseUnitType',
        code: 'INGREDIENT_INVALID_BASE_UNIT_TYPE',
        message: `baseUnitType must be one of WEIGHT, VOLUME, UNIT`,
        value: row.baseUnitType,
      });
    }

    // Required: categoryName resolved to a real category
    let categoryId: string | undefined;
    if (!row.categoryName || row.categoryName.trim().length === 0) {
      errors.push({
        rowIndex,
        column: 'categoryName',
        code: 'CATEGORY_NOT_FOUND',
        message: 'categoryName is required',
      });
    } else {
      const resolved = this.resolver.resolve(row.categoryName);
      if (resolved.ok) {
        categoryId = resolved.categoryId;
      } else {
        errors.push({
          rowIndex,
          column: 'categoryName',
          code: resolved.code,
          message: resolved.hint ?? `Category "${row.categoryName}" not found in this organization`,
          value: row.categoryName,
        });
      }
    }

    // Optional: densityFactor (number, positive, forbidden for UNIT)
    let densityFactor: number | null = null;
    if (row.densityFactor !== undefined && row.densityFactor.trim() !== '') {
      const parsed = Number(row.densityFactor);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        errors.push({
          rowIndex,
          column: 'densityFactor',
          code: 'INGREDIENT_DENSITY_NON_POSITIVE',
          message: 'densityFactor must be a positive finite number',
          value: row.densityFactor,
        });
      } else if (row.baseUnitType === 'UNIT') {
        errors.push({
          rowIndex,
          column: 'densityFactor',
          code: 'INGREDIENT_DENSITY_FORBIDDEN_FOR_UNIT',
          message: 'densityFactor is not applicable to UNIT-family ingredients',
          value: row.densityFactor,
        });
      } else {
        densityFactor = parsed;
      }
    }

    if (errors.length > 0 || categoryId === undefined) {
      return { ok: false, errors };
    }

    // All checks passed; build the entity (factory does its own final validation)
    try {
      const ingredient = Ingredient.create({
        organizationId: this.organizationId,
        categoryId,
        name: row.name,
        baseUnitType: row.baseUnitType as BaseUnitType,
        internalCode: row.internalCode && row.internalCode.trim() ? row.internalCode.trim() : undefined,
        densityFactor,
        notes: row.notes && row.notes.trim() ? row.notes.trim() : null,
      });
      return { ok: true, ingredient };
    } catch (err) {
      return {
        ok: false,
        errors: [
          {
            rowIndex,
            column: 'name',
            code: 'INGREDIENT_FACTORY_REJECTED',
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      };
    }
  }
}

/** Strictly-required column headers (the parser rejects CSVs missing any of these). */
export const REQUIRED_COLUMNS: readonly string[] = ['name', 'categoryName', 'baseUnitType'];

/** Optional column headers that the parser accepts but does not require. */
export const OPTIONAL_COLUMNS: readonly string[] = ['internalCode', 'densityFactor', 'notes'];
