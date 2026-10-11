import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ChargesService } from './charges.service';
import { GenerateChargesDto, SetInvoiceOccupancyDto, SetInvoicePaidDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('charges')
export class ChargesController {
  constructor(private charges: ChargesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query('unitId') unitId?: string,
  ) {
    return this.charges.list(user, fiscalYearId, unitId);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateChargesDto) {
    return this.charges.generate(user, dto.fiscalYearId);
  }

  @Patch('invoices/:id/occupancy')
  setOccupancy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetInvoiceOccupancyDto) {
    return this.charges.setInvoiceOccupancy(user, id, dto.occupancy);
  }

  @Patch('invoices/:id/paid')
  setPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetInvoicePaidDto) {
    return this.charges.setInvoicePaid(user, id, dto.paidAmount);
  }
}
