import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import {
  CostBreakdown,
  CostBreakdownComponent,
  CostDelta,
  CostDeltaComponent,
} from '../../application/cost.service';
import { RecipeCostHistory } from '../../domain/recipe-cost-history.entity';

export class CostBreakdownComponentDto {
  recipeIngredientId!: string;
  componentKind!: 'ingredient' | 'sub-recipe';
  componentId!: string;
  componentName!: string;
  quantity!: number;
  unitId!: string;
  costPerBaseUnit!: number;
  yield!: number;
  wasteFactor!: number;
  lineCost!: number;
  sourceRefId!: string | null;
  sourceLabel!: string | null;
  unresolved!: boolean;

  static fromBreakdown(c: CostBreakdownComponent): CostBreakdownComponentDto {
    return {
      recipeIngredientId: c.recipeIngredientId,
      componentKind: c.componentKind,
      componentId: c.componentId,
      componentName: c.componentName,
      quantity: c.quantity,
      unitId: c.unitId,
      costPerBaseUnit: c.costPerBaseUnit,
      yield: c.yield,
      wasteFactor: c.wasteFactor,
      lineCost: c.lineCost,
      sourceRefId: c.sourceRefId,
      sourceLabel: c.sourceLabel,
      unresolved: c.unresolved,
    };
  }
}

export class CostBreakdownDto {
  recipeId!: string;
  recipeName!: string;
  totalCost!: number;
  currency!: string;
  components!: CostBreakdownComponentDto[];
  roundingDelta!: number;

  static fromBreakdown(b: CostBreakdown): CostBreakdownDto {
    return {
      recipeId: b.recipeId,
      recipeName: b.recipeName,
      totalCost: b.totalCost,
      currency: b.currency,
      components: b.components.map(CostBreakdownComponentDto.fromBreakdown),
      roundingDelta: b.roundingDelta,
    };
  }
}

export class CostHistoryRowDto {
  id!: string;
  recipeId!: string;
  componentRefId!: string | null;
  costPerBaseUnit!: number;
  totalCost!: number;
  sourceRefId!: string | null;
  reason!: string;
  computedAt!: Date;

  static fromEntity(h: RecipeCostHistory): CostHistoryRowDto {
    return {
      id: h.id,
      recipeId: h.recipeId,
      componentRefId: h.componentRefId,
      costPerBaseUnit: Number(h.costPerBaseUnit),
      totalCost: Number(h.totalCost),
      sourceRefId: h.sourceRefId,
      reason: h.reason,
      computedAt: h.computedAt,
    };
  }
}

export class CostDeltaComponentDto {
  recipeIngredientId!: string;
  componentKind!: 'ingredient' | 'sub-recipe';
  componentId!: string;
  componentName!: string;
  costFrom!: number;
  costTo!: number;
  delta!: number;
  sourceRefIdFrom!: string | null;
  sourceRefIdTo!: string | null;

  static fromDelta(c: CostDeltaComponent): CostDeltaComponentDto {
    return { ...c };
  }
}

export class CostDeltaDto {
  recipeId!: string;
  from!: Date;
  to!: Date;
  totalFrom!: number;
  totalTo!: number;
  totalDelta!: number;
  components!: CostDeltaComponentDto[];

  static fromDelta(d: CostDelta): CostDeltaDto {
    return {
      recipeId: d.recipeId,
      from: d.from,
      to: d.to,
      totalFrom: d.totalFrom,
      totalTo: d.totalTo,
      totalDelta: d.totalDelta,
      components: d.components.map(CostDeltaComponentDto.fromDelta),
    };
  }
}

export class UpdateLineSourceDto {
  @ApiProperty({
    description:
      'SupplierItem.id to use as the cost source for this line; null clears the override and falls back to preferred.',
    nullable: true,
    example: '11111111-1111-4111-8111-111111111111',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  sourceOverrideRef!: string | null;
}
