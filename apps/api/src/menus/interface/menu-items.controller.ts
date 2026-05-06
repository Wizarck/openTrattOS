import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { CostRecipeNotFoundError, CostService } from '../../cost/application/cost.service';
import { CostHistoryRowDto } from '../../cost/interface/dto/cost.dto';
import { MenuItemChannel } from '../domain/menu-item.entity';
import {
  MenuItemDuplicateError,
  MenuItemLocationNotFoundError,
  MenuItemNotFoundError,
  MenuItemRecipeNotFoundError,
  MenuItemsService,
} from '../application/menu-items.service';
import {
  CreateMenuItemDto,
  ListMenuItemsQueryDto,
  MarginReportDto,
  MenuItemCostHistoryDto,
  MenuItemResponseDto,
  UpdateMenuItemDto,
} from './dto/menu-item.dto';

@ApiTags('Menu Items')
@Controller('menu-items')
export class MenuItemsController {
  constructor(
    private readonly service: MenuItemsService,
    private readonly cost: CostService,
  ) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('menu_item', null)
  @ApiOperation({
    summary: 'Create a MenuItem (Recipe × Location × Channel)',
    description:
      'Composite uniqueness on (organizationId, recipeId, locationId, channel) enforced by partial unique index where is_active = true. Recreating a previously-deactivated combo is allowed.',
  })
  async create(
    @Body() dto: CreateMenuItemDto,
  ): Promise<WriteResponseDto<MenuItemResponseDto>> {
    try {
      const view = await this.service.create({
        organizationId: dto.organizationId,
        recipeId: dto.recipeId,
        locationId: dto.locationId,
        channel: dto.channel,
        sellingPrice: dto.sellingPrice,
        targetMargin: dto.targetMargin,
      });
      return toWriteResponse(MenuItemResponseDto.fromView(view));
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List MenuItems for an organization (with optional filters)' })
  async list(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query() query: ListMenuItemsQueryDto,
  ): Promise<MenuItemResponseDto[]> {
    const filter = {
      locationId: query.locationId,
      channel: query.channel as MenuItemChannel | undefined,
      isActive:
        typeof query.isActive === 'string'
          ? query.isActive === 'true'
          : (query.isActive as boolean | undefined),
    };
    const views = await this.service.findAll(organizationId, filter);
    return views.map(MenuItemResponseDto.fromView);
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get a MenuItem by id (with Discontinued badge if applicable)' })
  async getById(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MenuItemResponseDto> {
    try {
      const view = await this.service.findOne(organizationId, id);
      return MenuItemResponseDto.fromView(view);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Put(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('menu_item')
  @ApiOperation({ summary: 'Update a MenuItem (channel / sellingPrice / targetMargin)' })
  async update(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<WriteResponseDto<MenuItemResponseDto>> {
    try {
      const view = await this.service.update(organizationId, id, dto);
      return toWriteResponse(MenuItemResponseDto.fromView(view));
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('menu_item')
  @ApiOperation({ summary: 'Soft-delete a MenuItem (sets isActive=false)' })
  async deactivate(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<{ id: string }>> {
    try {
      await this.service.softDelete(organizationId, id);
      return toWriteResponse({ id });
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get(':id/cost-history')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Cost history for a MenuItem (drill-down from the Owner dashboard)',
    description:
      'Wraps the underlying Recipe cost-history with the MenuItem context (sellingPrice + targetMargin). Default windowDays=14.',
  })
  async getCostHistory(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('windowDays', new ParseIntPipe({ optional: true })) windowDays?: number,
  ): Promise<MenuItemCostHistoryDto> {
    try {
      const view = await this.service.findOne(organizationId, id);
      const history = await this.cost.getHistory(
        organizationId,
        view.menuItem.recipeId,
        windowDays ?? 14,
      );
      return MenuItemCostHistoryDto.from(
        view.menuItem.id,
        view.menuItem.recipeId,
        Number(view.menuItem.sellingPrice),
        Number(view.menuItem.targetMargin),
        history.map(CostHistoryRowDto.fromAuditUnpack),
      );
    } catch (err) {
      if (err instanceof CostRecipeNotFoundError) {
        throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', recipeId: err.recipeId });
      }
      throw this.translate(err);
    }
  }

  @Get(':id/margin')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Live margin report for a MenuItem',
    description:
      'Calls CostService.computeRecipeCost; degrades to status="unknown" with a warning when cost is unresolvable (no preferred SupplierItem, etc.). Never 5xx for upstream cost issues.',
  })
  async getMargin(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MarginReportDto> {
    try {
      const report = await this.service.getMargin(organizationId, id);
      return MarginReportDto.fromReport(report);
    } catch (err) {
      throw this.translate(err);
    }
  }

  private translate(err: unknown): Error {
    if (err instanceof MenuItemNotFoundError) {
      return new NotFoundException({ code: 'MENU_ITEM_NOT_FOUND', menuItemId: err.menuItemId });
    }
    if (err instanceof MenuItemRecipeNotFoundError) {
      return new BadRequestException({
        code: 'MENU_ITEM_RECIPE_NOT_FOUND',
        recipeId: err.recipeId,
      });
    }
    if (err instanceof MenuItemLocationNotFoundError) {
      return new BadRequestException({
        code: 'MENU_ITEM_LOCATION_NOT_FOUND',
        locationId: err.locationId,
      });
    }
    if (err instanceof MenuItemDuplicateError) {
      return new ConflictException({
        code: 'MENU_ITEM_DUPLICATE',
        recipeId: err.recipeId,
        locationId: err.locationId,
        channel: err.channel,
      });
    }
    if (err instanceof Error) return err;
    return new Error(String(err));
  }
}
