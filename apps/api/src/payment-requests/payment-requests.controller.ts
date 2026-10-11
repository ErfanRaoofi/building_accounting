import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PaymentRequestStatus } from '@prisma/client';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';
import { MAX_PAYMENT_REQUEST_IMAGE_BYTES } from '../common/uploads';
import { CreatePaymentRequestDto, RejectPaymentRequestDto } from './dto';
import { PaymentRequestsService } from './payment-requests.service';

@Controller('payment-requests')
export class PaymentRequestsController {
  constructor(private paymentRequests: PaymentRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.paymentRequests.list(
      user,
      {
        buildingId: query.buildingId,
        fiscalYearId: query.fiscalYearId,
        unitId: query.unitId,
        status: query.status as PaymentRequestStatus | undefined,
      },
      parsePagination(query),
    );
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PAYMENT_REQUEST_IMAGE_BYTES },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentRequestDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.paymentRequests.create(user, dto, file);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentRequests.approve(user, id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectPaymentRequestDto) {
    return this.paymentRequests.reject(user, id, dto);
  }
}
