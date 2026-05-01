import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Cursor-based pagination per design.md §D2 (deterministic ordering, soft-delete
 * tolerant). Wave 1 endpoints use this same DTO; later waves override
 * `take`/`maxTake` if they need a different page-size policy.
 */
export class CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
