import { percentChange } from './monthOverMonth';

export interface TrendHighlightMonth {
  period: string;
  total: number;
}

export type TrendDirection = 'rising' | 'falling' | 'steady';

export interface TrendHighlights {
  highest: TrendHighlightMonth | null;
  /** `inProgress`: the lowest month is the current one, not yet over. */
  lowest: (TrendHighlightMonth & { inProgress: boolean }) | null;
  trend: { direction: TrendDirection; change: number } | null;
}

/** A change smaller than this, either way, reads "Steady". */
export const STEADY_PERCENT = 5;

function average(months: TrendHighlightMonth[]): number {
  return months.reduce((sum, m) => sum + m.total, 0) / Math.max(months.length, 1);
}

/**
 * BC-04 AC 8: the Trend screen's Highlights. Highest and Lowest are months of
 * the range (the earlier on a tie). Trend is the headline's change against the
 * months before (`change`); for All, which has none, it is the later half of
 * the range against the earlier half (an odd middle month left out).
 */
export function buildTrendHighlights(
  months: TrendHighlightMonth[],
  { change, currentPeriod }: { change: number | null; currentPeriod: string },
): TrendHighlights {
  if (months.length === 0) return { highest: null, lowest: null, trend: null };

  let highest = months[0];
  let lowest = months[0];
  for (const m of months) {
    if (m.total > highest.total) highest = m;
    if (m.total < lowest.total) lowest = m;
  }

  let trendChange = change;
  if (trendChange === null && months.length >= 2) {
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
    lowest: {
      period: lowest.period,
      total: lowest.total,
      inProgress: lowest.period === currentPeriod,
    },
    trend: trendChange === null ? null : { direction, change: trendChange },
  };
}
