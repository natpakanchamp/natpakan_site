import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://natpakan-site.netlify.app',
  output: 'static',
  adapter: netlify(),
  trailingSlash: 'always',
});
