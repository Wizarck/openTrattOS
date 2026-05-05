import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { LabelsService } from '../application/labels.service';
import {
  LabelOrganizationNotFoundError,
  LabelRecipeNotFoundError,
  MissingMandatoryFieldsError,
  PrintAdapterNotConfiguredError,
  PrintAdapterUnknownError,
  UnsupportedLocaleError,
} from '../application/errors';
import { PrintLabelDto, PrintLabelResponseDto } from './dto/print-label.dto';

@ApiTags('Labels')
@Controller('recipes')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get(':id/label')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Render the EU 1169/2011 label PDF for a Recipe',
    description:
      'Returns a streaming PDF in `Content-Type: application/pdf`. Refuses (422) when any Article 9 mandatory field is missing, naming each missing field. Locale defaults to the org `defaultLocale` when omitted; explicit override via `?locale=`.',
  })
  async renderLabel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) recipeId: string,
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('locale') locale: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { pdf } = await this.labels.renderLabel(organizationId, recipeId, locale);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'private, max-age=300'); // mirror server-side TTL
      res.send(pdf);
    } catch (err) {
      this.translateAndThrow(err);
    }
  }

  @Post(':id/print')
  @HttpCode(200)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Dispatch the rendered label to the configured print adapter',
    description:
      'Resolves the org `printAdapter` config, renders (or reuses cached) PDF, and invokes the adapter. 422 when no adapter is configured. 502 when the adapter rejects/times out/is unreachable.',
  })
  async printLabel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) recipeId: string,
    @Body() dto: PrintLabelDto,
  ): Promise<PrintLabelResponseDto> {
    try {
      const result = await this.labels.printLabel(dto.organizationId, recipeId, {
        locale: dto.locale,
        copies: dto.copies,
        printerId: dto.printerId,
      });
      if (!result.ok) {
        throw new BadGatewayException({
          code: result.error?.code ?? 'PRINT_FAILED',
          message: result.error?.message ?? 'Print adapter rejected the job',
        });
      }
      const response = new PrintLabelResponseDto();
      response.ok = true;
      response.jobId = result.jobId;
      return response;
    } catch (err) {
      this.translateAndThrow(err);
    }
  }

  private translateAndThrow(err: unknown): never {
    if (err instanceof MissingMandatoryFieldsError) {
      throw new UnprocessableEntityException({
        code: 'MISSING_MANDATORY_FIELDS',
        missing: err.missing,
      });
    }
    if (err instanceof UnsupportedLocaleError) {
      throw new UnprocessableEntityException({
        code: 'UNSUPPORTED_LOCALE',
        locale: err.locale,
        supported: err.supported,
      });
    }
    if (err instanceof PrintAdapterNotConfiguredError) {
      throw new UnprocessableEntityException({
        code: 'PRINT_ADAPTER_NOT_CONFIGURED',
        organizationId: err.organizationId,
      });
    }
    if (err instanceof PrintAdapterUnknownError) {
      throw new UnprocessableEntityException({
        code: 'PRINT_ADAPTER_UNKNOWN',
        adapterId: err.adapterId,
      });
    }
    if (err instanceof LabelRecipeNotFoundError) {
      throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', recipeId: err.recipeId });
    }
    if (err instanceof LabelOrganizationNotFoundError) {
      throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });
    }
    throw err;
  }
}
