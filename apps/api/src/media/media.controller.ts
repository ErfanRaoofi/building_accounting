import { Controller, Get, Header, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private media: MediaService) {}

  @Public()
  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async get(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const image = await this.media.read(id);
    if (!image) {
      throw new NotFoundException('تصویر یافت نشد');
    }
    res.setHeader('Content-Type', image.mime);
    res.setHeader('Content-Length', image.data.length);
    res.setHeader('Content-Disposition', 'inline');
    return new StreamableFile(image.data);
  }
}
