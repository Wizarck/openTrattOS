import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { DataSource, EntityManager } from 'typeorm';
import { Category } from '../domain/category.entity';
import { Ingredient } from '../domain/ingredient.entity';
import {
  CategoryResolver,
  IngredientCsvRow,
  IngredientRowValidator,
  REQUIRED_COLUMNS,
  RowError,
  RowValidation,
} from './ingredient-row-validator';

export interface ImportOptions {
  organizationId: string;
  dryRun: boolean;
  /** Override the default chunk size (500). Tuning knob; not exposed via the controller. */
  chunkSize?: number;
}

export interface ImportResult {
  valid: number;
  invalid: number;
  errors: RowError[];
}

export class CsvImportFormatError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(`CSV import format error: ${detail}`);
    this.name = 'CsvImportFormatError';
    this.detail = detail;
  }
}

const DEFAULT_CHUNK_SIZE = 500;

@Injectable()
export class IngredientImportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Reads a CSV stream, validates each row against the M1 invariants,
   * and (when `dryRun=false`) persists valid rows in 500-row chunks with
   * one transaction per chunk. A poisoned chunk N rolls back atomically;
   * chunks 1..N-1 stay committed (per design.md §D10).
   */
  async parseAndCommit(stream: Readable, options: ImportOptions): Promise<ImportResult> {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const categories = await this.dataSource
      .getRepository(Category)
      .findBy({ organizationId: options.organizationId });
    const resolver = new CategoryResolver(categories);
    const validator = new IngredientRowValidator(options.organizationId, resolver);

    const errors: RowError[] = [];
    let validCount = 0;
    let invalidCount = 0;

    let pendingValidChunk: Ingredient[] = [];
    let rowIndex = 0;
    let headersChecked = false;

    const parser = stream.pipe(
      parse({
        columns: (rawHeaders: string[]) => {
          // Strict required-header check; throw a typed error so the controller can map to 400.
          const missing = REQUIRED_COLUMNS.filter((c) => !rawHeaders.includes(c));
          if (missing.length > 0) {
            throw new CsvImportFormatError(`missing required column(s): ${missing.join(', ')}`);
          }
          headersChecked = true;
          return rawHeaders;
        },
        skip_empty_lines: true,
        trim: false,
      }),
    );

    for await (const record of parser) {
      rowIndex += 1;
      const row = record as IngredientCsvRow;
      const result: RowValidation = validator.validate(row, rowIndex);
      if (result.ok) {
        pendingValidChunk.push(result.ingredient);
        if (pendingValidChunk.length >= chunkSize) {
          const flushOutcome = await this.flushChunk(pendingValidChunk, options.dryRun, rowIndex - chunkSize + 1);
          validCount += flushOutcome.validInChunk;
          invalidCount += flushOutcome.invalidInChunk;
          errors.push(...flushOutcome.chunkErrors);
          pendingValidChunk = [];
        }
      } else {
        invalidCount += 1;
        errors.push(...result.errors);
      }
    }

    if (!headersChecked) {
      // Empty CSV (or one without a header row) — nothing parsed.
      throw new CsvImportFormatError('CSV is empty or missing a header row');
    }

    if (pendingValidChunk.length > 0) {
      const flushOutcome = await this.flushChunk(
        pendingValidChunk,
        options.dryRun,
        rowIndex - pendingValidChunk.length + 1,
      );
      validCount += flushOutcome.validInChunk;
      invalidCount += flushOutcome.invalidInChunk;
      errors.push(...flushOutcome.chunkErrors);
    }

    return { valid: validCount, invalid: invalidCount, errors };
  }

  private async flushChunk(
    chunk: Ingredient[],
    dryRun: boolean,
    chunkStartRowIndex: number,
  ): Promise<{ validInChunk: number; invalidInChunk: number; chunkErrors: RowError[] }> {
    if (dryRun) {
      // Validate-only path — domain factory already ran; everything in the chunk is valid.
      return { validInChunk: chunk.length, invalidInChunk: 0, chunkErrors: [] };
    }
    try {
      await this.dataSource.transaction(async (em: EntityManager) => {
        const repo = em.getRepository(Ingredient);
        await repo.save(chunk);
      });
      return { validInChunk: chunk.length, invalidInChunk: 0, chunkErrors: [] };
    } catch (err) {
      // Rollback occurred. Mark every row in the chunk as errored, with a chunk-level error.
      const message = err instanceof Error ? err.message : String(err);
      const chunkErrors: RowError[] = chunk.map((_, i) => ({
        rowIndex: chunkStartRowIndex + i,
        column: '<chunk>',
        code: 'CSV_IMPORT_CHUNK_ROLLED_BACK',
        message,
      }));
      return { validInChunk: 0, invalidInChunk: chunk.length, chunkErrors };
    }
  }
}
