import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { Category } from '../../domain/category.entity';

export class CreateCategoryDto {
  @ApiProperty() @IsUUID('4') organizationId!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID('4')
  parentId?: string | null;
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiProperty() @IsString() @Length(1, 200) nameEs!: string;
  @ApiProperty() @IsString() @Length(1, 200) nameEn!: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID('4')
  parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) nameEs?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class CategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() nameEs!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(c: Category): CategoryResponseDto {
    return {
      id: c.id,
      organizationId: c.organizationId,
      parentId: c.parentId,
      name: c.name,
      nameEs: c.nameEs,
      nameEn: c.nameEn,
      sortOrder: c.sortOrder,
      isDefault: c.isDefault,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
