import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createGithubClient } from '@/lib/admin/github';
import { json, withAdmin, type AdminContext } from '@/lib/admin/handler';
import { isValidPostFileName, postInputSchema } from '@/lib/admin/post-format';
import { loadPost, removePost, updatePost } from '@/lib/admin/posts-service';
import { domainErrorResponse, readJson } from '@/lib/admin/route-helpers';

export const prerender = false;

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/, 'invalid sha');
const updateSchema = postInputSchema.extend({ sha: shaSchema });
const deleteSchema = z.object({ sha: shaSchema });

/** URL carries the file stem (".../posts/2025-10-28-x/"); the repo file is "<stem>.md". */
function postName({ context }: AdminContext): string | Response {
  const name = `${context.params.name ?? ''}.md`;
  return isValidPostFileName(name) ? name : json(400, { error: 'Invalid post name' });
}

export const GET: APIRoute = withAdmin(async (ctx) => {
  const name = postName(ctx);
  if (name instanceof Response) return name;
  try {
    const post = await loadPost(createGithubClient(ctx.env.github), name);
    return json(200, post);
  } catch (error) {
    return domainErrorResponse(error);
  }
});

export const PUT: APIRoute = withAdmin(async (ctx) => {
  const name = postName(ctx);
  if (name instanceof Response) return name;
  const body = await readJson(ctx.context.request, updateSchema);
  if (body instanceof Response) return body;
  const { sha, ...input } = body;
  try {
    return json(200, await updatePost(createGithubClient(ctx.env.github), name, sha, input));
  } catch (error) {
    return domainErrorResponse(error);
  }
});

export const DELETE: APIRoute = withAdmin(async (ctx) => {
  const name = postName(ctx);
  if (name instanceof Response) return name;
  const body = await readJson(ctx.context.request, deleteSchema);
  if (body instanceof Response) return body;
  try {
    return json(200, await removePost(createGithubClient(ctx.env.github), name, body.sha));
  } catch (error) {
    return domainErrorResponse(error);
  }
});
