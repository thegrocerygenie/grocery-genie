// Checks the built /privacy and /support pages (dist/privacy.html, dist/support.html).
// /privacy must carry the app's privacy.ts text word for word, so the site and Settings → Privacy
// can't drift (launch-open-items §1). privacy.ts is loaded here straight from ../mobile, with the
// same alias the build uses (mobile-sources.mjs), and compared with what the build rendered.
// Run after `npm run build`: node tests/legal-pages.mjs

import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { MOBILE_ALIASES, PRIVACY_TS } from '../mobile-sources.mjs';

registerHooks({
  resolve(specifier, context, next) {
    const path = MOBILE_ALIASES[specifier];
    return path ? { url: pathToFileURL(path).href, shortCircuit: true } : next(specifier, context);
  },
});
const { PRIVACY_POLICY } = await import(pathToFileURL(PRIVACY_TS).href);
const { PRIVACY_EMAIL } = await import(pathToFileURL(MOBILE_ALIASES['@/constants/links']).href);

const toText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const load = async (name) => {
  const html = await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8');
  return { html, text: toText(html) };
};

const failures = [];
const check = (ok, msg) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg); };

const headChecks = (html, path, title) => {
  check(new RegExp(`<title>${title}</title>`).test(html), `${path}: <title> is "${title}"`);
  check(html.includes(`<link rel="canonical" href="https://grocerygenie.app${path}">`), `${path}: canonical URL`);
  check(html.includes(`<meta property="og:url" content="https://grocerygenie.app${path}">`), `${path}: og:url`);
  check(/<meta name="description" content="[^"]+">/.test(html), `${path}: meta description`);
  check(/<meta property="og:image" content="https:\/\/grocerygenie\.app\/og-image\.png">/.test(html), `${path}: og:image`);
  check(/<footer>[\s\S]*href="\/privacy"[\s\S]*href="\/support"[\s\S]*<\/footer>/.test(html), `${path}: footer links to /privacy and /support`);
};

// /privacy
{
  const { html, text } = await load('privacy.html');
  console.log('privacy.html');
  headChecks(html, '/privacy', 'Privacy policy — Grocery Genie');
  check(text.includes(`Effective ${PRIVACY_POLICY.effective} · Last updated ${PRIVACY_POLICY.updated}`), 'effective and updated dates from privacy.ts');
  check(PRIVACY_POLICY.sections.length > 0, `privacy.ts has sections (${PRIVACY_POLICY.sections.length})`);
  const headings = [...html.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((m) => toText(m[1]).trim());
  check(JSON.stringify(headings) === JSON.stringify(PRIVACY_POLICY.sections.map((s) => s.heading)),
    'every privacy.ts heading, in order, and no others');
  const missing = PRIVACY_POLICY.sections.flatMap((s) => s.paragraphs).filter((p) => !text.includes(p));
  check(missing.length === 0, `every privacy.ts paragraph appears word for word${missing.length ? ` (missing: ${missing.map((p) => p.slice(0, 40)).join(' | ')})` : ''}`);
  check(text.includes(PRIVACY_EMAIL), `privacy address from links.ts (${PRIVACY_EMAIL})`);
  const draft = /class="doc-draft"[^>]*>Draft · pending legal review</.test(html);
  if (PRIVACY_POLICY.reviewed) check(!draft, 'reviewed: true, so no draft notice');
  else check(draft, 'reviewed: false, so the app\'s draft notice "Draft · pending legal review" shows');
}

// /support
{
  const { html, text } = await load('support.html');
  console.log('support.html');
  headChecks(html, '/support', 'Support — Grocery Genie');
  check(html.includes('href="mailto:support@grocerygenie.app"'), 'support email link');
  check(html.includes(`href="mailto:${PRIVACY_EMAIL}"`), `privacy email link matches links.ts (${PRIVACY_EMAIL})`);
  check(html.includes('href="/privacy"'), 'links to the privacy policy');
  // toText() turns tags into spaces, so check the raw HTML for words run into a link.
  check(!/[A-Za-z]<a [^>]*href="mailto:/.test(html), 'a space before each email link (no "emailprivacy@...")');
  check(/tap the gear at the top right of the Budget tab/.test(text), 'says where Settings is (gear on the Budget tab)');
  check(/Scroll to the bottom and tap Delete account/.test(text) && /tap Delete account again to confirm/.test(text),
    'account deletion path matches app/settings (Delete account, then the confirm alert)');
  check(/Settings → Recently deleted for 30 days/.test(text), 'restore window matches the app (30 days)');
  for (const [re, why] of [
    [/on[- ]device/i, 'no on-device processing claim (decision #4)'],
    [/never (shared|sold)|0 ?kb/i, 'no "never shared/sold" claim (decision #4)'],
    [/unlimited/i, 'never says "unlimited" (decision #3)'],
    [/\d+(\.\d+)?\s?% (accura|faster)|accuracy of/i, 'no accuracy/speed figures (decision #5)'],
    [/android app|google sign|continue with google/i, 'no Android app or Google sign-in promise'],
    [/\$\d/, 'no prices'],
  ]) check(!re.test(text), `support: ${why}`);
}

// sitemap
{
  const xml = await readFile(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  console.log('sitemap.xml');
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  for (const loc of ['https://grocerygenie.app/', 'https://grocerygenie.app/privacy', 'https://grocerygenie.app/support']) {
    check(urls.some((u) => u.includes(`<loc>${loc}</loc>`)), `sitemap lists ${loc}`);
  }
  check(urls.length > 0 && urls.every((u) => /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(u)), 'every sitemap entry has a lastmod');
}

console.log('\n', failures.length ? `${failures.length} check(s) failed.` : 'All legal-page checks passed.');
process.exit(failures.length ? 1 : 0);
