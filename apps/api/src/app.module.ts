import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ExternalCatalogModule } from './external-catalog/external-catalog.module';
import { IamModule } from './iam/iam.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { MenusModule } from './menus/menus.module';
import { RecipesModule } from './recipes/recipes.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { RolesGuard } from './shared/guards/roles.guard';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';

@Module({
  imports: [
    // M1 Foundation
    IamModule,
    IngredientsModule,
    SuppliersModule,

    // M2 Foundation (m2-data-model — schema only; controllers land in m2-recipes-core, m2-cost-rollup, etc.)
    RecipesModule,
    MenusModule,

    // M2 OFF mirror (m2-off-mirror — local mirror + REST fallback for Open Food Facts).
    ExternalCatalogModule,

    // Future Bounded Contexts:
    // HaccpModule,       // M3 — HACCP / APPCC
    // OperationsModule,  // M4 — Inventory & Orders
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
