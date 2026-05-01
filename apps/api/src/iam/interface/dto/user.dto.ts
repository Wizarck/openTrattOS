import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import { User, UserRole } from '../../domain/user.entity';

export class CreateUserDto {
  @ApiProperty()
  @IsUUID('4')
  organizationId!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ example: 'lourdes@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Plaintext; will be bcrypt-hashed by the use-case' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ['OWNER', 'MANAGER', 'STAFF'] })
  @IsEnum(['OWNER', 'MANAGER', 'STAFF'])
  role!: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ enum: ['OWNER', 'MANAGER', 'STAFF'] })
  @IsOptional()
  @IsEnum(['OWNER', 'MANAGER', 'STAFF'])
  role?: UserRole;
}

export class ChangePasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class AssignLocationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds!: string[];
}

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['OWNER', 'MANAGER', 'STAFF'] }) role!: UserRole;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(u: User): UserResponseDto {
    return {
      id: u.id,
      organizationId: u.organizationId,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }
}
