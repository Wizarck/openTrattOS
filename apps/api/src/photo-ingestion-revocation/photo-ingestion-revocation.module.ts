import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DownstreamRevocationRepository } from './application/downstream-revocation.repository';
import { DownstreamRevocationSubscriber } from './application/downstream-revocation.subscriber';

/**
 * Photo-ingestion downstream-revocation BC
 * (`m3.x-photo-ingest-downstream-revocation-listener`).
 *
 * Listens on `HITL_RETROACTIVE_CORRECTION` (emitted by H1b's
 * `RetroactiveCorrectionService`) and flags downstream Lot / GR-draft
 * rows whose `source_photo_ingestion_id` matches as `requires_review=true`.
 * Three new audit envelopes are emitted by the subscriber (one per Lot
 * flagged, one per GR flagged, one DEFERRED when migration 0041 has not
 * yet run); they fan out through the single `AuditLogSubscriber`.
 *
 * The BC owns NO entity (`lots` and `goods_receipts` are persisted by
 * other BCs; we touch them via raw SQL UPDATE through the repository).
 * Per ADR-CROSS-BC-SUBSCRIBER-LOCATION (slice #21), this BC NEVER writes
 * to `audit_log` directly — it emits envelopes and the audit-log BC
 * persists.
 */
@Module({
  imports: [AuditLogModule],
  providers: [DownstreamRevocationRepository, DownstreamRevocationSubscriber],
  exports: [DownstreamRevocationRepository, DownstreamRevocationSubscriber],
})
export class PhotoIngestionRevocationModule {}
