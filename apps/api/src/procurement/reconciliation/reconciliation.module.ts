import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reconciliation } from './domain/reconciliation.entity';
import { ReconciliationController } from './interface/reconciliation.controller';

/**
 * procurement.reconciliation bounded context (Sprint 4 W3-5).
 *
 * Sprint 3 Block C (PR #218) shipped a placeholder controller returning
 * `[]`. This module registers the real `Reconciliation` entity so the
 * migration (0046) has a TypeORM repository at boot; the controller +
 * service + repository + detector land in the same PR (checkpoint 2 of
 * the Sprint 4 W3-5 task).
 *
 * Multi-tenant invariant: every read/write goes through the dedicated
 * repository which always WHERE-clauses `organization_id`. No direct
 * `TypeOrmModule.forFeature` consumers outside this module.
 *
 * Spec: docs/ux/j11.md §6.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Reconciliation])],
  controllers: [ReconciliationController],
})
export class ReconciliationModule {}
