/**
 * Budget pace: is spend keeping up with the month, or running ahead of it?
 *
 * Design 05 · Dashboard: $242 of $400 on April day 19 is 60.5% of the cap
 * with 63.3% of the month gone, so spend runs at 95.5% of an even pace:
 * "On pace · 4% under" (the mockup rounds it to 5%).
 */

export interface BudgetPace {
  /** True when spend runs ahead of the month. */
  ahead: boolean;
  /** How far from an even pace, in whole percent. */
  percent: number;
}

/**
 * Compares the share of the cap spent with the share of the month gone.
 * Null when there is no cap or no time has passed.
 */
export function budgetPace(spent: number, cap: number, monthShare: number): BudgetPace | null {
  if (cap <= 0 || monthShare <= 0) return null;
  const ratio = spent / cap / monthShare;
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  // A sliver over that rounds to 0% reads as on pace, not "ahead · 0% over".
  return { ahead: ratio > 1 && percent > 0, percent };
}

/** The share of a "YYYY-MM" period gone by `today`, counting today as gone. */
export function monthShareElapsed(period: string, today: Date = new Date()): number {
  const [year, month] = period.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const current = today.getFullYear() * 12 + today.getMonth();
  const target = year * 12 + (month - 1);
  if (target < current) return 1;
  if (target > current) return 0;
  return today.getDate() / daysInMonth;
}
