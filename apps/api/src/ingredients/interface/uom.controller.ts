import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UNITS, UoMDefinition, UoMFamily, listUnitsByFamily } from '../domain/uom/units';

@ApiTags('UoM')
@Controller('uom')
export class UoMController {
  @Get()
  @ApiOperation({
    summary: 'List canonical units of measure',
    description:
      'Returns the playbook-canonical UoM registry (5 WEIGHT + 5 VOLUME + 3 UNIT). ' +
      'Filter by family with `?family=WEIGHT|VOLUME|UNIT`. Read-only — UoM is canonical data, not user-editable.',
  })
  @ApiQuery({ name: 'family', required: false, enum: ['WEIGHT', 'VOLUME', 'UNIT'] })
  list(@Query('family') family?: UoMFamily): readonly UoMDefinition[] {
    if (family && (family === 'WEIGHT' || family === 'VOLUME' || family === 'UNIT')) {
      return listUnitsByFamily(family);
    }
    return UNITS;
  }
}
