import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierItem1700000008000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "supplier_items" (
        "id"                 uuid                       PRIMARY KEY,
        "supplier_id"        uuid                       NOT NULL,
        "ingredient_id"      uuid                       NOT NULL,
        "purchase_unit"      varchar(100)               NOT NULL,
        "purchase_unit_qty"  double precision           NOT NULL,
        "purchase_unit_type" varchar(16)                NOT NULL,
        "unit_price"         numeric(14,4)              NOT NULL,
        "cost_per_base_unit" numeric(14,4)              NULL,
        "is_preferred"       boolean                    NOT NULL DEFAULT false,
        "created_by"         uuid                       NULL,
        "updated_by"         uuid                       NULL,
        "created_at"         timestamptz                NOT NULL DEFAULT now(),
        "updated_at"         timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_supplier_items_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_supplier_items_ingredient"
          FOREIGN KEY ("ingredient_id") REFERENCES "ingredients" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_supplier_items_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_supplier_items_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_supplier_items_unit_price_positive"
          CHECK ("unit_price" > 0),
        CONSTRAINT "ck_supplier_items_purchase_qty_positive"
          CHECK ("purchase_unit_qty" > 0),
        CONSTRAINT "ck_supplier_items_purchase_unit_nonblank"
          CHECK (length(trim(both from "purchase_unit")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_supplier_items_supplier_id" ON "supplier_items" ("supplier_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_supplier_items_ingredient_id" ON "supplier_items" ("ingredient_id")`,
    );
    // Single-preferred invariant: at most one preferred SupplierItem per ingredient.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_supplier_items_preferred_per_ingredient"
        ON "supplier_items" ("ingredient_id")
        WHERE "is_preferred" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_supplier_items_preferred_per_ingredient"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_supplier_items_ingredient_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_supplier_items_supplier_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_items"`);
  }
}
