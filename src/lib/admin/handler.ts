import type { APIContext } from 'astro';
import { verifyAdminRequest } from './auth';
import { AdminConfigError, readAdminEnv, type AdminEnv } from './env';

export interface AdminContext {
  env: AdminEnv;
  email: string;
  context: APIContext;
}

type RawEnv = Record<string, unknown>;
type AdminHandler = (ctx: AdminContext) => Promise<Response>;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export function runtimeEnv(context: Pick<APIContext, 'locals'>): RawEnv {
  const runtime = (context.locals as { runtime?: { env?: RawEnv } }).runtime;
  // .env files only matter for `astro dev`; production secrets come solely from the Cloudflare runtime env.
  const devEnv = import.meta.env.DEV ? (import.meta.env as RawEnv) : {};
  // Playwright runs `astro dev --mode e2e`: use only the dummy .env.e2e values, never real secrets from .dev.vars.
  if (import.meta.env.DEV && import.meta.env.MODE === 'e2e') return devEnv;
  return { ...devEnv, ...(runtime?.env ?? {}) };
}

/**
 * Local-only escape hatch so the admin can be tried with `astro dev` without
 * Cloudflare Access. `isDev` is import.meta.env.DEV, which is the literal
 * `false` in production builds, so this branch cannot run in production.
 */
function devBypassEmail(raw: RawEnv, isDev: boolean): string | null {
  const email = raw.ADMIN_DEV_BYPASS_EMAIL;
  return isDev && typeof email === 'string' && email ? email.toLowerCase() : null;
}

export async function authorizeAdmin(
  request: Request,
  raw: RawEnv,
  isDev: boolean,
): Promise<{ ok: true; env: AdminEnv; email: string } | { ok: false; response: Response }> {
  let env: AdminEnv;
  try {
    env = readAdminEnv(raw);
  } catch (error) {
    if (error instanceof AdminConfigError) {
      console.error('[admin] config:', error.message);
      return { ok: false, response: json(500, { error: 'Admin is not configured', detail: error.message }) };
    }
    throw error;
  }

  const bypass = devBypassEmail(raw, isDev);
  if (bypass) return { ok: true, env, email: bypass };

  const auth = await verifyAdminRequest(request, env.access);
  if (!auth.ok) return { ok: false, response: json(auth.status, { error: 'Unauthorized' }) };
  return { ok: true, env, email: auth.email };
}

/** Wrap an admin API route: config + auth first, uniform JSON errors after. */
export function withAdmin(handler: AdminHandler) {
  return async (context: APIContext): Promise<Response> => {
    const result = await authorizeAdmin(context.request, runtimeEnv(context), import.meta.env.DEV);
    if (!result.ok) return result.response;

    try {
      return await handler({ env: result.env, email: result.email, context });
    } catch (error) {
      console.error('[admin]', context.request.method, new URL(context.request.url).pathname, (error as Error).message);
      return json(502, { error: 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง' });
    }
  };
}
