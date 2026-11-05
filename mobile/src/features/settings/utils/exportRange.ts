/**
 * The export's Period, From and To (PREM-04 AC 1). Ranges are whole calendar
 * months: From is the first day of its month and To the last, sent to the
 * server as `from` and `to` (both inclusive). All time sends neither.
 */

export type ExportPeriod = 'last12' | 'all' | 'thisYear' | 'custom';

/** A calendar month; `month` is 1–12. */
export interface Month {
  year: number;
  month: number;
}

export interface MonthRange {
  from: Month | null;
  to: Month | null;
}

/** This month in the device's time zone. */
export function monthOf(now: Date): Month {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** `month` moved by `delta` months. */
export function addMonths(m: Month, delta: number): Month {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The months a period covers; Custom keeps the months picked. */
export function monthsForPeriod(
  period: ExportPeriod,
  now: Date,
  custom?: { from: Month; to: Month },
): MonthRange {
  const current = monthOf(now);
  switch (period) {
    case 'last12':
      return { from: addMonths(current, -11), to: current };
    case 'thisYear':
      return { from: { year: current.year, month: 1 }, to: { year: current.year, month: 12 } };
    case 'all':
      return { from: null, to: null };
    case 'custom':
      return custom ?? { from: addMonths(current, -11), to: current };
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDay(m: Month): number {
  // Day 0 of the next month is this month's last day.
  return new Date(m.year, m.month, 0).getDate();
}

/** The `from` and `to` query values: `YYYY-MM-DD`, or null for no bound. */
export function rangeDates(
  from: Month | null,
  to: Month | null,
): { from: string | null; to: string | null } {
  return {
    from: from ? `${from.year}-${pad(from.month)}-01` : null,
    to: to ? `${to.year}-${pad(to.month)}-${pad(lastDay(to))}` : null,
  };
}

export function compareMonths(a: Month, b: Month): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** From after To is invalid (EC-PREM 4); the server answers it with a 422. */
export function rangeIsValid(from: Month | null, to: Month | null): boolean {
  return !from || !to || compareMonths(from, to) <= 0;
}
