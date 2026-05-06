import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostModule } from '../cost/cost.module';
import { IamModule } from '../iam/iam.module';
import { RecipesModule } from '../recipes/recipes.module';
import { AuditResolverRegistry } from '../shared/application/audit-resolver-registry';
import { SharedModule } from '../shared/shared.module';
import { MenuItemsService } from './application/menu-items.service';
import { MenuItem } from './domain/menu-item.entity';
import { MenuItemRepository } from './infrastructure/menu-item.repository';
import { MenuItemsController } from './interface/menu-items.controller';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([MenuItem]), CostModule, RecipesModule, IamModule],
  controllers: [MenuItemsController],
  providers: [MenuItemRepository, MenuItemsService],
  exports: [MenuItemRepository, MenuItemsService, TypeOrmModule],
})
export class MenusModule implements OnApplicationBootstrap {
  constructor(
    private readonly menuItems: MenuItemsService,
    private readonly registry: AuditResolverRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register('menu_item', async (id, req) => {
      const orgId = (req as { user?: { organizationId?: string } }).user?.organizationId;
      if (!orgId) return null;
      try {
        const view = await this.menuItems.findOne(orgId, id);
        return view ?? null;
      } catch {
        return null;
      }
    });
  }
}
