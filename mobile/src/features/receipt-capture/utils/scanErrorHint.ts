import { ApiError } from '@/services/api';

const FALLBACK = 'Couldn’t read that — try again';

/** One wording per photo problem, before capture (frame check) and after (server). */
export const QUALITY_HINTS = {
  blurry: 'Image looks blurry — hold steady',
  dark: 'Too dark — find more light',
  bright: 'Too much glare — tilt the receipt',
} as const;

/**
 * RC-01 AC 2: turn the backend's rejection reason into a hint the user can act
 * on before retaking. Patterns match the 422 details from
 * backend/app/image/preprocessor.py and backend/app/api/routes/receipts.py;
 * the first issue the server lists wins.
 */
const HINTS: [RegExp, string][] = [
  [/blurry/i, QUALITY_HINTS.blurry],
  [/too dark/i, QUALITY_HINTS.dark],
  [/too bright/i, QUALITY_HINTS.bright],
  [/appear to be a receipt/i, 'That doesn’t look like a receipt'],
];

export function scanErrorHint(error: unknown): string {
  if (!(error instanceof ApiError) || error.status !== 422) return FALLBACK;
  const detail = (error.data as { detail?: unknown } | null)?.detail;
  if (typeof detail !== 'string') return FALLBACK;

  let best: { at: number; hint: string } | null = null;
  for (const [pattern, hint] of HINTS) {
    const at = detail.search(pattern);
    if (at >= 0 && (best === null || at < best.at)) best = { at, hint };
  }
  return best?.hint ?? FALLBACK;
}
