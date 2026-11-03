// Renders the PNG icons and the Open Graph card from their SVG sources with headless Chromium.
// Run: npm run build:icons   (needs Playwright with Chromium, local or global via NODE_PATH)
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// require() so a global Playwright install (NODE_PATH) works as well as a local one.
const { chromium } = createRequire(import.meta.url)('playwright');

const pub = new URL('../public/', import.meta.url);
const favicon = await readFile(new URL('favicon.svg', pub), 'utf8');
const og = await readFile(new URL('og-image.svg', pub), 'utf8');
const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Bricolage+Grotesque:opsz,wght@12..96,800&display=block">';

// [file, size, tile] — tile=true draws the mark on the paper tile (home-screen / PWA icons must be opaque).
const ICONS = [
  ['favicon-32.png', 32, false],
  ['apple-touch-icon.png', 180, true],
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, tile] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  const inner = tile ? Math.round(size * 0.62) : size; // keeps the mark inside the maskable safe zone
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${tile ? '#F8F6F1' : 'transparent'}">` +
      `<div style="width:${inner}px;height:${inner}px">${favicon.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(file, pub).pathname, omitBackground: !tile });
}
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><head>${FONTS}</head><body style="margin:0">${og.replace('<svg ', '<svg width="1200" height="630" ')}</body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('og-image.png', pub).pathname });
await browser.close();
console.log('Rendered', ICONS.map((i) => i[0]).join(', '), 'and og-image.png');
