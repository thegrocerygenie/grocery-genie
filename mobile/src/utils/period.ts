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
];

/** "2026-04" → "April". Returns the input when it is not a YYYY-MM period. */
export function monthName(period: string): string {
  const month = Number(period.split('-')[1]);
  return MONTH_LONG[month - 1] ?? period;
}
