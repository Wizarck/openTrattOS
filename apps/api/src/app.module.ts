import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { CostModule } from './cost/cost.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExternalCatalogModule } from './external-catalog/external-catalog.module';
import { IamModule } from './iam/iam.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { LabelsModule } from './labels/labels.module';
import { MenusModule } from './menus/menus.module';
import { RecipesModule } from './recipes/recipes.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { AgentIdempotencyService } from './shared/application/agent-idempotency.service';
import { AuditResolverRegistry } from './shared/application/audit-resolver-registry';
import { AgentIdempotencyKey } from './shared/domain/agent-idempotency-key.entity';
import { AgentCapabilityGuard } from './shared/guards/agent-capability.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
import { BeforeAfterAuditInterceptor } from './shared/interceptors/before-after-audit.interceptor';
import { AgentAuditMiddleware } from './shared/middleware/agent-audit.middleware';
import { IdempotencyMiddleware } from './shared/middleware/idempotency.middleware';

@Module({
  imports: [
    EventEmitterModule.forRoot(),

    // m2-mcp-write-capabilities (Wave 1.13): idempotency table.
    TypeOrmModule.forFeature([AgentIdempotencyKey]),

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

    // M2 labels (m2-labels-rendering — EU 1169/2011 PDF + PrintAdapter abstraction).
    LabelsModule,

    // M2 AI yield + waste suggestions (m2-ai-yield-suggestions — provider + iron-rule guard + chef override).
    AiSuggestionsModule,

    // M2 canonical audit log (m2-audit-log — single audit_log table; @OnEvent subscriber across BCs).
    AuditLogModule,

    // Future Bounded Contexts:
    // HaccpModule,       // M3 — HACCP / APPCC
    // OperationsModule,  // M4 — Inventory & Orders
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    // m2-mcp-write-capabilities: per-capability kill-switch — runs AFTER
    // RolesGuard (NestJS executes APP_GUARDs in registration order, but for
    // safety the guard is itself no-op when viaAgent !== true so order is
    // moot for direct REST/UI traffic).
    { provide: APP_GUARD, useClass: AgentCapabilityGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // m2-mcp-write-capabilities: forensic before/after capture for agent
    // writes. Skips entirely when viaAgent !== true.
    { provide: APP_INTERCEPTOR, useClass: BeforeAfterAuditInterceptor },
    // Singleton registry populated by each BC's onApplicationBootstrap with
    // `findById` resolvers for the BeforeAfterAuditInterceptor.
    AuditResolverRegistry,
    // Idempotency-Key persistence for agent writes.
    AgentIdempotencyService,
  ],
})
export class AppModule implements NestModule {
  // m2-mcp-server: AgentAuditMiddleware reads `X-Via-Agent` + `X-Agent-Name`
  // headers, populates `req.agentContext`, and emits `AGENT_ACTION_EXECUTED`.
  // Wired against `forRoutes('*')` so it runs ahead of every controller; it
  // is a no-op for non-agent traffic.
  //
  // m2-mcp-write-capabilities: IdempotencyMiddleware runs AFTER
  // AgentAuditMiddleware so `req.user.organizationId` is available (auth
  // populates user before NestJS middleware chain — the order between these
  // two middleware is not load-bearing as long as auth has populated user).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AgentAuditMiddleware, IdempotencyMiddleware).forRoutes('*');
  }
}
