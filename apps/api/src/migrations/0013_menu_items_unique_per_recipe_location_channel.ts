import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 menus-margins: composite uniqueness on active MenuItems.
 *
 * Per design.md §"Composite uniqueness on (orgId, recipeId, locationId, channel)":
 * a Recipe can only have one ACTIVE MenuItem per Location+Channel. Inactive
 * (soft-deleted) rows are excluded from the constraint so re-creating a
 * MenuItem for a previously-deactivated combo is allowed without resurrecting
 * the dead row.
 */
export class MenuItemsUniquePerRecipeLocationChannel1700000013000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_menu_items_active_recipe_location_channel"
        ON "menu_items" ("organization_id", "recipe_id", "location_id", "channel")
        WHERE "is_active" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_menu_items_active_recipe_location_channel"`);
  }
}
