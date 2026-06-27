import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://natpakan-site.pages.dev',
  output: 'static',
  adapter: cloudflare(),
  trailingSlash: 'always',
});
