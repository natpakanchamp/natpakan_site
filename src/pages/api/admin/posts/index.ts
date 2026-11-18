import type { APIRoute } from 'astro';
import { createGithubClient } from '@/lib/admin/github';
import { json, withAdmin } from '@/lib/admin/handler';
import { postInputSchema } from '@/lib/admin/post-format';
import { createPost } from '@/lib/admin/posts-service';
import { domainErrorResponse, readJson } from '@/lib/admin/route-helpers';

export const prerender = false;

/** File names straight from the repo, so posts committed seconds ago show up before the rebuild finishes. */
export const GET: APIRoute = withAdmin(async ({ env }) => {
  const posts = await createGithubClient(env.github).listPosts();
  return json(200, { posts });
});

export const POST: APIRoute = withAdmin(async ({ env, context }) => {
  const input = await readJson(context.request, postInputSchema);
  if (input instanceof Response) return input;
  try {
    return json(201, await createPost(createGithubClient(env.github), input));
  } catch (error) {
    return domainErrorResponse(error);
  }
});
