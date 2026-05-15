import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EmailDispatchModule } from '../shared/email-dispatch/email-dispatch.module';
import { BundleArchiveQuery } from './application/bundle-archive.query';
import { BundleGeneratorService } from './application/bundle-generator.service';
import { BundleStatusQuery } from './application/bundle-status.query';
import { ChapterZeroAuditLogRenderer } from './application/chapter-renderers/chapter-0-audit-log.renderer';
import { ChapterAiObsRenderer } from './application/chapter-renderers/chapter-ai-obs.renderer';
import { ChapterHaccpRenderer } from './application/chapter-renderers/chapter-haccp.renderer';
import { ChapterLotRenderer } from './application/chapter-renderers/chapter-lot.renderer';
import { ChapterPhotoRenderer } from './application/chapter-renderers/chapter-photo.renderer';
import { ChapterProcurementRenderer } from './application/chapter-renderers/chapter-procurement.renderer';
import { ExportBundle } from './domain/export-bundle.entity';
import { BundleController } from './interface/bundle.controller';
import { BUNDLE_STORAGE } from './storage/bundle-storage';
import { LocalBundleStorage } from './storage/local-bundle-storage';

/**
 * APPCC compliance-export BC (M3 Wave 2.7, slice #14).
 *
 * Owns:
 *  - `ExportBundle` entity + `export_bundles` table.
 *  - `BundleGeneratorService` (chapter 0 + N derivative chapters → SHA-256 sealed PDF + CSV).
 *  - 6 chapter renderers (chapter-0-audit-log, haccp, lot, procurement, photo, ai-obs).
 *  - `BundleArchiveQuery` + `BundleStatusQuery` (read surfaces).
 *  - `LocalBundleStorage` (filesystem default; S3 backend deferred).
 *  - `BundleController` REST surface at `/m3/compliance/exports`.
 *
 * Imports `AuditLogModule` for `AuditLogService.streamRows()` (chapter 0
 * streaming) + `EmailDispatchModule` for `EMAIL_DISPATCH_SERVICE` DI
 * (per ADR-039 + slice #22 m3-email-dispatch-di).
 *
 * Audit-log subscriber registration for `EXPORT_BUNDLE_GENERATED` +
 * `EXPORT_BUNDLE_DISPATCHED` is NOT wired here — it lives in the
 * canonical `AuditLogSubscriber` per ADR-CROSS-BC-SUBSCRIBER-LOCATION +
 * slice #21's ADR-SUBSCRIBER-FAN-OUT.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExportBundle]),
    AuditLogModule,
    EmailDispatchModule,
  ],
  controllers: [BundleController],
  providers: [
    BundleGeneratorService,
    BundleArchiveQuery,
    BundleStatusQuery,
    ChapterZeroAuditLogRenderer,
    ChapterHaccpRenderer,
    ChapterLotRenderer,
    ChapterProcurementRenderer,
    ChapterPhotoRenderer,
    ChapterAiObsRenderer,
    LocalBundleStorage,
    {
      provide: BUNDLE_STORAGE,
      useExisting: LocalBundleStorage,
    },
  ],
  exports: [
    BundleGeneratorService,
    BundleArchiveQuery,
    BundleStatusQuery,
  ],
})
export class ComplianceExportModule {}
