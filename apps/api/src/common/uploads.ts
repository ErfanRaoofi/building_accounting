import { mkdir } from 'fs/promises';
import { join } from 'path';

export const UPLOADS_ROOT = () => join(process.cwd(), 'uploads');
export const LOGOS_DIR = () => join(UPLOADS_ROOT(), 'logos');
export const PAYMENT_REQUESTS_DIR = () => join(UPLOADS_ROOT(), 'payment-requests');
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_PAYMENT_REQUEST_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function logoExtension(mimetype: string) {
  return MIME_EXT[mimetype];
}

export function imageExtension(mimetype: string) {
  return MIME_EXT[mimetype];
}

export function mediaUrl(id: string) {
  return `/api/media/${id}`;
}

export async function ensureUploadDirs() {
  await mkdir(LOGOS_DIR(), { recursive: true });
  await mkdir(PAYMENT_REQUESTS_DIR(), { recursive: true });
}

export function storedBytes(buffer: Buffer) {
  return Uint8Array.from(buffer);
}

export function assertStoredImage(file: { buffer: Buffer; mimetype: string }) {
  const ext = imageExtension(file.mimetype);
  if (!ext) {
    throw new Error('invalid-type');
  }
  if (ext === 'png' && !isPng(file.buffer)) {
    throw new Error('invalid-png');
  }
}

export function legacyUploadAbsolutePath(urlPath: string) {
  const path = urlPath.split('?')[0];
  if (path.startsWith('/uploads/logos/')) {
    const filename = path.slice('/uploads/logos/'.length);
    return safeFilename(filename) ? join(LOGOS_DIR(), filename) : null;
  }
  if (path.startsWith('/uploads/payment-requests/')) {
    const filename = path.slice('/uploads/payment-requests/'.length);
    return safeFilename(filename) ? join(PAYMENT_REQUESTS_DIR(), filename) : null;
  }
  return null;
}

export function mimeFromFilename(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXT_MIME[ext] || null;
}

function safeFilename(name: string) {
  return !!name && !name.includes('/') && !name.includes('\\') && !name.includes('..');
}

function isPng(buffer: Buffer) {
  return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
}
