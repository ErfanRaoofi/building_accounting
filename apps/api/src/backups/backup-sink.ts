import { createReadStream } from 'fs';
import { stat, unlink } from 'fs/promises';
import { backupFilePath, ensureBackupDirs } from './paths';

export interface BackupSink {
  pathFor(id: string): string;
  ensure(): Promise<void>;
  remove(id: string): Promise<void>;
  sizeOf(id: string): Promise<number>;
}

export class LocalBackupSink implements BackupSink {
  pathFor(id: string) {
    return backupFilePath(id);
  }

  async ensure() {
    await ensureBackupDirs();
  }

  async remove(id: string) {
    await unlink(this.pathFor(id)).catch(() => undefined);
  }

  async sizeOf(id: string) {
    const info = await stat(this.pathFor(id));
    return info.size;
  }

  createReadStream(id: string) {
    return createReadStream(this.pathFor(id));
  }
}
