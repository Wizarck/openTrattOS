import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IamModule } from './iam/iam.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { RolesGuard } from './shared/guards/roles.guard';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';

@Module({
  imports: [
    // Bounded Context: Module 1 — Foundation
    IamModule,
    IngredientsModule,
    SuppliersModule,

    // Future Bounded Contexts:
    // CostingModule,     // M2 — Recipes & Escandallos
    // HaccpModule,       // M3 — HACCP / APPCC
    // OperationsModule,  // M4 — Inventory & Orders
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
