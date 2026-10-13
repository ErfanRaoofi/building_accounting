import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, UpdatePaymentDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';
import { MAX_MEDIA_BYTES } from '../common/uploads';

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

  @Post(':id/proof-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_BYTES },
    }),
  )
  uploadProof(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.payments.uploadProof(user, id, file);
  }

  @Delete(':id/proof-image')
  removeProof(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.removeProof(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.remove(user, id);
  }
}
