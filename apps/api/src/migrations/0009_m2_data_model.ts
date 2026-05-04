import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 foundation schema (per openspec/specs/m2-data-model/):
 *   - 3 new tables: recipes, recipe_ingredients, menu_items
 *   - 5 new columns on existing `ingredients`: nutrition (jsonb), allergens (text[]),
 *     diet_flags (text[]), brand_name, external_source_ref
 *   - 1 new column on existing `users`: phone_number (E.164 nullable)
 *
 * Cascade rules per design.md §"Cascade rules":
 *   - recipe_ingredient.recipe_id ON DELETE CASCADE (deletes its lines with the recipe)
 *   - recipe_ingredient.ingredient_id ON DELETE RESTRICT (refuse to delete ingredients used in recipes)
 *   - recipe_ingredient.sub_recipe_id ON DELETE RESTRICT (refuse to delete sub-recipes still composed)
 *   - menu_item.recipe_id ON DELETE RESTRICT (refuse to delete recipes still on a menu)
 *
 * Polymorphic component (RecipeIngredient.ingredientId XOR subRecipeId): enforced
 * via CHECK constraint per design.md §"Polymorphic RecipeIngredient.componentId" decision.
 */
export class M2DataModel1700000009000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- recipes ----------------
    await queryRunner.query(`
      CREATE TABLE "recipes" (
        "id"              uuid                       PRIMARY KEY,
        "organization_id" uuid                       NOT NULL,
        "name"            varchar(200)               NOT NULL,
        "description"     text                       NOT NULL DEFAULT '',
        "notes"           text                       NULL,
        "waste_factor"    numeric(5,4)               NOT NULL,
        "is_active"       boolean                    NOT NULL DEFAULT true,
        "created_by"      uuid                       NULL,
        "updated_by"      uuid                       NULL,
        "created_at"      timestamptz                NOT NULL DEFAULT now(),
        "updated_at"      timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_recipes_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_recipes_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_recipes_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_recipes_waste_factor_range"
          CHECK ("waste_factor" >= 0 AND "waste_factor" < 1),
        CONSTRAINT "ck_recipes_name_nonblank"
          CHECK (length(trim(both from "name")) > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "ix_recipes_organization_id" ON "recipes" ("organization_id")`);
    await queryRunner.query(
      `CREATE INDEX "ix_recipes_organization_active" ON "recipes" ("organization_id", "is_active")`,
    );

    // ---------------- recipe_ingredients ----------------
    await queryRunner.query(`
      CREATE TABLE "recipe_ingredients" (
        "id"                       uuid          PRIMARY KEY,
        "recipe_id"                uuid          NOT NULL,
        "ingredient_id"            uuid          NULL,
        "sub_recipe_id"            uuid          NULL,
        "quantity"                 numeric(14,4) NOT NULL,
        "unit_id"                  varchar(16)   NOT NULL,
        "yield_percent_override"   numeric(5,4)  NULL,
        "source_override_ref"      varchar(200)  NULL,
        "created_by"               uuid          NULL,
        "updated_by"               uuid          NULL,
        "created_at"               timestamptz   NOT NULL DEFAULT now(),
        "updated_at"               timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "fk_recipe_ingredients_recipe"
          FOREIGN KEY ("recipe_id") REFERENCES "recipes" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_recipe_ingredients_ingredient"
          FOREIGN KEY ("ingredient_id") REFERENCES "ingredients" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_recipe_ingredients_sub_recipe"
          FOREIGN KEY ("sub_recipe_id") REFERENCES "recipes" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_recipe_ingredients_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_recipe_ingredients_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_recipe_ingredients_exactly_one_component"
          CHECK ((("ingredient_id" IS NOT NULL)::int + ("sub_recipe_id" IS NOT NULL)::int) = 1),
        CONSTRAINT "ck_recipe_ingredients_quantity_positive"
          CHECK ("quantity" > 0),
        CONSTRAINT "ck_recipe_ingredients_yield_range"
          CHECK ("yield_percent_override" IS NULL OR ("yield_percent_override" >= 0 AND "yield_percent_override" <= 1))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_recipe_ingredients_recipe_id" ON "recipe_ingredients" ("recipe_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_recipe_ingredients_ingredient_id" ON "recipe_ingredients" ("ingredient_id") WHERE "ingredient_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_recipe_ingredients_sub_recipe_id" ON "recipe_ingredients" ("sub_recipe_id") WHERE "sub_recipe_id" IS NOT NULL`,
    );

    // ---------------- menu_items ----------------
    await queryRunner.query(`
      CREATE TABLE "menu_items" (
        "id"              uuid          PRIMARY KEY,
        "organization_id" uuid          NOT NULL,
        "recipe_id"       uuid          NOT NULL,
        "location_id"     uuid          NOT NULL,
        "channel"         varchar(16)   NOT NULL,
        "selling_price"   numeric(14,4) NOT NULL,
        "target_margin"   numeric(5,4)  NOT NULL,
        "is_active"       boolean       NOT NULL DEFAULT true,
        "created_by"      uuid          NULL,
        "updated_by"      uuid          NULL,
        "created_at"      timestamptz   NOT NULL DEFAULT now(),
        "updated_at"      timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "fk_menu_items_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_menu_items_recipe"
          FOREIGN KEY ("recipe_id") REFERENCES "recipes" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_menu_items_location"
          FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_menu_items_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_menu_items_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_menu_items_channel_enum"
          CHECK ("channel" IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'CATERING')),
        CONSTRAINT "ck_menu_items_selling_price_positive"
          CHECK ("selling_price" > 0),
        CONSTRAINT "ck_menu_items_target_margin_range"
          CHECK ("target_margin" >= 0 AND "target_margin" < 1)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_menu_items_organization_id" ON "menu_items" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_menu_items_recipe_id" ON "menu_items" ("recipe_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_menu_items_organization_location" ON "menu_items" ("organization_id", "location_id")`,
    );

    // ---------------- ingredients extensions (M2) ----------------
    await queryRunner.query(`
      ALTER TABLE "ingredients"
        ADD COLUMN "nutrition"           jsonb           NULL,
        ADD COLUMN "allergens"           text[]          NOT NULL DEFAULT '{}',
        ADD COLUMN "diet_flags"          text[]          NOT NULL DEFAULT '{}',
        ADD COLUMN "brand_name"          varchar(200)    NULL,
        ADD COLUMN "external_source_ref" varchar(200)    NULL
    `);

    // ---------------- users extension (M2.x WhatsApp foundation) ----------------
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "phone_number" varchar(32) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_number"`);
    await queryRunner.query(`
      ALTER TABLE "ingredients"
        DROP COLUMN IF EXISTS "external_source_ref",
        DROP COLUMN IF EXISTS "brand_name",
        DROP COLUMN IF EXISTS "diet_flags",
        DROP COLUMN IF EXISTS "allergens",
        DROP COLUMN IF EXISTS "nutrition"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_menu_items_organization_location"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_menu_items_recipe_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_menu_items_organization_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "menu_items"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipe_ingredients_sub_recipe_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipe_ingredients_ingredient_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipe_ingredients_recipe_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipe_ingredients"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipes_organization_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipes_organization_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipes"`);
  }
}
