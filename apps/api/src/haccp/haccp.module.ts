import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CcpReadingService } from './application/ccp-reading.service';
import { CorrectiveActionService } from './application/corrective-action.service';
import { FsmsStandardService } from './application/fsms-standard.service';
import { OutOfSpecWithoutActionQuery } from './application/out-of-spec-without-action.query';
import { RecentReadingsQuery } from './application/recent-readings.query';
import { CcpReading } from './domain/ccp-reading.entity';
import { CorrectiveAction } from './domain/corrective-action.entity';
import { FsmsStandard } from './domain/fsms-standard.entity';
import { CcpReadingController } from './interface/ccp-reading.controller';
import { CorrectiveActionController } from './interface/corrective-action.controller';
import { FsmsStandardController } from './interface/fsms-standard.controller';

@Module({
  imports: [
    AuditLogModule,
    TypeOrmModule.forFeature([CcpReading, CorrectiveAction, FsmsStandard]),
  ],
  providers: [
    CcpReadingService,
    CorrectiveActionService,
    FsmsStandardService,
    RecentReadingsQuery,
    OutOfSpecWithoutActionQuery,
  ],
  controllers: [
    CcpReadingController,
    CorrectiveActionController,
    FsmsStandardController,
  ],
  exports: [
    CcpReadingService,
    CorrectiveActionService,
    FsmsStandardService,
    RecentReadingsQuery,
    OutOfSpecWithoutActionQuery,
  ],
})
export class HaccpModule {}
