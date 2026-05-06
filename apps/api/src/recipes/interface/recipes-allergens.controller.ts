import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import {
  CrossContaminationMissingTagsError,
  OverrideMissingReasonError,
  RecipeAllergensNotFoundError,
  RecipesAllergensService,
} from '../application/recipes-allergens.service';
import {
  AllergensRollupResponseDto,
  ApplyAllergensOverrideDto,
  ApplyCrossContaminationDto,
  ApplyDietFlagsOverrideDto,
  DietFlagsRollupResponseDto,
} from './dto/recipes-allergens.dto';

/**
 * Recipe-level allergen + diet-flag rollup + Manager+ override + cross-
 * contamination endpoints. EU 1169/2011 Article 21 regulatory contract;
 * conservatism beats speed (see openspec/changes/m2-allergens-article-21/).
 *
 * Reads are open to all roles (OWNER / MANAGER / STAFF — staff need allergen
 * info on prep-day labels). Writes are Manager+ (OWNER / MANAGER) only.
 */
@ApiTags('Recipes — Allergens')
@Controller('recipes')
export class RecipesAllergensController {
  constructor(private readonly service: RecipesAllergensService) {}

  // ----------------------------- read paths -----------------------------

  @Get(':id/allergens')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Get the conservatively-aggregated allergen rollup for a Recipe',
    description:
      'Walks the sub-recipe tree and unions all leaf-Ingredient allergens. ' +
      'Includes Manager+ override (if any) merged into `aggregated` and the ' +
      'cross-contamination note + structured tags as a separate field.',
  })
  async getAllergens(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AllergensRollupResponseDto> {
    try {
      const rollup = await this.service.getAllergensRollup(organizationId, id);
      return AllergensRollupResponseDto.from(rollup);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get(':id/diet-flags')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Get the conservatively-inferred diet-flag rollup for a Recipe',
    description:
      'A flag is true at recipe level only if every leaf Ingredient carries it ' +
      'AND no contradicting allergen is present. Conflicts surface as warnings.',
  })
  async getDietFlags(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DietFlagsRollupResponseDto> {
    try {
      const rollup = await this.service.getDietFlagsRollup(organizationId, id);
      return DietFlagsRollupResponseDto.from(rollup);
    } catch (err) {
      throw this.translate(err);
    }
  }

  // ----------------------------- write paths -----------------------------

  @Put(':id/allergens-override')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('recipe')
  @ApiOperation({
    summary: 'Apply a Manager+ override to the aggregated allergen list',
    description:
      'Final list = (aggregated ∪ add) − remove. Reason is required for audit.',
  })
  async putAllergensOverride(
    @Req() req: Request,
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ApplyAllergensOverrideDto,
  ): Promise<WriteResponseDto<AllergensRollupResponseDto>> {
    const actor = this.actor(req);
    try {
      await this.service.applyAllergensOverride(organizationId, actor, id, {
        add: dto.add,
        remove: dto.remove,
        reason: dto.reason,
      });
      const rollup = await this.service.getAllergensRollup(organizationId, id);
      return toWriteResponse(AllergensRollupResponseDto.from(rollup));
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Put(':id/diet-flags-override')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('recipe')
  @ApiOperation({
    summary: 'Apply a Manager+ override to the inferred diet-flag set',
    description: 'Replaces the inferred set wholesale. Reason is required for audit.',
  })
  async putDietFlagsOverride(
    @Req() req: Request,
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ApplyDietFlagsOverrideDto,
  ): Promise<WriteResponseDto<DietFlagsRollupResponseDto>> {
    const actor = this.actor(req);
    try {
      await this.service.applyDietFlagsOverride(organizationId, actor, id, {
        flags: dto.flags,
        reason: dto.reason,
      });
      const rollup = await this.service.getDietFlagsRollup(organizationId, id);
      return toWriteResponse(DietFlagsRollupResponseDto.from(rollup));
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Put(':id/cross-contamination')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('recipe')
  @ApiOperation({
    summary: 'Record cross-contamination ("may contain traces of [X]") for a Recipe',
    description:
      'Both a free-text note AND a non-empty structured allergen tag list are required. ' +
      'Validation rejects free text without structured tagging.',
  })
  async putCrossContamination(
    @Req() req: Request,
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ApplyCrossContaminationDto,
  ): Promise<WriteResponseDto<AllergensRollupResponseDto>> {
    const actor = this.actor(req);
    try {
      await this.service.applyCrossContamination(organizationId, actor, id, {
        note: dto.note,
        allergens: dto.allergens,
      });
      const rollup = await this.service.getAllergensRollup(organizationId, id);
      return toWriteResponse(AllergensRollupResponseDto.from(rollup));
    } catch (err) {
      throw this.translate(err);
    }
  }

  // ------------------------------ helpers ------------------------------

  private actor(req: Request): string {
    const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
    if (!user || !user.userId) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }
    return user.userId;
  }

  private translate(err: unknown): Error {
    if (err instanceof RecipeAllergensNotFoundError) {
      return new NotFoundException({ code: 'RECIPE_NOT_FOUND', recipeId: err.recipeId });
    }
    if (err instanceof OverrideMissingReasonError) {
      return new UnprocessableEntityException({
        code: 'ALLERGEN_OVERRIDE_REASON_REQUIRED',
        kind: err.kind,
      });
    }
    if (err instanceof CrossContaminationMissingTagsError) {
      return new UnprocessableEntityException({
        code: 'ALLERGEN_CROSS_CONTAMINATION_TAGS_REQUIRED',
      });
    }
    if (err instanceof Error) return err;
    return new BadRequestException(String(err));
  }
}
