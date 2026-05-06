import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { AssignUserToLocations, TenantBoundaryError } from '../application/assign-user-to-locations.use-case';
import { User } from '../domain/user.entity';
import { UserLocationRepository } from '../infrastructure/user-location.repository';
import { UserRepository } from '../infrastructure/user.repository';
import { AssignLocationsDto, ChangePasswordDto, CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { LocationResponseDto } from './dto/location.dto';
import { LocationRepository } from '../infrastructure/location.repository';

const BCRYPT_COST = 12;

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    private readonly users: UserRepository,
    private readonly userLocations: UserLocationRepository,
    private readonly locations: LocationRepository,
    private readonly assign: AssignUserToLocations,
  ) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('user', null)
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'Plaintext password is bcrypt-hashed at cost 12 before persisting. The plaintext never touches the database.',
  })
  async create(@Body() dto: CreateUserDto): Promise<WriteResponseDto<UserResponseDto>> {
    const existing = await this.users.findByEmailAndOrg(dto.email, dto.organizationId);
    if (existing) {
      throw new ConflictException({ code: 'USER_EMAIL_DUPLICATE' });
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = User.create({
      organizationId: dto.organizationId,
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role,
    });
    const saved = await this.users.save(user);
    return toWriteResponse(UserResponseDto.fromEntity(saved));
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get a user by id' })
  async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<UserResponseDto> {
    const u = await this.users.findOneBy({ id });
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    return UserResponseDto.fromEntity(u);
  }

  @Get()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List users for an organization' })
  async list(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
  ): Promise<UserResponseDto[]> {
    const rows = await this.users.findByOrganization(organizationId);
    return rows.map(UserResponseDto.fromEntity);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('user')
  @ApiOperation({ summary: 'Update a user (mutable fields)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<WriteResponseDto<UserResponseDto>> {
    const u = await this.users.findOneBy({ id });
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    u.applyUpdate(dto);
    const saved = await this.users.save(u);
    return toWriteResponse(UserResponseDto.fromEntity(saved));
  }

  @Post(':id/change-password')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('user')
  @ApiOperation({ summary: 'Change a user password (plaintext input → bcrypt hash)' })
  async changePassword(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const u = await this.users.findOneBy({ id });
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    u.changePassword(newHash);
    await this.users.save(u);
    return toWriteResponse({ id });
  }

  @Post(':id/locations')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('user')
  @ApiOperation({
    summary: 'Replace the user\'s location assignment set',
    description: 'Atomic delete-then-insert. Cross-tenant location IDs raise 400.',
  })
  async assignLocations(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AssignLocationsDto,
  ): Promise<WriteResponseDto<LocationResponseDto[]>> {
    try {
      await this.assign.execute({ userId: id, locationIds: dto.locationIds });
    } catch (err) {
      if (err instanceof TenantBoundaryError) {
        throw new BadRequestException({ code: 'USER_LOCATION_CROSS_TENANT', detail: err.message });
      }
      throw err;
    }
    if (dto.locationIds.length === 0) return toWriteResponse([] as LocationResponseDto[]);
    const locations = await this.locations.findManyByIds(dto.locationIds);
    return toWriteResponse(locations.map(LocationResponseDto.fromEntity));
  }

  @Delete(':id/locations/:locationId')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('user')
  @ApiOperation({ summary: 'Remove a single location assignment' })
  async removeAssignment(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('locationId', new ParseUUIDPipe({ version: '4' })) locationId: string,
  ): Promise<WriteResponseDto<{ id: string; locationId: string }>> {
    await this.userLocations.deleteByUserAndLocations(id, [locationId]);
    return toWriteResponse({ id, locationId });
  }
}
