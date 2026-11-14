// Files the site reads from the iPhone app at build time, so the web copy can't drift from it.
// The production build runs from a full clone of the monorepo (Cloudflare Workers Builds with
// Path /marketing/), so ../mobile is on disk. If it isn't, the build fails on the import.
//
// privacy.ts imports '@/constants/links' (the app's path alias). MOBILE_ALIASES maps exactly that
// one specifier, nothing wider, so a new React Native or '@/...' import in privacy.ts fails the
// build instead of slipping through. astro.config.mjs and tests/legal-pages.mjs both use it.

import { fileURLToPath } from 'node:url';

const mobile = (path) => fileURLToPath(new URL(`../mobile/src/${path}`, import.meta.url));

export const PRIVACY_TS = mobile('features/settings/content/privacy.ts');

export const MOBILE_ALIASES = {
  '@/constants/links': mobile('constants/links.ts'),
};
