import type { PricePoint } from '../types';

/**
 * PI-02 AC 12 (DA-6, D11): item detail and the split screen warn that one
 * item may be several products when its highest like-for-like unit price is
 * at least this many times its lowest.
 */
export const UNIT_PRICE_VARIES_RATIO = 1.5;

/** PI-02 AC 12: the unit price of the like-for-like prices varies a lot. */
export function unitPriceVaries(points: PricePoint[]): boolean {
  const prices = points.filter((p) => p.in_timeline).map((p) => p.unit_price);
  if (prices.length < 2) return false;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low > 0 && high >= low * UNIT_PRICE_VARIES_RATIO;
}

/** PI-02 AC 11, 14: at most this many new items per split, as the server allows. */
export const MAX_SPLITS = 10;

export interface GroupStats {
  count: number;
  /** Mean unit price in the unit and currency most lines are in; null with none. */
  average: number | null;
  currency: string | null;
}

/**
 * PI-02 AC 11: "N purchases · $X avg" for a group of lines on the split
 * screen, averaged like for like as the server does (to the cent).
 */
export function groupStats(points: PricePoint[]): GroupStats {
  if (points.length === 0) return { count: 0, average: null, currency: null };
  const counts = new Map<string, { n: number; first: PricePoint }>();
  for (const p of points) {
    const key = `${p.unit_of_measure ?? ''}|${p.currency}`;
    const entry = counts.get(key);
    if (entry) entry.n += 1;
    else counts.set(key, { n: 1, first: p });
  }
  let best: PricePoint = points[0];
  let bestCount = 0;
  for (const { n, first } of counts.values()) {
    if (n > bestCount) {
      best = first;
      bestCount = n;
    }
  }
  const alike = points.filter(
    (p) => p.unit_of_measure === best.unit_of_measure && p.currency === best.currency,
  );
  const mean = alike.reduce((sum, p) => sum + p.unit_price, 0) / alike.length;
  return {
    count: points.length,
    average: Math.round(mean * 100) / 100,
    currency: best.currency,
  };
}

export interface SplitDraft {
  name: string;
  /** Line item ids picked for this new item. */
  lines: string[];
}

/**
 * PI-02 AC 11: Save is enabled once every new item has a name and a line,
 * and the original keeps at least one of `allLines`.
 */
export function canSaveSplit(allLines: string[], drafts: SplitDraft[]): boolean {
  if (drafts.length === 0) return false;
  if (drafts.some((d) => !d.name.trim() || d.lines.length === 0)) return false;
  const moved = new Set(drafts.flatMap((d) => d.lines));
  return allLines.some((id) => !moved.has(id));
}
