import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles, SUPER_ADMIN } from '../common/decorators/roles.decorator';
import { parsePagination } from '../common/pagination';
import { CreatePurchaseInquiryDto } from './dto';
import { PurchaseInquiriesService } from './purchase-inquiries.service';

@Controller('purchase-inquiries')
export class PurchaseInquiriesController {
  constructor(private inquiries: PurchaseInquiriesService) {}

  @Public()
  @Post()
  create(@Body() dto: CreatePurchaseInquiryDto) {
    return this.inquiries.create(dto);
  }

  @Roles(SUPER_ADMIN)
  @Get()
  list(@Query() query: Record<string, string>) {
    return this.inquiries.list(parsePagination(query));
  }
}
