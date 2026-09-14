import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type PgTarget = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

export function pgBinDir() {
  const fromEnv = process.env.PG_BIN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const portable = join(process.env.LOCALAPPDATA || homedir(), 'pgsql', 'pgsql', 'bin');
  if (existsSync(portable)) {
    return portable;
  }
  return '';
}

export function pgTool(name: 'pg_dump' | 'pg_restore') {
  const dir = pgBinDir();
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return dir ? join(dir, exe) : exe;
}

export function parseDatabaseUrl(raw = process.env.DIRECT_URL || process.env.DATABASE_URL) {
  if (!raw) {
    throw new Error('DATABASE_URL تنظیم نشده است');
  }
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')).split('?')[0];
  if (!database) {
    throw new Error('نام دیتابیس در DATABASE_URL نامعتبر است');
  }
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '5432',
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || ''),
    database,
  } as PgTarget;
}

export function runPg(bin: string, args: string[], password: string) {
  return new Promise<{ code: number; stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, PGPASSWORD: password },
      windowsHide: true,
    });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stderr, stdout }));
  });
}

export function runMigrateDeploy() {
  return runPg('npx', ['prisma', 'migrate', 'deploy', '--schema', './prisma/schema.prisma'], '');
}

export function runMigrateResolveApplied(name: string) {
  return runPg(
    'npx',
    ['prisma', 'migrate', 'resolve', '--applied', name, '--schema', './prisma/schema.prisma'],
    '',
  );
}

export function runFixRolesMigrationSql() {
  const file = join(process.cwd(), 'prisma', 'fix-failed-roles-migration.sql');
  if (!existsSync(file)) {
    return Promise.resolve({ code: 0, stderr: '', stdout: 'skip' });
  }
  return runPg(
    'npx',
    ['prisma', 'db', 'execute', '--schema', './prisma/schema.prisma', '--file', file],
    '',
  );
}

/** Heal schema after restoring an older / partial dump so the app can boot. */
export async function repairSchemaAfterRestore() {
  const fix = await runFixRolesMigrationSql();
  const resolve = await runMigrateResolveApplied('20260914093000_user_roles_signup');
  const deploy = await runMigrateDeploy();
  return { fix, resolve, deploy };
}
