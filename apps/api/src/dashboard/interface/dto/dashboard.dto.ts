import { ApiProperty } from '@nestjs/swagger';
import { MarginReportDto } from '../../../menus/interface/dto/menu-item.dto';
import {
  DashboardMenuItem,
  RankingResult,
} from '../../application/dashboard.service';

export class DashboardMenuItemDto {
  @ApiProperty() menuItemId!: string;
  @ApiProperty() recipeId!: string;
  @ApiProperty() locationId!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() displayLabel!: string;
  @ApiProperty({ type: () => MarginReportDto }) margin!: MarginReportDto;

  static from(item: DashboardMenuItem): DashboardMenuItemDto {
    const dto = new DashboardMenuItemDto();
    dto.menuItemId = item.menuItemId;
    dto.recipeId = item.recipeId;
    dto.locationId = item.locationId;
    dto.channel = item.channel;
    dto.displayLabel = item.displayLabel;
    dto.margin = MarginReportDto.fromReport(item.margin);
    return dto;
  }
}

export class RankingResultDto {
  @ApiProperty() organizationId!: string;
  @ApiProperty() windowDays!: number;
  @ApiProperty({ enum: ['top', 'bottom'] }) direction!: 'top' | 'bottom';
  @ApiProperty({ description: 'True when the org has fewer MenuItems than requested.' })
  incomplete!: boolean;
  @ApiProperty({ type: [DashboardMenuItemDto] }) items!: DashboardMenuItemDto[];

  static from(r: RankingResult): RankingResultDto {
    const dto = new RankingResultDto();
    dto.organizationId = r.organizationId;
    dto.windowDays = r.windowDays;
    dto.direction = r.direction;
    dto.incomplete = r.incomplete;
    dto.items = r.items.map(DashboardMenuItemDto.from);
    return dto;
  }
}
