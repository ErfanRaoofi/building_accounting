import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupsScheduler } from './backups.scheduler';
import { BackupsService } from './backups.service';

@Module({
  controllers: [BackupsController],
  providers: [BackupsService, BackupsScheduler],
})
export class BackupsModule {}
