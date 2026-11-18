import { readFileSync } from 'node:fs';
import { defineConfig, passthroughImageService } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

/** A `KEY = "value"` entry from wrangler.toml, the single source of plain-text vars. */
function wranglerVar(key) {
  try {
    const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
    return toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1] ?? '';
  } catch {
    return '';
  }
}

// Public origin of the R2 media bucket, allowed by the CSP. Env overrides wrangler.toml.
const MEDIA_ORIGIN = (() => {
  const raw = process.env.MEDIA_PUBLIC_BASE_URL || wranglerVar('MEDIA_PUBLIC_BASE_URL');
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`MEDIA_PUBLIC_BASE_URL is not a valid URL: ${raw}`);
  }
})();
// Presigned uploads go to this account's S3 endpoint only (not every R2 account).
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || wranglerVar('R2_ACCOUNT_ID');
const R2_UPLOAD_ORIGIN = R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '';

export default defineConfig({
  site: 'https://natpakan-site.pages.dev',
  output: 'static',
  adapter: cloudflare(),
  trailingSlash: 'always',
  // The dev toolbar overlaps the editor's fixed action bar on phone widths during Playwright runs.
  devToolbar: { enabled: process.env.E2E !== '1' },
  // Site ships pre-optimized images from public/ and uses no <Image>/astro:assets,
  // so skip the sharp-based image service (avoids loading sharp at build start).
  image: { service: passthroughImageService() },
  experimental: {
    csp: {
      // Astro auto-hashes every inline <script>/<style> it emits.
      // Below only declares sources for resources Astro does not control.
      directives: [
        "default-src 'self'",
        `img-src 'self' data: https://media.springernature.com ${MEDIA_ORIGIN}`.trim(),
        `media-src 'self' ${MEDIA_ORIGIN}`.trim(),
        "font-src 'self' https://fonts.gstatic.com",
        // R2 upload origin is only reachable via presigned URLs issued to the authenticated admin.
        `connect-src 'self' ${R2_UPLOAD_ORIGIN}`.trim(),
        "frame-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
      ],
      styleDirective: {
        // Google Fonts stylesheet + inline style attributes in content.
        resources: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      },
      scriptDirective: {
        resources: ["'self'"],
      },
    },
  },
});
