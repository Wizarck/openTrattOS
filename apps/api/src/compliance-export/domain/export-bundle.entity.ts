import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type {
  ExportBundleStatus,
  Locale,
  ScopeKind,
} from '../types';

/**
 * Operational projection of an APPCC export bundle. The regulator-facing
 * record lives on `audit_log` as the `EXPORT_BUNDLE_GENERATED` envelope;
 * this row is updated AFTER the envelope is emitted (cross-validated in
 * tests). Both carry the same `sha256` by construction.
 *
 * Per ADR-BUNDLE-AS-AGGREGATE: this row exists because (a) j9's archive
 * table needs an index-driven scan, (b) bundle generation goes through
 * pending → generating → ready transitions that the regulator chain
 * shouldn't carry as separate envelopes, (c) the storage paths are stable
 * across requests.
 *
 * Multi-tenant: every method gates on `organizationId`. Soft-delete via
 * `deletedAt` (operator hides a bundle from the archive without breaking
 * the chain). Cold-storage archival flips `status='archived'` + sets
 * `archivedAt`; the M3.x retention cron moves the bytes — out of scope
 * for this slice.
 */
@Entity({ name: 'export_bundles' })
@Index('idx_export_bundles_org_created_at', ['organizationId', 'createdAt'])
export class ExportBundle {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId!: string;

  @Column({ name: 'range_start', type: 'timestamptz' })
  rangeStart!: Date;

  @Column({ name: 'range_end', type: 'timestamptz' })
  rangeEnd!: Date;

  @Column({ type: 'text' })
  locale!: Locale;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  scope!: ScopeKind[];

  @Column({ type: 'text', default: 'pending' })
  status!: ExportBundleStatus;

  @Column({ name: 'pdf_storage_path', type: 'text', nullable: true })
  pdfStoragePath: string | null = null;

  @Column({ name: 'csv_storage_path', type: 'text', nullable: true })
  csvStoragePath: string | null = null;

  @Column({ type: 'text', nullable: true })
  sha256: string | null = null;

  @Column({ name: 'page_count', type: 'integer', nullable: true })
  pageCount: number | null = null;

  @Column({ name: 'byte_size', type: 'integer', nullable: true })
  byteSize: number | null = null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null = null;

  @Column({ name: 'generated_at', type: 'timestamptz', nullable: true })
  generatedAt: Date | null = null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null = null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
