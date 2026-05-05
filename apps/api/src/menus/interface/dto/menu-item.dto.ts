import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MarginReport, MarginStatus, MenuItemView } from '../../application/menu-items.service';
import { MenuItem, MenuItemChannel } from '../../domain/menu-item.entity';

const CHANNELS: MenuItemChannel[] = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'CATERING'];

export class CreateMenuItemDto {
  @ApiProperty()
  @IsUUID('4')
  organizationId!: string;

  @ApiProperty()
  @IsUUID('4')
  recipeId!: string;

  @ApiProperty()
  @IsUUID('4')
  locationId!: string;

  @ApiProperty({ enum: CHANNELS })
  @IsEnum(CHANNELS)
  channel!: MenuItemChannel;

  @ApiProperty({ example: 12.5 })
  @IsNumber()
  @Min(0.0001)
  sellingPrice!: number;

  @ApiProperty({ minimum: 0, maximum: 0.999, example: 0.65 })
  @IsNumber()
  @Min(0)
  @Max(0.999)
  targetMargin!: number;
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsEnum(CHANNELS)
  channel?: MenuItemChannel;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  sellingPrice?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 0.999 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.999)
  targetMargin?: number;
}

export class ListMenuItemsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsEnum(CHANNELS)
  channel?: MenuItemChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MenuItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() recipeId!: string;
  @ApiProperty() locationId!: string;
  @ApiProperty({ enum: CHANNELS }) channel!: MenuItemChannel;
  @ApiProperty() sellingPrice!: number;
  @ApiProperty() targetMargin!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() displayLabel!: string;
  @ApiProperty() recipeDiscontinued!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromView(v: MenuItemView): MenuItemResponseDto {
    return {
      id: v.menuItem.id,
      organizationId: v.menuItem.organizationId,
      recipeId: v.menuItem.recipeId,
      locationId: v.menuItem.locationId,
      channel: v.menuItem.channel,
      sellingPrice: Number(v.menuItem.sellingPrice),
      targetMargin: Number(v.menuItem.targetMargin),
      isActive: v.menuItem.isActive,
      displayLabel: v.displayLabel,
      recipeDiscontinued: v.recipeDiscontinued,
      createdAt: v.menuItem.createdAt,
      updatedAt: v.menuItem.updatedAt,
    };
  }

  /** Convenience for list endpoints that load entities directly without the view layer. */
  static fromEntity(m: MenuItem, displayLabel: string, recipeDiscontinued: boolean): MenuItemResponseDto {
    return {
      id: m.id,
      organizationId: m.organizationId,
      recipeId: m.recipeId,
      locationId: m.locationId,
      channel: m.channel,
      sellingPrice: Number(m.sellingPrice),
      targetMargin: Number(m.targetMargin),
      isActive: m.isActive,
      displayLabel,
      recipeDiscontinued,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }
}

export class MarginReportDto {
  @ApiProperty() menuItemId!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() recipeId!: string;
  @ApiProperty() locationId!: string;
  @ApiProperty({ enum: CHANNELS }) channel!: MenuItemChannel;
  @ApiProperty({ type: Number, nullable: true }) cost!: number | null;
  @ApiProperty() sellingPrice!: number;
  @ApiProperty() targetMargin!: number;
  @ApiProperty({ type: Number, nullable: true }) marginAbsolute!: number | null;
  @ApiProperty({ type: Number, nullable: true }) marginPercent!: number | null;
  @ApiProperty({ type: Number, nullable: true }) marginVsTargetPp!: number | null;
  @ApiProperty({ enum: ['on_target', 'below_target', 'at_risk', 'unknown'] }) status!: MarginStatus;
  @ApiProperty() statusLabel!: string;
  @ApiProperty({ type: [String] }) warnings!: string[];
  @ApiProperty() recipeDiscontinued!: boolean;
  @ApiProperty() currency!: string;

  static fromReport(r: MarginReport): MarginReportDto {
    return { ...r };
  }
}

export class MenuItemCostHistoryDto {
  @ApiProperty() menuItemId!: string;
  @ApiProperty() recipeId!: string;
  @ApiProperty() sellingPrice!: number;
  @ApiProperty() targetMargin!: number;
  @ApiProperty({
    type: [Object],
    description:
      'Cost history rows (timestamp + total cost) for the underlying Recipe in the requested window.',
  })
  history!: unknown[];

  static from(
    menuItemId: string,
    recipeId: string,
    sellingPrice: number,
    targetMargin: number,
    history: unknown[],
  ): MenuItemCostHistoryDto {
    return { menuItemId, recipeId, sellingPrice, targetMargin, history };
  }
}
