import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, UpdatePaymentDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('buildingId') buildingId: string,
    @Query('fiscalYearId') fiscalYearId: string,
    @Query('categoryId') categoryId?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.payments.list(user, buildingId, fiscalYearId, parsePagination(query), categoryId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.payments.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.payments.update(user, id, dto);
  }
}
