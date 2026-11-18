import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createGithubClient } from '@/lib/admin/github';
import { json, withAdmin } from '@/lib/admin/handler';
import { domainErrorResponse, readJson } from '@/lib/admin/route-helpers';
import { loadSeasons, saveSeasons, seasonsInputSchema, type SeasonsInput } from '@/lib/admin/seasons-service';

export const prerender = false;

const updateSchema = z.object({
  seasons: seasonsInputSchema,
  /** Omitted only when the file does not exist yet. */
  sha: z.string().regex(/^[0-9a-f]{40}$/).optional(),
});

export const GET: APIRoute = withAdmin(async ({ env }) => json(200, await loadSeasons(createGithubClient(env.github))));

export const PUT: APIRoute = withAdmin(async ({ env, context }) => {
  const body = await readJson(context.request, updateSchema);
  if (body instanceof Response) return body;
  try {
    return json(200, await saveSeasons(createGithubClient(env.github), body.seasons as SeasonsInput, body.sha));
  } catch (error) {
    return domainErrorResponse(error);
  }
});
