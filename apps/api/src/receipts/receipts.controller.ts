import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import {
  CreateReceiptDto,
  CreateReceiptTypeDto,
  UpdateReceiptDto,
  UpdateReceiptPaymentDto,
  UpdateReceiptTypeDto,
} from './dto';
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
    return this.receipts.list(user, buildingId, fiscalYearId, parsePagination(query), {
      q: query.q,
      unitQ: query.unitQ,
      sort: query.sort,
    });
  }

  @Get('receipts/:id')
  find(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.find(user, id);
  }

  @Post('receipts')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReceiptDto) {
    return this.receipts.create(user, dto);
  }

  @Patch('receipts/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateReceiptDto) {
    return this.receipts.update(user, id, dto);
  }

  @Patch('receipts/:id/payments/:paymentId')
  updatePayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateReceiptPaymentDto,
  ) {
    return this.receipts.updatePayment(user, id, paymentId, dto);
  }

  @Delete('receipts/:id/payments/:paymentId')
  removePayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.receipts.removePayment(user, id, paymentId);
  }

  @Delete('receipts/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.remove(user, id);
  }
}
