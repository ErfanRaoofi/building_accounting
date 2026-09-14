import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('unit-charges')
  unitCharges(
    @CurrentUser() user: AuthUser,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.reports.unitCharges(user, fiscalYearId, parsePagination(query));
  }

  @Get('debtors')
  debtors(
    @CurrentUser() user: AuthUser,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.reports.debtors(user, fiscalYearId, parsePagination(query), query);
  }

  @Get('payments')
  payments(
    @CurrentUser() user: AuthUser,
    @Query('buildingId') buildingId: string,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryId') categoryId?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.reports.payments(user, buildingId, fiscalYearId, parsePagination(query), from, to, categoryId);
  }
}
