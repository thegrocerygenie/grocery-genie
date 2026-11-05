/**
 * PREM-04 AC 1: the export's Period, From and To. Last 12 months is the
 * twelve calendar months up to this one; From and To are whole months.
 */
import { monthsForPeriod, rangeDates, rangeIsValid, type Month } from '../utils/exportRange';

const NOV_2026 = new Date(2026, 10, 4, 9);

describe('monthsForPeriod', () => {
  it('Last 12 months runs from 11 months back to this month', () => {
    expect(monthsForPeriod('last12', NOV_2026)).toEqual({
      from: { year: 2025, month: 12 },
      to: { year: 2026, month: 11 },
    });
    // Across a year boundary.
    expect(monthsForPeriod('last12', new Date(2026, 0, 15))).toEqual({
      from: { year: 2025, month: 2 },
      to: { year: 2026, month: 1 },
    });
  });

  it('This year is January to December; All time has no bounds', () => {
    expect(monthsForPeriod('thisYear', NOV_2026)).toEqual({
      from: { year: 2026, month: 1 },
      to: { year: 2026, month: 12 },
    });
    expect(monthsForPeriod('all', NOV_2026)).toEqual({ from: null, to: null });
  });

  it('Custom keeps the months picked', () => {
    const custom = { from: { year: 2024, month: 3 }, to: { year: 2024, month: 5 } };
    expect(monthsForPeriod('custom', NOV_2026, custom)).toEqual(custom);
  });
});

describe('rangeDates', () => {
  it('From is the first day of its month and To the last', () => {
    expect(rangeDates({ year: 2025, month: 12 }, { year: 2026, month: 2 })).toEqual({
      from: '2025-12-01',
      to: '2026-02-28',
    });
    expect(rangeDates({ year: 2024, month: 2 }, { year: 2024, month: 2 })).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });

  it('All time sends no dates', () => {
    expect(rangeDates(null, null)).toEqual({ from: null, to: null });
  });
});

describe('rangeIsValid', () => {
  const m = (year: number, month: number): Month => ({ year, month });

  it('From after To is invalid (EC-PREM 4)', () => {
    expect(rangeIsValid(m(2026, 5), m(2026, 4))).toBe(false);
    expect(rangeIsValid(m(2026, 4), m(2026, 4))).toBe(true);
    expect(rangeIsValid(m(2025, 12), m(2026, 1))).toBe(true);
    expect(rangeIsValid(null, null)).toBe(true);
  });
});
