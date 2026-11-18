import { defineMiddleware } from 'astro:middleware';
import { configureFirestore } from '@/lib/firestore';
import { configureIpHashSalt } from '@/lib/rate-limit';

/** Hand the Cloudflare runtime env (secrets) to server-side modules before any API route runs. */
export const onRequest = defineMiddleware((context, next) => {
  const runtime = (context.locals as { runtime?: { env?: Record<string, unknown> } }).runtime;
  // Never hand real secrets (.dev.vars) to server code during E2E runs.
  const isE2e = import.meta.env.DEV && import.meta.env.MODE === 'e2e';
  if (runtime?.env && !isE2e) {
    configureFirestore(runtime.env);
    configureIpHashSalt(runtime.env);
  }
  return next();
});
