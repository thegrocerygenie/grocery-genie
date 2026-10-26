/**
 * Whole-percent change from `previous` to `current`, or null when there is no
 * previous spend to compare with (a percentage of zero is meaningless).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
