import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UnitsService } from './units.service';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller('units')
export class UnitsController {
  constructor(private units: UnitsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('buildingId') buildingId: string, @Query() query: Record<string, string>) {
    return this.units.list(user, buildingId, parsePagination(query));
  }

  @Get(':id/ledger')
  ledger(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.units.ledger(user, id, fiscalYearId, {
      invoices: parsePagination({
        page: query['invoicePage'],
        pageSize: query['invoicePageSize'],
        all: query['invoiceAll'],
      }),
      receipts: parsePagination({
        page: query['receiptPage'],
        pageSize: query['receiptPageSize'],
        all: query['receiptAll'],
      }),
    });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUnitDto) {
    return this.units.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.units.update(user, id, dto);
  }
}
