import { AwsClient } from 'aws4fetch';
import type { R2Config } from './env';

const MB = 1024 * 1024;
const PRESIGN_TTL_SECONDS = 600;

/** No SVG/HTML: those can carry script when opened directly from the media domain. */
const ALLOWED_TYPES = {
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/png': { kind: 'image', ext: 'png' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'image/gif': { kind: 'image', ext: 'gif' },
  'image/avif': { kind: 'image', ext: 'avif' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/webm': { kind: 'video', ext: 'webm' },
  'video/quicktime': { kind: 'video', ext: 'mov' },
} as const;

const MAX_BYTES = { image: 25 * MB, video: 500 * MB } as const;

export type MediaKind = 'image' | 'video';
export type AllowedContentType = keyof typeof ALLOWED_TYPES;

export interface UploadRequest {
  filename: string;
  contentType: string;
  size: number;
}

export type UploadValidation = { ok: true; kind: MediaKind } | { ok: false; error: string };

export function isAllowedContentType(type: string): type is AllowedContentType {
  return Object.hasOwn(ALLOWED_TYPES, type);
}

export function validateUpload({ filename, contentType, size }: UploadRequest): UploadValidation {
  if (typeof filename !== 'string' || !filename || filename.length > 200) return { ok: false, error: 'ชื่อไฟล์ไม่ถูกต้อง' };
  if (!isAllowedContentType(contentType)) return { ok: false, error: `ไม่รองรับไฟล์ชนิด ${String(contentType)}` };
  if (!Number.isInteger(size) || size <= 0) return { ok: false, error: 'ขนาดไฟล์ไม่ถูกต้อง' };

  const { kind } = ALLOWED_TYPES[contentType];
  if (size > MAX_BYTES[kind]) return { ok: false, error: `ไฟล์ใหญ่เกิน ${MAX_BYTES[kind] / MB}MB` };
  return { ok: true, kind };
}

export function buildObjectKey(filename: string, contentType: AllowedContentType, now: Date, random: string): string {
  const base = filename.replace(/\.[^.]*$/, '');
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `posts/${yyyy}/${mm}/${random}-${safe}.${ALLOWED_TYPES[contentType].ext}`;
}

/** Short-lived URL the browser PUTs the file to directly, so large videos never pass through the Worker. */
export async function presignUpload(
  r2: R2Config,
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = new AwsClient({ accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey, service: 's3', region: 'auto' });
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucket}/${encodedKey}`);
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SECONDS));

  const signed = await client.sign(new Request(url, { method: 'PUT', headers: { 'Content-Type': contentType } }), {
    aws: { signQuery: true, allHeaders: true },
  });

  return { uploadUrl: signed.url, publicUrl: `${r2.publicBaseUrl}/${encodedKey}` };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function mediaSnippet(kind: MediaKind, url: string, alt: string, contentType = 'video/mp4'): string {
  const src = escapeAttr(url);
  if (kind === 'image') return `<img src="${src}" alt="${escapeAttr(alt)}" loading="lazy">`;
  return (
    '<video style="display: block; margin: 0 auto; width: 100%; height: auto;" autoplay loop muted playsinline>\n' +
    `  <source src="${src}" type="${escapeAttr(contentType)}">\n` +
    '</video>'
  );
}
