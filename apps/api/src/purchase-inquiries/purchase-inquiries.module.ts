import { Module } from '@nestjs/common';
import { PurchaseInquiriesController } from './purchase-inquiries.controller';
import { PurchaseInquiriesService } from './purchase-inquiries.service';

@Module({
  controllers: [PurchaseInquiriesController],
  providers: [PurchaseInquiriesService],
})
export class PurchaseInquiriesModule {}
