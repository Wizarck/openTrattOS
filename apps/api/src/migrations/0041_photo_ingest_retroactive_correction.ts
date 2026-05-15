import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 hardening H1b — m3-photo-ingest-retroactive-correction-handler:
 * adds append-only corrections_history on photo_ingestion_items + the
 * requires_review flag (with partial indexes) on lots and goods_receipts
 * per ADR-APPEND-ONLY-CORRECTIONS-HISTORY + ADR-NEVER-AUTO-CASCADE-DOWNSTREAM.
 *
 * Slot 0041: per `master/docs/openspec-slice-module-3.md` post-Gate-C
 * 2026-05-15 amendment (rolled over from `m3-ai-obs-budget-tier-emitter`'s
 * unused 041 slot). Sibling slice `m3-photo-ingest-downstream-routing`
 * (H1a) claims 0040; both ALTERs are additive + commutative so either
 * merge order yields a valid forward chain.
 *
 * Schema rationale:
 *
 * - `corrections_history JSONB NOT NULL DEFAULT '[]'::jsonb` — append-only
 *   chain. Existing signed rows keep their default `[]` (forward-only;
 *   no backfill for items signed before this migration per tasks.md
 *   §Deferred).
 *
 * - `requires_review BOOLEAN NOT NULL DEFAULT false` on `lots` and
 *   `goods_receipts` — flipped by `DownstreamRevocationSubscriber` when a
 *   source photo-ingestion is retro-corrected. Default `false` ensures
 *   the entire backfill is a single DEFAULT-value rewrite at ALTER time.
 *
 * Partial indexes:
 * - `idx_lots_requires_review` — drives the future "operator review
 *   queue" surface; partial because the typical fleet has near-zero rows
 *   with `requires_review = true` so the index stays tiny.
 * - `idx_goods_receipts_requires_review` — same pattern for GR drafts.
 *
 * Down: reverses each ADD in reverse order so a failed up() leaves no
 * partial state.
 */
export class PhotoIngestRetroactiveCorrection1700000041000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "photo_ingestion_items"
        ADD COLUMN "corrections_history" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE "lots"
        ADD COLUMN "requires_review" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      ALTER TABLE "goods_receipts"
        ADD COLUMN "requires_review" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_lots_requires_review"
        ON "lots" ("organization_id", "id")
        WHERE "requires_review" = true;
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_goods_receipts_requires_review"
        ON "goods_receipts" ("organization_id", "id")
        WHERE "requires_review" = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_goods_receipts_requires_review";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_lots_requires_review";`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "requires_review";`,
    );
    await queryRunner.query(
      `ALTER TABLE "lots" DROP COLUMN IF EXISTS "requires_review";`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_ingestion_items" DROP COLUMN IF EXISTS "corrections_history";`,
    );
  }
}
