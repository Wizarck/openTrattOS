import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CostModule } from './cost/cost.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExternalCatalogModule } from './external-catalog/external-catalog.module';
import { IamModule } from './iam/iam.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { MenusModule } from './menus/menus.module';
import { RecipesModule } from './recipes/recipes.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { RolesGuard } from './shared/guards/roles.guard';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
import { AgentAuditMiddleware } from './shared/middleware/agent-audit.middleware';

@Module({
  imports: [
    EventEmitterModule.forRoot(),

    // M1 Foundation
    IamModule,
    IngredientsModule,
    SuppliersModule,

    // M2 Foundation (m2-data-model — schema only; controllers land in m2-recipes-core, m2-cost-rollup, etc.)
    RecipesModule,
    MenusModule,

    // M2 cost rollup + audit (m2-cost-rollup-and-audit — owns the InventoryCostResolver binding).
    CostModule,

    // M2 OFF mirror (m2-off-mirror — local mirror + REST fallback for Open Food Facts).
    ExternalCatalogModule,

    // M2 Owner dashboard (m2-owner-dashboard — Journey 3 read-only ranking endpoint).
    DashboardModule,

    // Future Bounded Contexts:
    // HaccpModule,       // M3 — HACCP / APPCC
    // OperationsModule,  // M4 — Inventory & Orders
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  // m2-mcp-server: AgentAuditMiddleware reads `X-Via-Agent` + `X-Agent-Name`
  // headers, populates `req.agentContext`, and emits `AGENT_ACTION_EXECUTED`.
  // Wired against `forRoutes('*')` so it runs ahead of every controller; it
  // is a no-op for non-agent traffic.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AgentAuditMiddleware).forRoutes('*');
  }
}
