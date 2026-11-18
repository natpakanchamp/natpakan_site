import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, withAdmin } from '@/lib/admin/handler';
import { buildObjectKey, isAllowedContentType, mediaSnippet, presignUpload, validateUpload } from '@/lib/admin/media';
import { readJson } from '@/lib/admin/route-helpers';

export const prerender = false;

const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().max(100),
  size: z.number(),
  alt: z.string().max(300).default(''),
});

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Returns a presigned R2 PUT URL; the browser uploads the bytes directly. */
export const POST: APIRoute = withAdmin(async ({ env, context }) => {
  const body = await readJson(context.request, uploadSchema);
  if (body instanceof Response) return body;

  const check = validateUpload(body);
  if (!check.ok) return json(400, { error: check.error });
  if (!isAllowedContentType(body.contentType)) return json(400, { error: 'Unsupported type' });

  const key = buildObjectKey(body.filename, body.contentType, new Date(), randomId());
  const { uploadUrl, publicUrl } = await presignUpload(env.r2, key, body.contentType);
  return json(200, {
    uploadUrl,
    publicUrl,
    contentType: body.contentType,
    snippet: mediaSnippet(check.kind, publicUrl, body.alt, body.contentType),
  });
});
