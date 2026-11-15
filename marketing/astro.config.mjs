import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { MOBILE_ALIASES } from './mobile-sources.mjs';

export default defineConfig({
  integrations: [react()],
  // dist/privacy.html, not dist/privacy/index.html: Cloudflare, Netlify and Vercel (cleanUrls)
  // then serve it at /privacy, the canonical URL, with no redirect to /privacy/.
  build: { format: 'file' },
  vite: {
    // Transform every file, ../mobile included, with this tsconfig. Without it Vite reads
    // mobile/tsconfig.json, which extends expo/tsconfig.base from mobile/node_modules, and the
    // site build doesn't install the app's dependencies.
    tsconfig: './tsconfig.json',
    resolve: {
      // Exact-match aliases for the app files /privacy imports (see mobile-sources.mjs).
      alias: Object.entries(MOBILE_ALIASES).map(([spec, path]) => ({
        find: new RegExp(`^${spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`),
        replacement: path,
      })),
    },
  },
});
