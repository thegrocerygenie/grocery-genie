import { fromIsoDate } from '@/features/receipt-capture/utils/receiptDate';
import { formatMoney } from '@/utils/money';
import type { PriceHistory, PricePoint } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

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

export interface PriceChange {
  /** Whole percent, latest against the first comparable price. */
  percent: number;
  sinceDate: string;
}

export function priceChange(points: PricePoint[]): PriceChange | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.unit_price <= 0) return null;
  return {
    percent: Math.round(((last.unit_price - first.unit_price) / first.unit_price) * 100),
    sinceDate: first.date,
  };
}

/** "+8%", "−5%" (a real minus sign, which VoiceOver reads as "minus"), "0%". */
export function formatPercent(percent: number): string {
  if (percent > 0) return `+${percent}%`;
  if (percent < 0) return `−${Math.abs(percent)}%`;
  return '0%';
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
  // Whole days from the first purchase. Local midnights on either side of a
  // daylight saving change sit 23 or 25 hours apart, so round to the day.
  const times = points.map((p) => fromIsoDate(p.date).getTime());
  const first = Math.min(...times);
  const days = times.map((t) => Math.round((t - first) / DAY_MS));
  const span = Math.max(...days);
  const innerW = Math.max(width - inset * 2, 0);
  const innerH = Math.max(height - inset * 2, 0);
  const last = Math.max(points.length - 1, 1);

  return {
    low,
    high,
    points: points.map((point, i) => {
      const xFraction = span > 0 ? days[i] / span : points.length > 1 ? i / last : 0.5;
      const yFraction = high > low ? (point.unit_price - low) / (high - low) : 0.5;
      return {
        x: inset + xFraction * innerW,
        y: inset + (1 - yFraction) * innerH,
        point,
      };
    }),
  };
}
