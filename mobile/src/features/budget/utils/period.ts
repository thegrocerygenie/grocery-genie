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

// A no-break space. The heading wraps at the largest text sizes; inside a date
// or the day count it must not ("Nov" on one line and "14" on the next).
const NBSP = '\u00a0';

/** "Nov 15", kept on one line. */
function shortDate(d: Date): string {
  return `${MONTH_SHORT[d.getMonth()]}${NBSP}${d.getDate()}`;
}

function startsOnFirst({ start }: PeriodBounds): boolean {
  return start.getDate() === 1;
}

function monthOf({ start }: PeriodBounds): string {
  return monthName(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`);
}

/** "November" for a period that starts on the 1st, else "Oct 15 – Nov 14". */
export function periodName(bounds: PeriodBounds): string {
  if (startsOnFirst(bounds)) return monthOf(bounds);
  return `${shortDate(bounds.start)} – ${shortDate(bounds.end)}`;
}

/** For the budget ring, which has room for about ten characters: "November" or "to Nov 14". */
export function periodRingName(bounds: PeriodBounds): string {
  if (startsOnFirst(bounds)) return monthOf(bounds);
  return `to ${shortDate(bounds.end)}`;
}

/** The period's name, with "· day N" while `today` is in it. Wraps only before the "·" or around the dash. */
export function periodHeading(bounds: PeriodBounds, today: Date): string {
  const day = daysBetween(bounds.start, today) + 1;
  const inPeriod = day >= 1 && daysBetween(today, bounds.end) >= 0;
  return inPeriod ? `${periodName(bounds)} ·${NBSP}day${NBSP}${day}` : periodName(bounds);
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
