import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { RecipeCostHistory } from '../domain/recipe-cost-history.entity';

@Injectable()
export class RecipeCostHistoryRepository extends Repository<RecipeCostHistory> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(RecipeCostHistory, dataSource.createEntityManager());
  }

  async findInWindow(recipeId: string, from: Date, to: Date): Promise<RecipeCostHistory[]> {
    return this.find({
      where: { recipeId, computedAt: Between(from, to) },
      order: { computedAt: 'ASC' },
    });
  }

  async findLatestForRecipe(recipeId: string, limit = 50): Promise<RecipeCostHistory[]> {
    return this.find({
      where: { recipeId },
      order: { computedAt: 'DESC' },
      take: limit,
    });
  }
}
