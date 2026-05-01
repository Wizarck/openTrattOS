import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from './domain/menu-item.entity';
import { MenuItemRepository } from './infrastructure/menu-item.repository';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem])],
  providers: [MenuItemRepository],
  exports: [MenuItemRepository, TypeOrmModule],
})
export class MenusModule {}
