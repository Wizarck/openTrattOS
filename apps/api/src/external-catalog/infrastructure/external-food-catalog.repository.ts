import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExternalFoodCatalog } from '../domain/external-food-catalog.entity';

export interface CatalogStats {
  rowCount: number;
  lastSyncAt: Date | null;
}

@Injectable()
export class ExternalFoodCatalogRepository extends Repository<ExternalFoodCatalog> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(ExternalFoodCatalog, dataSource.createEntityManager());
  }

  async findByBarcode(barcode: string): Promise<ExternalFoodCatalog | null> {
    return this.findOneBy({ barcode });
  }

  /**
   * Trigram fuzzy search by `name`, region-scoped. Uses Postgres `ILIKE`
   * combined with the `pg_trgm` GIN index for sub-50ms hits even at 200k rows.
   * Region filter narrows to the deployed organisation's catalog.
   */
  async searchByName(query: string, region: string, limit = 25): Promise<ExternalFoodCatalog[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    return this.createQueryBuilder('e')
      .where('e.region = :region', { region })
      .andWhere('e.name ILIKE :pattern', { pattern: `%${trimmed}%` })
      .orderBy('e.name', 'ASC')
      .limit(limit)
      .getMany();
  }

  async searchByBrand(brand: string, region: string, limit = 25): Promise<ExternalFoodCatalog[]> {
    const trimmed = brand.trim();
    if (trimmed.length === 0) return [];
    return this.createQueryBuilder('e')
      .where('e.region = :region', { region })
      .andWhere('(e.brand = :exact OR e.brand ILIKE :prefix)', {
        exact: trimmed,
        prefix: `${trimmed}%`,
      })
      .orderBy('e.brand', 'ASC')
      .addOrderBy('e.name', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * Health-check support: total row count + most recent `synced_at`. Used by
   * the health-check controller to derive the `stale` flag (>14d).
   */
  async getStats(): Promise<CatalogStats> {
    const rowCount = await this.count();
    if (rowCount === 0) {
      return { rowCount: 0, lastSyncAt: null };
    }
    const row = await this.createQueryBuilder('e')
      .select('MAX(e.synced_at)', 'last_sync_at')
      .getRawOne<{ last_sync_at: Date | null }>();
    return { rowCount, lastSyncAt: row?.last_sync_at ?? null };
  }

  /**
   * Cursor-based incremental sync support: max `last_modified_at` currently
   * persisted for a region. Returns null if no rows exist yet for the region.
   */
  async getSyncCursor(region: string): Promise<Date | null> {
    const row = await this.createQueryBuilder('e')
      .select('MAX(e.last_modified_at)', 'cursor')
      .where('e.region = :region', { region })
      .getRawOne<{ cursor: Date | null }>();
    return row?.cursor ?? null;
  }
}
