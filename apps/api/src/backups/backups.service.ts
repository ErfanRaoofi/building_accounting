import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { BackupKind, BackupStatus } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { rename, stat, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { toJalali } from '../common/jalali';
import { paginateQuery, type Pagination } from '../common/pagination';
import { LocalBackupSink, type BackupSink } from './backup-sink';
import { parseDatabaseUrl, pgTool, runPg } from './pg';
import { ensureBackupDirs, MAX_BACKUP_BYTES } from './paths';

const SETTINGS_ID = 'default';

@Injectable()
export class BackupsService implements OnModuleInit {
  private busy = false;
  private sink: BackupSink = new LocalBackupSink();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await ensureBackupDirs();
    await this.prisma.backupSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  async list(pagination: Pagination) {
    const where = {};
    const result = await paginateQuery(
      pagination,
      () => this.prisma.backup.count({ where }),
      (skip, take) =>
        this.prisma.backup.findMany({
          where,
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
      () =>
        this.prisma.backup.findMany({
          where,
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        }),
    );
    return result;
  }

  async settings() {
    return this.prisma.backupSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  async updateSettings(dto: {
    enabled?: boolean;
    frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    hour?: number;
    keepLast?: number;
  }) {
    return this.prisma.backupSettings.upsert({
      where: { id: SETTINGS_ID },
      update: dto,
      create: { id: SETTINGS_ID, ...dto },
    });
  }

  async createManual(userId: string) {
    return this.createBackup(BackupKind.MANUAL, userId);
  }

  async createScheduled() {
    return this.createBackup(BackupKind.SCHEDULED, null);
  }

  async upload(file?: { path: string; originalname: string; size: number }) {
    return this.withLock(async () => {
      try {
        if (!file?.path) {
          throw new BadRequestException('فایل بک‌آپ را انتخاب کنید');
        }
        if (file.size > MAX_BACKUP_BYTES) {
          throw new BadRequestException('حجم فایل بک‌آپ بیش از حد مجاز است');
        }
        const name = (file.originalname || '').toLowerCase();
        if (!name.endsWith('.dump') && !name.endsWith('.backup')) {
          throw new BadRequestException('فقط فایل dump یا backup پذیرفته می‌شود');
        }
        const id = randomUUID();
        const filename = this.safeFilename(file.originalname) || this.dumpFilename(new Date());
        await this.sink.ensure();
        await rename(file.path, this.sink.pathFor(id));
        const sizeBytes = (await stat(this.sink.pathFor(id))).size;
        return this.prisma.backup.create({
          data: {
            id,
            filename,
            sizeBytes,
            kind: BackupKind.UPLOAD,
            status: BackupStatus.READY,
          },
          include: { createdBy: { select: { id: true, name: true } } },
        });
      } catch (err) {
        if (file?.path) {
          await unlink(file.path).catch(() => undefined);
        }
        throw err;
      }
    });
  }

  async download(id: string) {
    const row = await this.getReady(id);
    return {
      filename: row.filename,
      stream: createReadStream(this.sink.pathFor(id)),
    };
  }

  async remove(id: string) {
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('بک‌آپ یافت نشد');
    }
    await this.sink.remove(id);
    await this.prisma.backup.delete({ where: { id } });
    return { ok: true };
  }

  async restore(id: string, confirm: string) {
    if (confirm !== 'RESTORE') {
      throw new BadRequestException('برای بازیابی باید تأیید صریح ارسال شود');
    }
    const row = await this.getReady(id);
    return this.withLock(async () => {
      const db = parseDatabaseUrl();
      await this.prisma.$disconnect();
      try {
        const result = await runPg(
          pgTool('pg_restore'),
          [
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-acl',
            '-h',
            db.host,
            '-p',
            db.port,
            '-U',
            db.user,
            '-d',
            db.database,
            this.sink.pathFor(row.id),
          ],
          db.password,
        );
        if (result.code > 1) {
          throw new BadRequestException(result.stderr.trim() || 'بازیابی ناموفق بود');
        }
      } finally {
        await this.prisma.$connect();
      }
      return { ok: true };
    });
  }

  async dueNow() {
    const settings = await this.settings();
    if (!settings.enabled) {
      return false;
    }
    const now = tehranParts(new Date());
    if (now.hour !== settings.hour) {
      return false;
    }
    const last = await this.prisma.backup.findFirst({
      where: { kind: BackupKind.SCHEDULED, status: BackupStatus.READY },
      orderBy: { createdAt: 'desc' },
    });
    if (last) {
      const prev = tehranParts(last.createdAt);
      if (prev.year === now.year && prev.month === now.month && prev.day === now.day && prev.hour === now.hour) {
        return false;
      }
    }
    if (settings.frequency === 'DAILY') {
      return true;
    }
    if (settings.frequency === 'WEEKLY') {
      return now.weekday === 6;
    }
    return now.day === 1;
  }

  async pruneScheduled() {
    const settings = await this.settings();
    const keep = Math.max(1, settings.keepLast);
    const extras = await this.prisma.backup.findMany({
      where: { kind: BackupKind.SCHEDULED, status: BackupStatus.READY },
      orderBy: { createdAt: 'desc' },
      skip: keep,
    });
    for (const row of extras) {
      await this.sink.remove(row.id);
      await this.prisma.backup.delete({ where: { id: row.id } });
    }
  }

  private async createBackup(kind: BackupKind, userId: string | null) {
    return this.withLock(async () => {
      const id = randomUUID();
      const filename = this.dumpFilename(new Date());
      await this.sink.ensure();
      const db = parseDatabaseUrl();
      let saved = false;
      try {
        const result = await runPg(
          pgTool('pg_dump'),
          ['-Fc', '-Z', '6', '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '-f', this.sink.pathFor(id)],
          db.password,
        );
        if (result.code !== 0) {
          throw new BadRequestException(result.stderr.trim() || 'تهیه بک‌آپ ناموفق بود');
        }
        const sizeBytes = await this.sink.sizeOf(id);
        if (!sizeBytes) {
          throw new BadRequestException('فایل بک‌آپ خالی است');
        }
        const row = await this.prisma.backup.create({
          data: {
            id,
            filename,
            sizeBytes,
            kind,
            status: BackupStatus.READY,
            createdById: userId || undefined,
          },
          include: { createdBy: { select: { id: true, name: true } } },
        });
        saved = true;
        if (kind === BackupKind.SCHEDULED) {
          await this.pruneScheduled();
        }
        return row;
      } catch (err) {
        if (!saved) {
          await this.sink.remove(id);
          await this.prisma.backup.create({
            data: {
              id,
              filename,
              sizeBytes: 0,
              kind,
              status: BackupStatus.FAILED,
              createdById: userId || undefined,
            },
          });
        }
        throw err;
      }
    });
  }

  private async getReady(id: string) {
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('بک‌آپ یافت نشد');
    }
    if (row.status !== BackupStatus.READY) {
      throw new BadRequestException('این بک‌آپ قابل استفاده نیست');
    }
    if (!existsSync(this.sink.pathFor(id))) {
      throw new BadRequestException('فایل بک‌آپ روی سرور یافت نشد');
    }
    return row;
  }

  private async withLock<T>(fn: () => Promise<T>) {
    if (this.busy) {
      throw new ConflictException('عملیات بک‌آپ دیگری در جریان است');
    }
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  private dumpFilename(date: Date) {
    const j = toJalali(date);
    const pad = (n: number) => String(n).padStart(2, '0');
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    return `mehr-${j.jy}-${pad(j.jm)}-${pad(j.jd)}-${h}${m}.dump`;
  }

  private safeFilename(raw: string) {
    const base = raw.replace(/^.*[\\/]/, '').replace(/[^\w.\u0600-\u06FF-]+/g, '_');
    return base.length > 3 ? base : '';
  }
}

function tehranParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    weekday: weekdayMap[value('weekday')] ?? 0,
  };
}
