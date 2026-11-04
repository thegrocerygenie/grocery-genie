/**
 * A budget period's dates. Periods reset on the overall budget's start day, so
 * with a reset day of 15 the period named "2026-10" runs October 15 to
 * November 14. The server picks the period and sends its dates.
 */
import type { DashboardData } from '../types';

import { monthName } from '@/utils/period';

export interface PeriodBounds {
  /** First day, local midnight. */
  start: Date;
  /** Last day, local midnight. */
  end: Date;
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

/** "2026-10-15" → October 15, local midnight (not UTC, as new Date(iso) reads it). */
function localDay(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days from `from` to `to`; rounds away a daylight saving hour. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** The period's dates from the server; the calendar month when it sends none. */
export function periodBounds(
  data: Pick<DashboardData, 'period' | 'period_start' | 'period_end'>,
): PeriodBounds {
  if (data.period_start && data.period_end) {
    return { start: localDay(data.period_start), end: localDay(data.period_end) };
  }
  const [year, month] = data.period.split('-').map(Number);
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
}

/** "November" for a period that starts on the 1st, else "Oct 15 – Nov 14". */
export function periodName({ start, end }: PeriodBounds): string {
  if (start.getDate() === 1) {
    const period = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    return monthName(period);
  }
  const short = (d: Date) => `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
  return `${short(start)} – ${short(end)}`;
}

/** The period's name, with "· day N" while `today` is in it. */
export function periodHeading(bounds: PeriodBounds, today: Date): string {
  const day = daysBetween(bounds.start, today) + 1;
  const inPeriod = day >= 1 && daysBetween(today, bounds.end) >= 0;
  return inPeriod ? `${periodName(bounds)} · day ${day}` : periodName(bounds);
}

/** Days after `today` up to the period's last day; 0 once it ends. */
export function periodDaysLeft(bounds: PeriodBounds, today: Date): number {
  const length = daysBetween(bounds.start, bounds.end) + 1;
  return Math.min(length, Math.max(0, daysBetween(today, bounds.end)));
}

/** The share of the period gone by `today`, counting today as gone. */
export function periodShareElapsed(bounds: PeriodBounds, today: Date): number {
  const length = daysBetween(bounds.start, bounds.end) + 1;
  const gone = daysBetween(bounds.start, today) + 1;
  return Math.min(1, Math.max(0, gone / length));
}
