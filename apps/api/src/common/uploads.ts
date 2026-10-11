import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const UPLOADS_ROOT = () => join(process.cwd(), 'uploads');
export const LOGOS_DIR = () => join(UPLOADS_ROOT(), 'logos');
export const PAYMENT_REQUESTS_DIR = () => join(UPLOADS_ROOT(), 'payment-requests');
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_PAYMENT_REQUEST_IMAGE_BYTES = 2 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function logoExtension(mimetype: string) {
  return MIME_EXT[mimetype];
}

export function imageExtension(mimetype: string) {
  return MIME_EXT[mimetype];
}

export async function ensureUploadDirs() {
  await mkdir(LOGOS_DIR(), { recursive: true });
  await mkdir(PAYMENT_REQUESTS_DIR(), { recursive: true });
}

function isPng(buffer: Buffer) {
  return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
}

export async function saveBuildingLogo(buildingId: string, file: { buffer: Buffer; mimetype: string }) {
  const ext = logoExtension(file.mimetype);
  if (!ext) {
    throw new Error('invalid-type');
  }
  if (ext === 'png' && !isPng(file.buffer)) {
    throw new Error('invalid-png');
  }
  await ensureUploadDirs();
  await removeBuildingLogoFiles(buildingId);
  const filename = `${buildingId}.${ext}`;
  await writeFile(join(LOGOS_DIR(), filename), file.buffer);
  return `/uploads/logos/${filename}`;
}

export async function removeBuildingLogoFiles(buildingId: string) {
  await Promise.all(
    Object.values(MIME_EXT).map((ext) => unlink(join(LOGOS_DIR(), `${buildingId}.${ext}`)).catch(() => undefined)),
  );
}

export async function savePaymentRequestImage(file: { buffer: Buffer; mimetype: string }) {
  const ext = imageExtension(file.mimetype);
  if (!ext) {
    throw new Error('invalid-type');
  }
  if (ext === 'png' && !isPng(file.buffer)) {
    throw new Error('invalid-png');
  }
  await ensureUploadDirs();
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(join(PAYMENT_REQUESTS_DIR(), filename), file.buffer);
  return `/uploads/payment-requests/${filename}`;
}

export async function removePaymentRequestImage(imagePath: string) {
  if (!imagePath.startsWith('/uploads/payment-requests/')) {
    return;
  }
  const filename = imagePath.slice('/uploads/payment-requests/'.length);
  if (!filename || filename.includes('/') || filename.includes('..')) {
    return;
  }
  await unlink(join(PAYMENT_REQUESTS_DIR(), filename)).catch(() => undefined);
}
