import { mkdir } from 'fs/promises';
import { join } from 'path';

export const BACKUPS_ROOT = () => join(process.cwd(), 'data', 'backups');
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export function backupFilePath(id: string) {
  return join(BACKUPS_ROOT(), `${id}.dump`);
}

export async function ensureBackupDirs() {
  await mkdir(BACKUPS_ROOT(), { recursive: true });
}
