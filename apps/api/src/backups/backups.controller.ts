import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BackupsService } from './backups.service';
import { RestoreBackupDto, UpdateBackupSettingsDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles, SUPER_ADMIN } from '../common/decorators/roles.decorator';
import { parsePagination } from '../common/pagination';
import { BACKUPS_ROOT, MAX_BACKUP_BYTES } from './paths';

@Controller('backups')
@Roles(SUPER_ADMIN)
export class BackupsController {
  constructor(private backups: BackupsService) {}

  @Get('settings')
  settings() {
    return this.backups.settings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateBackupSettingsDto) {
    return this.backups.updateSettings(dto);
  }

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.backups.list(parsePagination(query));
  }

  @Post()
  create(@CurrentUser() user: AuthUser) {
    return this.backups.createManual(user.id);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: unknown, _file: unknown, cb: (error: Error | null, destination: string) => void) => {
          cb(null, BACKUPS_ROOT());
        },
        filename: (_req: unknown, file: { originalname: string }, cb: (error: Error | null, filename: string) => void) => {
          cb(null, `tmp-${randomUUID()}${extname(file.originalname) || '.dump'}`);
        },
      }),
      limits: { fileSize: MAX_BACKUP_BYTES },
    }),
  )
  upload(
    @UploadedFile()
    file?: { path: string; originalname: string; size: number },
  ) {
    return this.backups.upload(file);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { filename, stream } = await this.backups.download(id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return new StreamableFile(stream);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @Body() dto: RestoreBackupDto) {
    return this.backups.restore(id, dto.confirm);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.backups.remove(id);
  }
}
