import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Category } from '../domain/category.entity';
import { CategoryRepository } from '../infrastructure/category.repository';

/**
 * CSV import for organization categories.
 *
 * Two-step contract:
 *   1) `preview(orgId, csvContent)` — parse + validate + dedupe against the org's
 *      existing categories. Pure read; no DB mutation.
 *   2) `commit(orgId, payload)` — apply the previewed plan atomically in a single
 *      transaction. Caller picks how to treat duplicates (skip vs update).
 *
 * The parser is handwritten (no `papaparse`/`csv-parse` dep) and tuned for the
 * narrow format documented below — comma-delimited, double-quote escaped, header
 * row required. If the format ever needs to grow, swap in the existing
 * `csv-parse` engine used by `IngredientImportService`.
 *
 * CSV columns (header row required, in any order):
 *   - `nombre`  (REQUIRED) — category name, 2-64 chars after trim
 *   - `padre`   (OPTIONAL) — parent category name; must reference an existing
 *                            category OR another row earlier in this same batch
 *   - `color`   (OPTIONAL) — hex string `#RRGGBB` (case-insensitive); reserved
 *                            for a future column on `categories` — accepted +
 *                            echoed in the preview but NOT persisted today
 *
 * Limits (service-enforced, transport-agnostic):
 *   - File size ≤ 1 MB (1,048,576 bytes)
 *   - Row count ≤ 5,000 data rows (header excluded)
 */

export const CSV_MAX_BYTES = 1 * 1024 * 1024;
export const CSV_MAX_ROWS = 5_000;

const NAME_MIN_LEN = 2;
const NAME_MAX_LEN = 64;
const HEX_COLOR_RX = /^#[0-9a-fA-F]{6}$/;

export interface CategoriesPreviewNewRow {
  name: string;
  parentName?: string;
  color?: string;
}

export interface CategoriesPreviewDuplicateRow {
  name: string;
  parentName?: string;
  color?: string;
  existingId: string;
}

export interface CategoriesPreviewRowError {
  row: number;
  message: string;
}

export interface CategoriesPreviewResult {
  totalRows: number;
  new: CategoriesPreviewNewRow[];
  duplicates: CategoriesPreviewDuplicateRow[];
  errors: CategoriesPreviewRowError[];
}

export type CategoriesImportMode = 'skip-duplicates' | 'update-duplicates';

export interface CategoriesCommitPayload {
  new: CategoriesPreviewNewRow[];
  duplicates: CategoriesPreviewDuplicateRow[];
  mode: CategoriesImportMode;
}

export interface CategoriesCommitResult {
  created: number;
  updated: number;
  skipped: number;
}

export class CategoriesImportFormatError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(`Categories CSV import format error: ${detail}`);
    this.name = 'CategoriesImportFormatError';
    this.detail = detail;
  }
}

interface ParsedRow {
  rowNumber: number; // 1-based, header is row 0 conceptually (1st data row = 1)
  nombre: string;
  padre?: string;
  color?: string;
}

@Injectable()
export class CategoriesImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly categories: CategoryRepository,
  ) {}

  // ───────────────────────────────────────── preview ────────────────────────────────────────

  async preview(orgId: string, csvContent: string): Promise<CategoriesPreviewResult> {
    this.guardSize(csvContent);
    const { rows, errors: parseErrors } = this.parseCsv(csvContent);

    if (rows.length > CSV_MAX_ROWS) {
      throw new CategoriesImportFormatError(
        `CSV exceeds maximum of ${CSV_MAX_ROWS} data rows (received ${rows.length})`,
      );
    }

    const existing = await this.categories.findBy({ organizationId: orgId });
    const existingByName = new Map<string, Category>();
    for (const cat of existing) {
      existingByName.set(cat.name.trim().toLowerCase(), cat);
    }

    const result: CategoriesPreviewResult = {
      totalRows: rows.length,
      new: [],
      duplicates: [],
      errors: [...parseErrors],
    };

    // Track names seen earlier in the batch so `padre` references can resolve
    // against same-file rows. Also catches in-file dupes.
    const batchNamesLower = new Set<string>();
    for (const cat of existing) batchNamesLower.add(cat.name.trim().toLowerCase());

    for (const row of rows) {
      const validation = this.validateRow(row);
      if (validation.errors.length > 0) {
        for (const msg of validation.errors) {
          result.errors.push({ row: row.rowNumber, message: msg });
        }
        continue;
      }

      const cleanedName = row.nombre.trim();
      const cleanedNameLower = cleanedName.toLowerCase();
      const cleanedParent = row.padre?.trim();
      const cleanedColor = row.color?.trim();

      // Parent must reference an existing category OR a previous row in this batch.
      if (cleanedParent !== undefined && cleanedParent.length > 0) {
        if (!batchNamesLower.has(cleanedParent.toLowerCase())) {
          result.errors.push({
            row: row.rowNumber,
            message: `padre "${cleanedParent}" does not match any existing category nor any earlier row in this batch`,
          });
          continue;
        }
      }

      const dupExisting = existingByName.get(cleanedNameLower);
      if (dupExisting) {
        result.duplicates.push({
          name: cleanedName,
          parentName: cleanedParent || undefined,
          color: cleanedColor || undefined,
          existingId: dupExisting.id,
        });
      } else {
        // In-batch duplicate name (no DB row, but a previous CSV row already
        // declared it) — surface as an error so the importer never silently
        // collapses two declarations.
        if (batchNamesLower.has(cleanedNameLower)) {
          result.errors.push({
            row: row.rowNumber,
            message: `nombre "${cleanedName}" is declared twice in this CSV`,
          });
          continue;
        }
        result.new.push({
          name: cleanedName,
          parentName: cleanedParent || undefined,
          color: cleanedColor || undefined,
        });
      }
      batchNamesLower.add(cleanedNameLower);
    }

    return result;
  }

  // ───────────────────────────────────────── commit ─────────────────────────────────────────

  async commit(
    orgId: string,
    payload: CategoriesCommitPayload,
  ): Promise<CategoriesCommitResult> {
    if (payload.mode !== 'skip-duplicates' && payload.mode !== 'update-duplicates') {
      throw new CategoriesImportFormatError(
        `mode must be 'skip-duplicates' or 'update-duplicates'; got "${String(payload.mode)}"`,
      );
    }

    const newRows = Array.isArray(payload.new) ? payload.new : [];
    const dupRows = Array.isArray(payload.duplicates) ? payload.duplicates : [];

    let created = 0;
    let updated = 0;
    let skipped = 0;

    await this.dataSource.transaction(async (em: EntityManager) => {
      const repo = em.getRepository(Category);

      // Load existing categories (inside the txn) for parent-name resolution
      // and so that `update-duplicates` can fetch each target row by id.
      const existing = await repo.findBy({ organizationId: orgId });
      const existingByName = new Map<string, Category>();
      const existingById = new Map<string, Category>();
      for (const cat of existing) {
        existingByName.set(cat.name.trim().toLowerCase(), cat);
        existingById.set(cat.id, cat);
      }

      // ── duplicates ──
      if (payload.mode === 'skip-duplicates') {
        skipped += dupRows.length;
      } else {
        for (const dup of dupRows) {
          const target = existingById.get(dup.existingId);
          if (!target) {
            // Race: existing row vanished between preview + commit.
            skipped += 1;
            continue;
          }
          // Only attempt updates that produce a visible change today. `name` is
          // already identical (that's how it matched as a duplicate). `color`
          // is reserved (not yet persisted). `padre` reparenting via name lookup:
          if (dup.parentName) {
            const parent = existingByName.get(dup.parentName.trim().toLowerCase());
            if (!parent) {
              skipped += 1;
              continue;
            }
            if (parent.id === target.id) {
              skipped += 1;
              continue;
            }
            if (target.parentId !== parent.id) {
              target.applyUpdate({ parentId: parent.id });
              await repo.save(target);
              updated += 1;
            } else {
              skipped += 1;
            }
          } else {
            skipped += 1;
          }
        }
      }

      // ── new rows ──
      for (const row of newRows) {
        const parentId = (() => {
          if (!row.parentName) return null;
          const parent = existingByName.get(row.parentName.trim().toLowerCase());
          return parent ? parent.id : null;
        })();

        const cat = Category.create({
          organizationId: orgId,
          parentId,
          name: row.name,
          nameEs: row.name,
          nameEn: row.name,
        });
        const saved = await repo.save(cat);
        existingByName.set(saved.name.trim().toLowerCase(), saved);
        existingById.set(saved.id, saved);
        created += 1;
      }
    });

    return { created, updated, skipped };
  }

  // ─────────────────────────────────────── internals ────────────────────────────────────────

  private guardSize(csvContent: string): void {
    if (typeof csvContent !== 'string') {
      throw new CategoriesImportFormatError('csvContent must be a string');
    }
    const bytes = Buffer.byteLength(csvContent, 'utf8');
    if (bytes > CSV_MAX_BYTES) {
      throw new CategoriesImportFormatError(
        `CSV exceeds maximum size of ${CSV_MAX_BYTES} bytes (received ${bytes})`,
      );
    }
  }

  /**
   * Single-pass CSV parser:
   *   - comma delimiter
   *   - double-quote string escape (`""` inside a quoted field → literal `"`)
   *   - CRLF and LF line terminators
   *   - empty rows skipped
   *   - first non-empty row treated as header
   *   - throws CategoriesImportFormatError on missing required header `nombre`
   */
  private parseCsv(csvContent: string): {
    rows: ParsedRow[];
    errors: CategoriesPreviewRowError[];
  } {
    const lines = this.splitCsvLines(csvContent);
    if (lines.length === 0) {
      throw new CategoriesImportFormatError('CSV is empty');
    }

    const headerCells = this.parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
    const nombreIdx = headerCells.indexOf('nombre');
    if (nombreIdx === -1) {
      throw new CategoriesImportFormatError('missing required column: nombre');
    }
    const padreIdx = headerCells.indexOf('padre');
    const colorIdx = headerCells.indexOf('color');

    const rows: ParsedRow[] = [];
    const errors: CategoriesPreviewRowError[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.length === 0) continue;
      let cells: string[];
      try {
        cells = this.parseCsvLine(line);
      } catch (err) {
        errors.push({
          row: i,
          message: err instanceof Error ? err.message : 'malformed CSV row',
        });
        continue;
      }
      rows.push({
        rowNumber: i, // header is line 0 → first data line is row 1
        nombre: cells[nombreIdx] ?? '',
        padre: padreIdx === -1 ? undefined : cells[padreIdx],
        color: colorIdx === -1 ? undefined : cells[colorIdx],
      });
    }

    return { rows, errors };
  }

  /**
   * Split a CSV blob into logical lines, honoring newlines INSIDE quoted fields.
   * Returns an array where each element is a single CSV record (no trailing
   * newline). Empty strings are preserved positionally and filtered upstream.
   */
  private splitCsvLines(csv: string): string[] {
    // Strip a UTF-8 BOM if present
    const cleaned = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
    const lines: string[] = [];
    let buf = '';
    let inQuotes = false;
    for (let i = 0; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (inQuotes) {
        if (ch === '"') {
          // Look-ahead for escaped quote
          if (cleaned[i + 1] === '"') {
            buf += '""';
            i += 1;
          } else {
            buf += '"';
            inQuotes = false;
          }
        } else {
          buf += ch;
        }
        continue;
      }
      if (ch === '"') {
        buf += '"';
        inQuotes = true;
        continue;
      }
      if (ch === '\r') {
        if (cleaned[i + 1] === '\n') i += 1;
        lines.push(buf);
        buf = '';
        continue;
      }
      if (ch === '\n') {
        lines.push(buf);
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.length > 0 || lines.length === 0) {
      lines.push(buf);
    }
    return lines;
  }

  /**
   * Parse a single CSV record into trimmed cell values.
   *
   * Throws if a quoted field is unterminated.
   */
  private parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let buf = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            buf += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        buf += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        if (buf.length > 0) {
          throw new Error('quote character appeared mid-field');
        }
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ',') {
        cells.push(buf);
        buf = '';
        i += 1;
        continue;
      }
      buf += ch;
      i += 1;
    }
    if (inQuotes) {
      throw new Error('unterminated quoted field');
    }
    cells.push(buf);
    return cells;
  }

  private validateRow(row: ParsedRow): { errors: string[] } {
    const errors: string[] = [];
    const name = (row.nombre ?? '').trim();
    if (name.length === 0) {
      errors.push('nombre is required');
    } else if (name.length < NAME_MIN_LEN || name.length > NAME_MAX_LEN) {
      errors.push(
        `nombre must be ${NAME_MIN_LEN}-${NAME_MAX_LEN} chars (got ${name.length})`,
      );
    }
    if (row.color !== undefined && row.color.trim().length > 0) {
      if (!HEX_COLOR_RX.test(row.color.trim())) {
        errors.push(`color must match #RRGGBB hex format (got "${row.color}")`);
      }
    }
    return { errors };
  }
}
