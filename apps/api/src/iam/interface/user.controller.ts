import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AssignUserToLocations, TenantBoundaryError } from '../application/assign-user-to-locations.use-case';
import { User } from '../domain/user.entity';
import { UserLocationRepository } from '../infrastructure/user-location.repository';
import { UserRepository } from '../infrastructure/user.repository';
import { AssignLocationsDto, ChangePasswordDto, CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { LocationResponseDto } from './dto/location.dto';
import { LocationRepository } from '../infrastructure/location.repository';

const FAKE_BCRYPT = '$2b$12$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi';

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
  @ApiOperation({
    summary: 'Create a new user (M1 stub: passwordHash placeholder)',
    description:
      'M1 hash policy: password is bcrypt-hashed by an auth service that lands in M1.x. For M1 entity tests, a deterministic placeholder hash is stored. Replace before exposing this endpoint outside dev.',
  })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.users.findByEmailAndOrg(dto.email, dto.organizationId);
    if (existing) {
      throw new ConflictException({ code: 'USER_EMAIL_DUPLICATE' });
    }
    const user = User.create({
      organizationId: dto.organizationId,
      name: dto.name,
      email: dto.email,
      passwordHash: FAKE_BCRYPT,
      role: dto.role,
    });
    const saved = await this.users.save(user);
    return UserResponseDto.fromEntity(saved);
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
  @ApiOperation({ summary: 'Update a user (mutable fields)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const u = await this.users.findOneBy({ id });
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    u.applyUpdate(dto);
    const saved = await this.users.save(u);
    return UserResponseDto.fromEntity(saved);
  }

  @Post(':id/change-password')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @ApiOperation({ summary: 'Change a user password (plaintext input → bcrypt hash)' })
  async changePassword(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() _dto: ChangePasswordDto,
  ): Promise<void> {
    const u = await this.users.findOneBy({ id });
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    // M1 stub — real bcrypt.hash() lands with the auth service. Validate
    // the hash shape via the domain method (placeholder hash for now).
    u.changePassword(FAKE_BCRYPT);
    await this.users.save(u);
  }

  @Post(':id/locations')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Replace the user\'s location assignment set',
    description: 'Atomic delete-then-insert. Cross-tenant location IDs raise 400.',
  })
  async assignLocations(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AssignLocationsDto,
  ): Promise<LocationResponseDto[]> {
    try {
      await this.assign.execute({ userId: id, locationIds: dto.locationIds });
    } catch (err) {
      if (err instanceof TenantBoundaryError) {
        throw new BadRequestException({ code: 'USER_LOCATION_CROSS_TENANT', detail: err.message });
      }
      throw err;
    }
    if (dto.locationIds.length === 0) return [];
    const locations = await this.locations.findManyByIds(dto.locationIds);
    return locations.map(LocationResponseDto.fromEntity);
  }

  @Delete(':id/locations/:locationId')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a single location assignment' })
  async removeAssignment(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('locationId', new ParseUUIDPipe({ version: '4' })) locationId: string,
  ): Promise<void> {
    await this.userLocations.deleteByUserAndLocations(id, [locationId]);
  }
}
