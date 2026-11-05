import { toIsoDate } from '@/features/receipt-capture/utils/receiptDate';
import { formatMoney } from '@/utils/money';
import type { PriceHistory, PricePoint } from '../types';

const EACH_UNITS = new Set(['each', 'ea', 'unit', 'units', 'item', 'items', 'pc', 'pcs']);

/** PI-01 AC 3: "$0.69/lb", "$1.29 each", or just "$4.99" with no unit. */
export function formatUnitPrice(price: number, currency: string, unit: string | null): string {
  const money = formatMoney(price, currency);
  if (!unit) return money;
  const normalized = unit.trim().toLowerCase();
  if (!normalized) return money;
  if (EACH_UNITS.has(normalized)) return `${money} each`;
  return `${money}/${normalized}`;
}

/** The prices the chart plots: the history's own unit and currency only. */
export function timelinePoints(history: PriceHistory): PricePoint[] {
  return history.observations.filter((p) => p.in_timeline);
}

/** "+8%", "−5%" (a real minus sign, which VoiceOver reads as "minus"), "0%". */
export function formatPercent(percent: number): string {
  if (percent > 0) return `+${percent}%`;
  if (percent < 0) return `−${Math.abs(percent)}%`;
  return '0%';
}

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" date, the same in every time zone. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** PI-01 AC 7: the headline's unit, "/ ea" for a count, "/ lb" for a measure. */
export function unitSuffix(unit: string | null): string {
  const normalized = unit?.trim().toLowerCase();
  if (!normalized) return '';
  return EACH_UNITS.has(normalized) ? '/ ea' : `/ ${normalized}`;
}

export interface ThirtyDayAverage {
  average: number;
  /** Whole percent against the 30 days before; null with no price there. */
  percent: number | null;
}

const WINDOW_DAYS = 30;

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * PI-01 AC 7: the mean of the like-for-like prices dated in the 30 days up to
 * the latest one (its day and the 29 before), and the change from the mean of
 * the 30 days before that window.
 */
export function thirtyDayAverage(points: PricePoint[]): ThirtyDayAverage | null {
  const comparable = points.filter((p) => p.in_timeline);
  if (comparable.length === 0) return null;
  const days = comparable.map((p) => dayNumber(p.date));
  const latest = Math.max(...days);
  const recent: number[] = [];
  const before: number[] = [];
  comparable.forEach((p, i) => {
    const ago = latest - days[i];
    if (ago < WINDOW_DAYS) recent.push(p.unit_price);
    else if (ago < WINDOW_DAYS * 2) before.push(p.unit_price);
  });
  const average = mean(recent);
  const earlier = before.length > 0 ? mean(before) : 0;
  return {
    average,
    percent: earlier > 0 ? Math.round(((average - earlier) / earlier) * 100) : null,
  };
}

/** PI-01 AC 5: the chart's ranges, 3M first. */
export const PRICE_RANGES = ['1M', '3M', '6M', '1Y', 'All'] as const;
export type PriceRange = (typeof PRICE_RANGES)[number];
export const DEFAULT_PRICE_RANGE: PriceRange = '3M';

const RANGE_MONTHS: Record<PriceRange, number | null> = {
  '1M': 1,
  '3M': 3,
  '6M': 6,
  '1Y': 12,
  All: null,
};

/**
 * The first day of `range`, counted back in calendar months from today (a
 * day past the end of a shorter month clamps to its last day); All has none.
 */
export function rangeFrom(range: PriceRange, now: Date): string | undefined {
  const months = RANGE_MONTHS[range];
  if (months === null) return undefined;
  const year = now.getFullYear();
  const month = now.getMonth() - months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return toIsoDate(new Date(year, month, Math.min(now.getDate(), lastDay)));
}

export interface MonthTick {
  x: number;
  label: string;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * PI-01 AC 8: a label at the first of each month the chart spans, placed on
 * the same calendar x as chartGeometry; every few months over a long span,
 * at most `max`. Prices all in one month label that month at the start.
 */
export function monthTicks(
  points: PricePoint[],
  width: number,
  inset: number,
  max = 6,
): MonthTick[] {
  if (points.length === 0 || width <= 0) return [];
  const times = points.map((p) => dayNumber(p.date));
  const start = Math.min(...times);
  const end = Math.max(...times);
  const span = end - start;
  const innerW = Math.max(width - inset * 2, 0);
  const xOf = (day: number) => inset + (span > 0 ? ((day - start) / span) * innerW : innerW / 2);

  const first = new Date(start * 86_400_000);
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  if (first.getUTCDate() !== 1) m += 1;
  const ticks: MonthTick[] = [];
  for (;;) {
    const day = Date.UTC(y, m, 1) / 86_400_000;
    if (day > end) break;
    const at = new Date(day * 86_400_000);
    ticks.push({ x: xOf(day), label: MONTH_SHORT[at.getUTCMonth()] });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  if (ticks.length === 0) return [{ x: xOf(start), label: MONTH_SHORT[first.getUTCMonth()] }];
  const step = Math.ceil(ticks.length / max);
  return ticks.filter((_, i) => i % step === 0);
}

export interface ChartPoint {
  x: number;
  y: number;
  point: PricePoint;
}

export interface ChartGeometry {
  points: ChartPoint[];
  low: number;
  high: number;
}

/**
 * Places prices in a width × height box, inset by `inset` on every side. x
 * follows the calendar (a gap between purchases shows as a gap); prices all
 * on one day spread evenly instead. y runs from the lowest price (bottom) to
 * the highest (top); one price level sits in the middle.
 */
export function chartGeometry(
  points: PricePoint[],
  width: number,
  height: number,
  inset: number,
): ChartGeometry {
  if (points.length === 0) return { points: [], low: 0, high: 0 };
  const prices = points.map((p) => p.unit_price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // The range labels and VoiceOver need low and high before the first layout.
  if (width <= 0 || height <= 0) return { points: [], low, high };
  const times = points.map((p) => dayNumber(p.date));
  const start = Math.min(...times);
  const span = Math.max(...times) - start;
  const innerW = Math.max(width - inset * 2, 0);
  const innerH = Math.max(height - inset * 2, 0);
  const last = Math.max(points.length - 1, 1);

  return {
    low,
    high,
    points: points.map((point, i) => {
      const xFraction = span > 0 ? (times[i] - start) / span : points.length > 1 ? i / last : 0.5;
      const yFraction = high > low ? (point.unit_price - low) / (high - low) : 0.5;
      return {
        x: inset + xFraction * innerW,
        y: inset + (1 - yFraction) * innerH,
        point,
      };
    }),
  };
}
