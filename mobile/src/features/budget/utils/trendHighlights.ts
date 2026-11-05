import { percentChange } from './monthOverMonth';

export interface TrendHighlightMonth {
  period: string;
  total: number;
}

export type TrendDirection = 'rising' | 'falling' | 'steady';

export interface TrendHighlights {
  highest: TrendHighlightMonth | null;
  /** None when no finished month of the range had spending. */
  lowest: TrendHighlightMonth | null;
  trend: { direction: TrendDirection; change: number } | null;
}

/** A change smaller than this, either way, reads "Steady". */
export const STEADY_PERCENT = 5;

function average(months: TrendHighlightMonth[]): number {
  return months.reduce((sum, m) => sum + m.total, 0) / Math.max(months.length, 1);
}

interface HighlightOptions {
  /** The headline's change against the months before; null when it has none. */
  change: number | null;
  /** The month still in progress, left out of Lowest. */
  currentPeriod: string;
  /** All: compare the later half of the range with the earlier half. */
  halves: boolean;
}

/**
 * BC-04 AC 8: the Trend screen's Highlights. Highest is a month of the range
 * (the earlier on a tie). Lowest skips months with no spending and the current
 * month, which is not over yet; none may qualify. Trend is the headline's
 * change, so the two always agree, and none when the headline has none. All
 * has no headline change (nothing comes before the first receipt), so its
 * Trend is the later half of the range against the earlier half (an odd
 * middle month left out).
 */
export function buildTrendHighlights(
  months: TrendHighlightMonth[],
  { change, currentPeriod, halves }: HighlightOptions,
): TrendHighlights {
  if (months.length === 0) return { highest: null, lowest: null, trend: null };

  let highest = months[0];
  for (const m of months) {
    if (m.total > highest.total) highest = m;
  }

  let lowest: TrendHighlightMonth | null = null;
  for (const m of months) {
    if (m.total <= 0 || m.period === currentPeriod) continue;
    if (lowest === null || m.total < lowest.total) lowest = m;
  }

  let trendChange = halves ? null : change;
  if (halves && months.length >= 2) {
    const half = Math.floor(months.length / 2);
    trendChange = percentChange(
      average(months.slice(months.length - half)),
      average(months.slice(0, half)),
    );
  }

  let direction: TrendDirection = 'steady';
  if (trendChange !== null && Math.abs(trendChange) >= STEADY_PERCENT) {
    direction = trendChange > 0 ? 'rising' : 'falling';
  }

  return {
    highest: { period: highest.period, total: highest.total },
    lowest: lowest ? { period: lowest.period, total: lowest.total } : null,
    trend: trendChange === null ? null : { direction, change: trendChange },
  };
}
