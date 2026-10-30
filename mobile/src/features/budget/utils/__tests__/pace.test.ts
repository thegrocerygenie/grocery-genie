import { budgetPace, monthShareElapsed } from '../pace';

describe('budgetPace', () => {
  // Design 05 · Dashboard: April day 19, $242 of $400. The mockup says "5% under";
  // its own numbers give 4.5%, which rounds to 4.
  it('is on pace, and says how far under, when spend trails the month', () => {
    expect(budgetPace(242, 400, 19 / 30)).toEqual({ ahead: false, percent: 4 });
  });

  it('is ahead of pace, and says how far over, when spend runs ahead of the month', () => {
    // Half the cap spent a quarter of the way in: twice the pace.
    expect(budgetPace(200, 400, 0.25)).toEqual({ ahead: true, percent: 100 });
  });

  it('is on pace at exactly the month share', () => {
    expect(budgetPace(200, 400, 0.5)).toEqual({ ahead: false, percent: 0 });
  });

  it('rounds a sliver over to on pace, not "ahead · 0% over"', () => {
    expect(budgetPace(201, 400, 0.5)).toEqual({ ahead: false, percent: 0 });
  });

  it('treats a finished month as all of it gone', () => {
    expect(budgetPace(300, 400, 1)).toEqual({ ahead: false, percent: 25 });
  });

  it('has no pace without a cap or before the month starts', () => {
    expect(budgetPace(50, 0, 0.5)).toBeNull();
    expect(budgetPace(50, 400, 0)).toBeNull();
  });
});

describe('monthShareElapsed', () => {
  const today = new Date(2026, 3, 19); // April 19, 2026

  it('counts today as gone in the current month', () => {
    expect(monthShareElapsed('2026-04', today)).toBeCloseTo(19 / 30);
  });

  it('is the whole month for a past period', () => {
    expect(monthShareElapsed('2026-03', today)).toBe(1);
  });

  it('is none of it for a future period', () => {
    expect(monthShareElapsed('2026-05', today)).toBe(0);
  });
});
