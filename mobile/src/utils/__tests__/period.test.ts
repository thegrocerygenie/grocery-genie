import { monthName } from '../period';

describe('monthName', () => {
  it.each([
    ['2026-01', 'January'],
    ['2026-04', 'April'],
    ['2025-12', 'December'],
  ])('%s → %s', (period, name) => {
    expect(monthName(period)).toBe(name);
  });

  it('returns the input when it is not a YYYY-MM period', () => {
    expect(monthName('soon')).toBe('soon');
    expect(monthName('2026-13')).toBe('2026-13');
  });
});
