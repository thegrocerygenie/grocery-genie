// Checks the built page (dist/index.html) against the MVP brief's copy rules
// (docs/marketing/mvp/design-brief.md, docs/marketing/decisions.md).
// Run after `npm run build`: node tests/page.mjs

import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const text = html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

const failures = [];
const check = (ok, msg) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg); };

const PRIVACY =
  "Receipt photos are sent securely to Anthropic's Claude to read them. Anthropic doesn't use them to train its models. We keep the photo with your receipt until you delete it.";
check(text.split(PRIVACY).length - 1 === 2, 'privacy line appears word for word (trust section + FAQ)');

for (const [re, why] of [
  [/on[- ]device/i, 'no on-device processing claim (decision #4)'],
  [/never (shared|sold)|0 ?kb/i, 'no "never shared/sold" claim (decision #4)'],
  [/unlimited/i, 'never says "unlimited" (decision #3)'],
  [/\d+(\.\d+)?\s?% (accura|faster)|accuracy of/i, 'no accuracy/speed figures (decision #5)'],
  [/brooklyn/i, 'no location in the team line'],
  [/Q3 2026/i, 'no expired launch window'],
  [/android app|google sign|continue with google/i, 'no Android app or Google sign-in promise'],
  [/\$3\.99|\$6\.99|family plan/i, 'no paid-tier prices'],
]) check(!re.test(text), why);

check(/up to 20 receipts a month/.test(text), 'free-tier limit stated in the FAQ');
check(/Coming later/.test(text), 'later-phase features sit under "Coming later"');
check(/<h1 id="headline">/.test(html), 'hero headline has the A/B/C hook');
check(/gg_hl_variant/.test(html), 'sticky headline variant script is inline in the page');

const state = /<body[^>]*data-state="(a|b)"/.exec(html)?.[1];
check(Boolean(state), `body carries the launch state (${state})`);
if (state === 'a') {
  check((html.match(/<form class="waitlist"/g) || []).length === 3, 'State A: three waitlist forms (hero, mid, final)');
  check(!/apple-itunes-app/.test(html), 'State A: no App Store smart banner');
  check(/free year of Premium when it launches/.test(text), 'State A: waitlist incentive line (decision #2)');
  check(/launches on iPhone in Q4 2026/.test(text), 'State A: FAQ gives the Q4 2026 launch window (decision #6)');
} else {
  check(!/<form class="waitlist"/.test(html), 'State B: no waitlist forms');
  check(/name="apple-itunes-app"/.test(html), 'State B: App Store smart banner meta');
  check((html.match(/data-appstore="(hero|mid|final)"/g) || []).length === 3, 'State B: three App Store badges');
  check((html.match(/alt="QR code to the App Store"/g) || []).length === 2, 'State B: QR codes in hero and final only');
  check(!/Premium/.test(text), 'State B: no waitlist Premium offer');
}

console.log('\n', failures.length ? `${failures.length} check(s) failed.` : 'All page checks passed.');
process.exit(failures.length ? 1 : 0);
