import type { APIRoute } from 'astro';
import { json, withAdmin } from '@/lib/admin/handler';

export const prerender = false;

export const GET: APIRoute = withAdmin(async ({ email }) => json(200, { email }));
