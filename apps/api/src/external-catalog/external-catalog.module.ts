import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalCatalogService } from './application/external-catalog.service';
import { OffSyncService } from './application/off-sync.service';
import { ExternalFoodCatalog } from './domain/external-food-catalog.entity';
import { ExternalFoodCatalogRepository } from './infrastructure/external-food-catalog.repository';
import { ExternalCatalogController } from './interface/external-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalFoodCatalog]), ScheduleModule.forRoot()],
  controllers: [ExternalCatalogController],
  providers: [ExternalFoodCatalogRepository, ExternalCatalogService, OffSyncService],
  exports: [ExternalFoodCatalogRepository, ExternalCatalogService, TypeOrmModule],
})
export class ExternalCatalogModule {}
