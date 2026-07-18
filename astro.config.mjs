import { defineConfig, passthroughImageService } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://natpakan-site.pages.dev',
  output: 'static',
  adapter: cloudflare(),
  trailingSlash: 'always',
  // Site ships pre-optimized images from public/ and uses no <Image>/astro:assets,
  // so skip the sharp-based image service (avoids loading sharp at build start).
  image: { service: passthroughImageService() },
  experimental: {
    csp: {
      // Astro auto-hashes every inline <script>/<style> it emits.
      // Below only declares sources for resources Astro does not control.
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://media.springernature.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self'",
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
