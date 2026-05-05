import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostModule } from '../cost/cost.module';
import { IamModule } from '../iam/iam.module';
import { RecipesModule } from '../recipes/recipes.module';
import { MenuItemsService } from './application/menu-items.service';
import { MenuItem } from './domain/menu-item.entity';
import { MenuItemRepository } from './infrastructure/menu-item.repository';
import { MenuItemsController } from './interface/menu-items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem]), CostModule, RecipesModule, IamModule],
  controllers: [MenuItemsController],
  providers: [MenuItemRepository, MenuItemsService],
  exports: [MenuItemRepository, MenuItemsService, TypeOrmModule],
})
export class MenusModule {}
