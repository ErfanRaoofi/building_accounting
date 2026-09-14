import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';
import { ensureUploadDirs, UPLOADS_ROOT } from './common/uploads';
import { ensureBackupDirs } from './backups/paths';

async function bootstrap() {
  await Promise.all([ensureUploadDirs(), ensureBackupDirs()]);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(UPLOADS_ROOT(), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const port = Number(process.env.API_PORT || process.env.PORT || 3000);
  const host = process.env.API_HOST || '127.0.0.1';
  await app.listen(port, host);
  Logger.log(`API running on http://${host}:${port}/api`);
}

bootstrap();
