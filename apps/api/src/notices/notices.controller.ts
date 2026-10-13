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
import { NoticeBillStatus, NoticeKind } from '@prisma/client';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';
import { MAX_MEDIA_BYTES } from '../common/uploads';
import { CreateNoticeDto, UpdateNoticeDto } from './dto';
import { NoticesService } from './notices.service';

@Controller('notices')
export class NoticesController {
  constructor(private notices: NoticesService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.notices.summary(user, query.buildingId, query.fiscalYearId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const billStatus = query.billStatus === 'UNPAID' || query.billStatus === 'PAID' ? (query.billStatus as NoticeBillStatus) : undefined;
    return this.notices.list(
      user,
      {
        buildingId: query.buildingId,
        fiscalYearId: query.fiscalYearId,
        kind: query.kind === 'NOTICE' || query.kind === 'BILL' ? (query.kind as NoticeKind) : undefined,
        billStatus,
      },
      parsePagination(query),
    );
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_BYTES },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNoticeDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.notices.create(user, dto, file);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateNoticeDto) {
    return this.notices.update(user, id, dto);
  }

  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_BYTES },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.notices.uploadImage(user, id, file);
  }

  @Delete(':id/image')
  removeImage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notices.removeImage(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notices.remove(user, id);
  }
}
