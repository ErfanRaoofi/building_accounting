import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FiscalYearsService } from './fiscal-years.service';
import { CreateFiscalYearDto, UpdateFiscalYearDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller('fiscal-years')
export class FiscalYearsController {
  constructor(private fiscalYears: FiscalYearsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('buildingId') buildingId: string, @Query() query: Record<string, string>) {
    return this.fiscalYears.list(user, buildingId, parsePagination(query));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFiscalYearDto) {
    return this.fiscalYears.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateFiscalYearDto) {
    return this.fiscalYears.update(user, id, dto);
  }

  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fiscalYears.close(user, id);
  }
}
