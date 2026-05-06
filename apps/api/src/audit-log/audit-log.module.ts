import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogService } from './application/audit-log.service';
import { AuditLogSubscriber } from './application/audit-log.subscriber';
import { AuditLog } from './domain/audit-log.entity';
import { AuditLogController } from './interface/audit-log.controller';

/**
 * Canonical audit log BC. Hosts the `audit_log` table, the
 * `AuditLogSubscriber` that listens to all known event types, and the
 * `GET /audit-log` endpoint.
 *
 * Per ADR-AUDIT-WRITER, no other BC depends on this module — they emit
 * events on the bus, the subscriber persists them. Adding a new event type
 * in M3+ is a 1-line addition to `AuditLogSubscriber` + a constants entry
 * in `application/types.ts`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogSubscriber],
  exports: [AuditLogService],
})
export class AuditLogModule {}
