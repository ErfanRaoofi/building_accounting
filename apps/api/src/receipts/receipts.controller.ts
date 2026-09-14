import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { CreateReceiptDto, CreateReceiptTypeDto, UpdateReceiptTypeDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller()
export class ReceiptsController {
  constructor(private receipts: ReceiptsService) {}

  @Get('receipt-types')
  types(@CurrentUser() user: AuthUser, @Query('buildingId') buildingId: string, @Query() query: Record<string, string>) {
    return this.receipts.types(user, buildingId, parsePagination(query));
  }

  @Post('receipt-types')
  createType(@CurrentUser() user: AuthUser, @Body() dto: CreateReceiptTypeDto) {
    return this.receipts.createType(user, dto);
  }

  @Patch('receipt-types/:id')
  updateType(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateReceiptTypeDto) {
    return this.receipts.updateType(user, id, dto);
  }

  @Get('receipts')
  list(
    @CurrentUser() user: AuthUser,
    @Query('buildingId') buildingId: string,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.receipts.list(user, buildingId, fiscalYearId, parsePagination(query), query.q);
  }

  @Post('receipts')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReceiptDto) {
    return this.receipts.create(user, dto);
  }
}
