import {
  periodBounds,
  periodDaysLeft,
  periodHeading,
  periodName,
  periodShareElapsed,
} from '../period';

// Reset day 15: the period named 2026-10 runs October 15 to November 14.
const midMonth = periodBounds({
  period: '2026-10',
  period_start: '2026-10-15',
  period_end: '2026-11-14',
});
const calendar = periodBounds({
  period: '2026-11',
  period_start: '2026-11-01',
  period_end: '2026-11-30',
});
const nov3 = new Date(2026, 10, 3);

describe('periodBounds', () => {
  it('reads the dates the server sends, as local days', () => {
    expect(midMonth.start).toEqual(new Date(2026, 9, 15));
    expect(midMonth.end).toEqual(new Date(2026, 10, 14));
  });

  it('falls back to the calendar month when the server sends no dates', () => {
    const bounds = periodBounds({ period: '2026-02' });
    expect(bounds.start).toEqual(new Date(2026, 1, 1));
    expect(bounds.end).toEqual(new Date(2026, 1, 28));
  });
});

describe('periodName', () => {
  it('is the month name when the period starts on the 1st', () => {
    expect(periodName(calendar)).toBe('November');
  });

  it('is the date range for any other reset day', () => {
    expect(periodName(midMonth)).toBe('Oct 15 – Nov 14');
  });

  it('spans the new year', () => {
    const bounds = periodBounds({
      period: '2026-12',
      period_start: '2026-12-15',
      period_end: '2027-01-14',
    });
    expect(periodName(bounds)).toBe('Dec 15 – Jan 14');
  });
});

describe('periodHeading', () => {
  it('counts the day within the period, not the day of the month', () => {
    expect(periodHeading(midMonth, nov3)).toBe('Oct 15 – Nov 14 · day 20');
  });

  it('keeps "Month · day N" for a calendar month', () => {
    expect(periodHeading(calendar, nov3)).toBe('November · day 3');
  });

  it('has no day count outside the period', () => {
    expect(periodHeading(midMonth, new Date(2026, 10, 20))).toBe('Oct 15 – Nov 14');
  });
});

describe('periodDaysLeft', () => {
  it('counts the days after today up to the period end', () => {
    expect(periodDaysLeft(midMonth, nov3)).toBe(11);
  });

  it('is 0 on the last day and after the period', () => {
    expect(periodDaysLeft(midMonth, new Date(2026, 10, 14))).toBe(0);
    expect(periodDaysLeft(midMonth, new Date(2026, 10, 20))).toBe(0);
  });

  it('counts whole days across a daylight saving change', () => {
    // US clocks go back on November 1, 2026.
    expect(periodDaysLeft(midMonth, new Date(2026, 9, 31))).toBe(14);
  });
});

describe('periodShareElapsed', () => {
  it('counts today as gone', () => {
    // Day 20 of 31.
    expect(periodShareElapsed(midMonth, nov3)).toBeCloseTo(20 / 31);
  });

  it('is the whole period after it ends', () => {
    expect(periodShareElapsed(midMonth, new Date(2026, 10, 15))).toBe(1);
  });

  it('is none of it before it starts', () => {
    expect(periodShareElapsed(midMonth, new Date(2026, 9, 14))).toBe(0);
  });
});
