import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile, unlink } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { legacyUploadAbsolutePath, mediaUrl, mimeFromFilename, storedBytes } from '../common/uploads';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.importLegacyUploads();
  }

  async read(id: string) {
    const image = await this.prisma.storedImage.findUnique({
      where: { id },
      select: { mime: true, data: true },
    });
    if (!image) {
      return null;
    }
    return { mime: image.mime, data: Buffer.from(image.data) };
  }

  private async importLegacyUploads() {
    const buildings = await this.prisma.building.findMany({
      where: { logoUrl: { startsWith: '/uploads/' } },
      select: { id: true, logoUrl: true },
    });
    for (const building of buildings) {
      if (!building.logoUrl) {
        continue;
      }
      await this.importFile(building.logoUrl, async (mime, data) => {
        await this.prisma.$transaction(async (tx) => {
          await tx.storedImage.deleteMany({ where: { buildingId: building.id } });
          const image = await tx.storedImage.create({
            data: { mime, data: storedBytes(data), buildingId: building.id },
          });
          await tx.building.update({
            where: { id: building.id },
            data: { logoUrl: mediaUrl(image.id) },
          });
        });
      });
    }

    const requests = await this.prisma.paymentRequest.findMany({
      where: { imagePath: { startsWith: '/uploads/' } },
      select: { id: true, imagePath: true },
    });
    for (const request of requests) {
      await this.importFile(request.imagePath, async (mime, data) => {
        await this.prisma.$transaction(async (tx) => {
          await tx.storedImage.deleteMany({ where: { paymentRequestId: request.id } });
          const image = await tx.storedImage.create({
            data: { mime, data: storedBytes(data), paymentRequestId: request.id },
          });
          await tx.paymentRequest.update({
            where: { id: request.id },
            data: { imagePath: mediaUrl(image.id) },
          });
        });
      });
    }
  }

  private async importFile(urlPath: string, save: (mime: string, data: Buffer) => Promise<void>) {
    const filePath = legacyUploadAbsolutePath(urlPath);
    const mime = filePath ? mimeFromFilename(filePath) : null;
    if (!filePath || !mime) {
      return;
    }
    let data: Buffer;
    try {
      data = await readFile(filePath);
    } catch {
      this.logger.warn(`فایل تصویر برای انتقال به دیتابیس پیدا نشد: ${urlPath}`);
      return;
    }
    if (!data.length) {
      return;
    }
    await save(mime, data);
    await unlink(filePath).catch(() => undefined);
    this.logger.log(`تصویر به دیتابیس منتقل شد: ${urlPath}`);
  }
}
