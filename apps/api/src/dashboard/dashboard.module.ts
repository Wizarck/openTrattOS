import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { MenusModule } from '../menus/menus.module';
import { DashboardService } from './application/dashboard.service';
import { DashboardController } from './interface/dashboard.controller';

@Module({
  imports: [MenusModule, IamModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
