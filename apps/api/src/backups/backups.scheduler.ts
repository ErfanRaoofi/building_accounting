import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupsService } from './backups.service';

@Injectable()
export class BackupsScheduler {
  private log = new Logger(BackupsScheduler.name);

  constructor(private backups: BackupsService) {}

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Tehran' })
  async tick() {
    try {
      if (!(await this.backups.dueNow())) {
        return;
      }
      await this.backups.createScheduled();
      this.log.log('Scheduled backup created');
    } catch (err) {
      this.log.error(err instanceof Error ? err.message : err);
    }
  }
}
