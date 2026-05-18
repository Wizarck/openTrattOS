import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 W3-5 — m3-procurement-reconciliation: Reconciliation aggregate.
 *
 * Creates the `procurement_reconciliations` table that backs the j11
 * Reconciliación tab (docs/ux/j11.md §6). PR #218 (Sprint 3 Block C)
 * shipped a placeholder controller returning `[]`; this migration is the
 * first half of the real backend (entity + repo + detector + service land
 * in the same PR).
 *
 * Schema rationale:
 *
 *  - `po_id` NULL allowed — independent (no-PO) GRs may still surface a
 *    discrepancy in future (e.g. lote-no-conforme). Today the detector
 *    only emits rows for PO-linked GRs; the nullable column avoids a
 *    later ALTER COLUMN.
 *
 *  - `po_number text NULL` — denormalised so the j11 list view does not
 *    need to join `purchase_orders` on every render.
 *
 *  - `diff jsonb NOT NULL` — per-type structured payload (see
 *    Reconciliation.entity.ts JSDoc for shape per discrepancy_type).
 *
 *  - `discrepancy_type` + `state` are `text` + CHECK (mirrors slice #1
 *    pattern; no Postgres enum). Application enforces the state machine.
 *
 *  - FK into `purchase_orders` / `goods_receipts` / `suppliers` /
 *    `organizations` / `users` so cross-tenant fan-out + recall-search
 *    joins are safe. ON DELETE NO ACTION (default) — reconciliations
 *    survive a GR archival.
 *
 *  - 2 indexes:
 *      * `idx_recon_org_state`   — powers GET ?state=abierta (the j11
 *        default filter).
 *      * `idx_recon_org_created` — powers the dashboard "recent
 *        discrepancies" widget + supplier-history scrolls (DESC).
 *
 * Down: drops indexes then the table (idempotent IF EXISTS).
 */
export class CreateProcurementReconciliations1700000046000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "procurement_reconciliations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "po_id" uuid NULL,
        "po_number" text NULL,
        "gr_id" uuid NOT NULL,
        "supplier_id" uuid NOT NULL,
        "discrepancy_type" text NOT NULL,
        "diff" jsonb NOT NULL,
        "state" text NOT NULL DEFAULT 'abierta',
        "resolved_at" timestamptz NULL,
        "resolved_by_user_id" uuid NULL,
        "resolution_notes" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "recon_discrepancy_type_check"
          CHECK ("discrepancy_type" IN ('cantidad','precio','producto','lote-no-conforme')),
        CONSTRAINT "recon_state_check"
          CHECK ("state" IN ('abierta','aceptada','nota-credito','devuelta')),
        CONSTRAINT "recon_resolution_coherence_check"
          CHECK (
            ("state" = 'abierta'
              AND "resolved_at" IS NULL
              AND "resolved_by_user_id" IS NULL)
            OR ("state" <> 'abierta'
              AND "resolved_at" IS NOT NULL
              AND "resolved_by_user_id" IS NOT NULL)
          ),
        CONSTRAINT "fk_recon_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
        CONSTRAINT "fk_recon_gr"
          FOREIGN KEY ("gr_id") REFERENCES "goods_receipts"("id"),
        CONSTRAINT "fk_recon_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id"),
        CONSTRAINT "fk_recon_resolved_by_user"
          FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_recon_org_state"
        ON "procurement_reconciliations" ("organization_id", "state");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_recon_org_created"
        ON "procurement_reconciliations" ("organization_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recon_org_created";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recon_org_state";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "procurement_reconciliations";`);
  }
}
