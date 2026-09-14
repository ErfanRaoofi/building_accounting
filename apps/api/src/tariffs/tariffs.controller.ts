import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TariffsService } from './tariffs.service';
import { CreateTariffDto, UpdateTariffDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller('tariffs')
export class TariffsController {
  constructor(private tariffs: TariffsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('buildingId') buildingId: string, @Query() query: Record<string, string>) {
    return this.tariffs.list(user, buildingId, parsePagination(query));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTariffDto) {
    return this.tariffs.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTariffDto) {
    return this.tariffs.update(user, id, dto);
  }
}
