import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CostRecipeNotFoundError, CostService } from '../application/cost.service';
import {
  CostBreakdownDto,
  CostDeltaDto,
  CostHistoryRowDto,
} from './dto/cost.dto';

@ApiTags('Recipe Cost')
@Controller('recipes')
export class RecipesCostController {
  constructor(private readonly cost: CostService) {}

  @Get(':id/cost')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Live cost rollup for a Recipe',
    description:
      'Walks the sub-recipe tree, calls InventoryCostResolver per ingredient, applies yield × (1 − waste) per level. Read-time computation; nothing persisted.',
  })
  async getCost(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<CostBreakdownDto> {
    try {
      const breakdown = await this.cost.computeRecipeCost(organizationId, id);
      return CostBreakdownDto.fromBreakdown(breakdown);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get(':id/cost-history')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Cost history rows for a Recipe in a configurable window',
    description:
      'Default window 14 days per design.md §"Default window 14d vs 7d/30d". Pass `windowDays` to override.',
  })
  async getHistory(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('windowDays', new ParseIntPipe({ optional: true })) windowDays?: number,
  ): Promise<CostHistoryRowDto[]> {
    try {
      const rows = await this.cost.getHistory(organizationId, id, windowDays ?? 14);
      return rows.map(CostHistoryRowDto.fromAuditUnpack);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get(':id/cost-delta')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Per-component delta between two timestamps (Journey 2 "what changed?")',
  })
  async getCostDelta(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<CostDeltaDto> {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException({
        code: 'COST_DELTA_INVALID_RANGE',
        detail: 'from and to must be ISO-8601 timestamps',
      });
    }
    try {
      const delta = await this.cost.computeCostDelta(organizationId, id, fromDate, toDate);
      return CostDeltaDto.fromDelta(delta);
    } catch (err) {
      throw this.translate(err);
    }
  }

  private translate(err: unknown): Error {
    if (err instanceof CostRecipeNotFoundError) {
      return new NotFoundException({ code: 'RECIPE_NOT_FOUND', recipeId: err.recipeId });
    }
    if (err instanceof Error) return err;
    return new Error(String(err));
  }
}
