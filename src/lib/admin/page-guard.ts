import type { AstroGlobal } from 'astro';
import { authorizeAdmin, runtimeEnv } from './handler';

export type PageGuardResult = { ok: true; email: string } | { ok: false; status: number; message: string };

/** Server-side gate for admin pages; Cloudflare Access is the first gate, this is the second. */
export async function guardAdminPage(Astro: AstroGlobal): Promise<PageGuardResult> {
  const result = await authorizeAdmin(Astro.request, runtimeEnv(Astro), import.meta.env.DEV);
  Astro.response.headers.set('Cache-Control', 'no-store');
  if (result.ok) return { ok: true, email: result.email };

  const status = result.response.status;
  const body = (await result.response.json()) as { detail?: string };
  Astro.response.status = status;
  const message = status === 500 ? `ยังตั้งค่า admin ไม่ครบ — ${body.detail ?? ''}` : 'ไม่มีสิทธิ์เข้าหน้านี้';
  return { ok: false, status, message };
}
