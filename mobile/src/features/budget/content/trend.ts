/**
 * Every user-facing string on the Trend screen (BC-04 AC 10), externalized for
 * i18n: the range chips (AC 6), the headline (AC 7), Highlights (AC 8), the
 * chart's VoiceOver labels (AC 9), the month-over-month card (AC 2) and the
 * Premium upgrade prompt (D2, D11).
 */

import type { TrendMonths } from '../services/budgetApi';

/** A Trend range: months ending at the period, or every month since the first receipt. */
export type TrendRange = TrendMonths;

/** The chips in order. 1M and 3M are free; the server gates the rest (D11). */
export const TREND_RANGES: readonly { value: TrendRange; chip: string; label: string }[] = [
  { value: 1, chip: '1M', label: '1 month' },
  { value: 3, chip: '3M', label: '3 months' },
  { value: 6, chip: '6M', label: '6 months' },
  { value: 12, chip: '1Y', label: '1 year' },
  { value: 'all', chip: 'All', label: 'All time' },
];

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
] as const;

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function monthIndex(period: string): number {
  const m = Number(period.split('-')[1]);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m - 1 : -1;
}

/** "Mar" for "2026-03". */
export function monthShort(period: string): string {
  return MONTH_SHORT[monthIndex(period)] ?? period;
}

/** "March" for "2026-03". */
export function monthLong(period: string): string {
  return MONTH_LONG[monthIndex(period)] ?? period;
}

/** "M" for "2026-03": the bar label (AC 9). */
export function monthInitial(period: string): string {
  return monthShort(period).charAt(0);
}

/** "+17%", "−17%" (minus sign), or "0%". */
export function changeText(change: number): string {
  if (change > 0) return `+${change}%`;
  if (change < 0) return `−${Math.abs(change)}%`;
  return '0%';
}

/** "up 17 percent", "down 17 percent", or "no change", for VoiceOver. */
export function changeWords(change: number): string {
  if (change > 0) return `up ${change} percent`;
  if (change < 0) return `down ${Math.abs(change)} percent`;
  return 'no change';
}

function capitalized(text: string): string {
  return text.replace(/^./, (c) => c.toUpperCase());
}

/** The window before the trend's, in words: "month", "3 months", "year". */
function priorSpan(months: number): string {
  if (months === 12) return 'year';
  if (months === 1) return 'month';
  return `${months} months`;
}

export const TREND_STRINGS = {
  title: 'Trend',
  backTitle: 'Budget',
  emptyTitle: 'Not enough data yet',
  emptyMessage: 'Once you have receipts across multiple months, your trend will show here.',

  rangesLabel: 'Trend range',
  rangeHint: (label: string) => `Shows ${label.toLowerCase()} of spending`,

  // AC 7: the headline.
  average: (months: number) => `${months}-month average`,
  /** "+5% YoY" for a year, "+5% vs prior 3 months" otherwise. */
  versusPrior: (change: number, months: number) =>
    months === 12
      ? `${changeText(change)} YoY`
      : `${changeText(change)} vs prior ${priorSpan(months)}`,
  versusPriorLabel: (change: number, months: number) =>
    change === 0
      ? `Same as the ${priorSpan(months)} before`
      : `${capitalized(changeWords(change))} from the ${priorSpan(months)} before`,
  averageLabel: (months: number, amount: string) => `${months}-month average, ${amount}`,

  // AC 9: one VoiceOver element per bar.
  barLabel: (period: string, amount: string) => `${monthLong(period)}: ${amount}`,

  // AC 8: Highlights.
  highlightsHeader: 'Highlights',
  highest: 'Highest',
  lowest: 'Lowest',
  trend: 'Trend',
  noLowest: 'No finished month with spending yet',
  rising: 'Rising',
  falling: 'Falling',
  steady: 'Steady',
  noTrend: 'Not enough history yet',
  highestLabel: (month: string, amount: string) => `Highest: ${month}, ${amount}`,
  lowestLabel: (month: string, amount: string) => `Lowest: ${month}, ${amount}`,
  noLowestLabel: 'Lowest: no finished month with spending yet',
  trendLabel: (direction: string, change: number | null) =>
    change === null
      ? `Trend: ${direction}`
      : `Trend: ${direction.toLowerCase()}, ${changeWords(change)}`,

  // BC-04 AC 2: this month against the month before.
  monthSpending: (period: string) => `${monthLong(period)} spending`,
  totalChange: (change: number, previousPeriod: string) =>
    `${changeText(change)} vs ${monthShort(previousPeriod)}`,
  totalChangeLabel: (change: number, previousPeriod: string) =>
    change === 0
      ? `Same as ${monthLong(previousPeriod)}`
      : `${capitalized(changeWords(change))} from ${monthLong(previousPeriod)}`,
  monthSpendingLabel: (period: string, amount: string) =>
    `${monthLong(period)} spending: ${amount}`,
  byCategoryHeader: (previousPeriod: string) =>
    `BY CATEGORY · VS ${monthShort(previousPeriod).toUpperCase()}`,
  newThisMonth: 'New this month',
  categoryDetail: (change: number, previousAmount: string, previousPeriod: string) =>
    `${changeText(change)} · ${previousAmount} in ${monthShort(previousPeriod)}`,
  categoryNewLabel: (name: string, amount: string) =>
    `${name}: ${amount} this month, new this month`,
  categoryLabel: (
    name: string,
    amount: string,
    previousAmount: string,
    previousPeriod: string,
    change: number,
  ) =>
    `${name}: ${amount} this month, ${previousAmount} in ${monthLong(previousPeriod)}, ${changeWords(change)}`,

  // Loading a range failed for a reason other than Premium.
  loadError: 'Couldn’t load this range.',
  retryLabel: 'Try again',
  retry: 'Try Again',

  // D2, D11: 6M, 1Y and All are Premium; the server says so, the app invites.
  upgradeTitle: 'See more of your spending',
  upgradeMessage:
    '6-month, 1-year and all-time trends are part of Grocery Genie Premium. 1 and 3 months stay free.',
  upgradeAction: 'Learn About Premium',
} as const;
