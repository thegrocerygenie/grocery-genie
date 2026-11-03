// Production replacements for the design prototype's Tweaks panel.
// Launch state, App Store ID and waitlist endpoint come from env (see .env.example).
// Green use is fixed at "CTAs + block" and the accent at #1F7A4A (the prototype defaults).

export type LaunchState = 'a' | 'b';

const rawState = (import.meta.env.PUBLIC_LAUNCH_STATE ?? 'a').toString().toLowerCase();
export const LAUNCH_STATE: LaunchState = rawState === 'b' ? 'b' : 'a';

// TODO(team): set PUBLIC_APP_STORE_ID once the listing exists.
export const APP_ID: string = import.meta.env.PUBLIC_APP_STORE_ID || '0000000000';
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_ID}`;

export const WAITLIST_ENDPOINT: string = import.meta.env.PUBLIC_WAITLIST_ENDPOINT || '';

// Apple's official badge files. Drop them into public/badges/ (Apple Marketing Tools).
// If a file is missing, a labelled dashed placeholder renders instead of a broken image.
export const BADGE = {
  black: '/badges/download-on-the-app-store-black.svg',
  white: '/badges/download-on-the-app-store-white.svg',
};

// Hero headline A/B/C. Visitors get a sticky random variant; ?hl=a|b|c overrides.
export const HEADLINES = {
  a: 'See what your grocery money actually buys.',
  b: 'Your bank sees one total. We see every item.',
  c: 'Know you’re over budget <em>before</em> the month is over.',
} as const;
export type HeadlineKey = keyof typeof HEADLINES;

export const INCLUDED: [icon: string, label: string][] = [
  ['file-image', 'Import photos and PDFs'],
  ['wifi-off', 'Works offline'],
  ['pencil-line', 'Manual entry'],
  ['copy', 'Duplicate-receipt warning'],
  ['circle-alert', 'Catches big-ticket typos'],
  ['tags', '8 automatic categories'],
  ['chart-pie', 'Per-category budgets'],
  ['calendar-days', 'Budget month starts on your payday'],
  ['coins', '11 currencies'],
  ['rotate-ccw', 'Restore deleted receipts for 30 days'],
  ['apple', 'Sign in with Apple'],
  ['accessibility', 'VoiceOver and Dynamic Type'],
];

export const NEXT = ['Price tracking across stores', 'Household sharing', 'Meal planning from what you bought'];

export const PRIVACY_COPY =
  "Receipt photos are sent securely to Anthropic's Claude to read them. Anthropic doesn't use them to train its models. We keep the photo with your receipt until you delete it.";
