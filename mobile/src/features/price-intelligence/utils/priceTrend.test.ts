import type { PricePoint } from '../types';
import {
  chartGeometry,
  formatPercent,
  monthTicks,
  isStale,
  openingRange,
  pointsInRange,
  rangeFrom,
  thirtyDayAverage,
  unitSuffix,
  formatUnitPrice,
  timelinePoints,
} from './priceTrend';

function point(date: string, unitPrice: number, inTimeline = true): PricePoint {
  return {
    receipt_id: `r-${date}`,
    date,
    store_id: 's-1',
    store_name: 'FreshCo',
    unit_price: unitPrice,
    quantity: 1,
    unit_of_measure: 'lb',
    currency: 'USD',
    in_timeline: inTimeline,
  };
}

describe('formatUnitPrice (PI-01 AC 3)', () => {
  it('shows the unit the price is per', () => {
    expect(formatUnitPrice(0.69, 'USD', 'lb')).toBe('$0.69/lb');
    expect(formatUnitPrice(4.2, 'USD', 'KG')).toBe('$4.20/kg');
    expect(formatUnitPrice(1.29, 'USD', 'each')).toBe('$1.29 each');
    expect(formatUnitPrice(1.29, 'USD', 'ea')).toBe('$1.29 each');
  });

  it('shows just the money without a unit', () => {
    expect(formatUnitPrice(4.99, 'USD', null)).toBe('$4.99');
    expect(formatUnitPrice(4.99, 'EUR', ' ')).toBe('€4.99');
  });
});

describe('formatPercent', () => {
  it('formats up, down and flat', () => {
    expect(formatPercent(10)).toBe('+10%');
    expect(formatPercent(-5)).toBe('−5%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('timelinePoints', () => {
  it('keeps only prices in the chart unit', () => {
    const history = {
      item: { id: 'i', canonical_name: 'Bananas' },
      unit_of_measure: 'lb',
      currency: 'USD',
      has_timeline: true,
      min_points: 2,
      store_count: 1,
      observations: [point('2026-03-01', 1), point('2026-03-02', 2, false)],
    };
    expect(timelinePoints(history).map((p) => p.unit_price)).toEqual([1]);
  });
});

describe('chartGeometry (PI-01 AC 2)', () => {
  it('places one dot per purchase: x by date, y by price', () => {
    const geo = chartGeometry(
      [point('2026-03-01', 1), point('2026-03-03', 3), point('2026-03-11', 2)],
      220,
      120,
      10,
    );
    expect(geo.low).toBe(1);
    expect(geo.high).toBe(3);
    expect(geo.points.map((p) => [p.x, p.y])).toEqual([
      [10, 110], // first day, lowest price: bottom left
      [50, 10], // 2 of 10 days in, highest price: top
      [210, 60], // last day, middle price
    ]);
  });

  it('spaces dates by calendar day across a DST change', () => {
    // jest.globalSetup.js runs the suite in America/New_York, where clocks
    // spring forward on 2026-03-08 and that local day is 23 hours long.
    const geo = chartGeometry(
      [point('2026-03-06', 1), point('2026-03-08', 3), point('2026-03-10', 2)],
      220,
      120,
      10,
    );
    expect(geo.points.map((p) => p.x)).toEqual([10, 110, 210]);
  });

  it('centres a flat price and spreads same-day prices evenly', () => {
    const geo = chartGeometry([point('2026-03-01', 2), point('2026-03-01', 2)], 220, 120, 10);
    expect(geo.points.map((p) => [p.x, p.y])).toEqual([
      [10, 60],
      [210, 60],
    ]);
  });

  it('knows the price range before the chart has a size, but draws nothing', () => {
    const geo = chartGeometry([point('2026-03-01', 2), point('2026-03-02', 3)], 0, 120, 10);
    expect(geo.points).toEqual([]);
    expect([geo.low, geo.high]).toEqual([2, 3]);
  });
});

describe('thirtyDayAverage (PI-01 AC 7)', () => {
  it('averages the 30 days up to the latest price and compares the 30 days before', () => {
    const avg = thirtyDayAverage([
      point('2026-01-20', 9), // before both windows: ignored
      point('2026-02-10', 2),
      point('2026-03-01', 2), // 30 days before the latest: the earlier window
      point('2026-03-02', 2.2), // 29 days before: the latest window
      point('2026-03-31', 2.6),
    ]);
    expect(avg?.average).toBeCloseTo(2.4);
    expect(avg?.percent).toBe(20);
  });

  it('uses like-for-like prices only', () => {
    const avg = thirtyDayAverage([
      point('2026-03-01', 2),
      point('2026-03-10', 0.25, false),
      point('2026-03-20', 4),
    ]);
    expect(avg).toEqual({ average: 3, percent: null });
  });

  it('gives no percent with no price in the earlier window, and a fall as negative', () => {
    expect(thirtyDayAverage([point('2026-03-20', 4)])).toEqual({ average: 4, percent: null });
    expect(thirtyDayAverage([point('2026-02-01', 4), point('2026-03-20', 3)])).toEqual({
      average: 3,
      percent: -25,
    });
  });

  it('is null with no comparable price', () => {
    expect(thirtyDayAverage([point('2026-03-20', 4, false)])).toBeNull();
  });
});

describe('unitSuffix (PI-01 AC 7)', () => {
  it('reads / ea for a count and / lb for a measure', () => {
    expect(unitSuffix('each')).toBe('/ ea');
    expect(unitSuffix('lb')).toBe('/ lb');
    expect(unitSuffix('KG')).toBe('/ kg');
    expect(unitSuffix(null)).toBe('');
  });
});

describe('rangeFrom (PI-01 AC 5)', () => {
  const now = new Date(2026, 10, 5);
  it('counts calendar months back from today, and All has no start', () => {
    expect(rangeFrom('1M', now)).toBe('2026-10-05');
    expect(rangeFrom('3M', now)).toBe('2026-08-05');
    expect(rangeFrom('6M', now)).toBe('2026-05-05');
    expect(rangeFrom('1Y', now)).toBe('2025-11-05');
    expect(rangeFrom('All', now)).toBeUndefined();
  });

  it('clamps to the end of a shorter month', () => {
    expect(rangeFrom('1M', new Date(2026, 2, 31))).toBe('2026-02-28');
  });
});

describe('pointsInRange and openingRange (PI-01 AC 5)', () => {
  const now = new Date(2026, 3, 20);
  const pts = [point('2025-06-01', 1), point('2026-01-20', 2), point('2026-04-15', 3)];

  it('keeps the prices dated from the range start on, and All keeps every one', () => {
    expect(pointsInRange(pts, '3M', now).map((p) => p.date)).toEqual(['2026-01-20', '2026-04-15']);
    expect(pointsInRange(pts, '1M', now).map((p) => p.date)).toEqual(['2026-04-15']);
    expect(pointsInRange(pts, 'All', now)).toHaveLength(3);
  });

  it('opens on 3M with 2 prices, else the smallest of 6M, 1Y, All that has 2', () => {
    expect(openingRange(pts, now)).toBe('3M');
    // One price in 3M is not enough: 6M has two.
    expect(openingRange([point('2025-12-01', 1), point('2026-04-15', 2)], now)).toBe('6M');
    expect(openingRange([point('2025-06-01', 1), point('2026-04-15', 2)], now)).toBe('1Y');
    expect(openingRange([point('2024-06-01', 1), point('2026-04-15', 2)], now)).toBe('All');
    expect(openingRange([point('2024-06-01', 1)], now)).toBe('All');
  });
});

describe('isStale (PI-01 AC 7)', () => {
  it('is true once the latest price is more than 30 days old', () => {
    const now = new Date(2026, 3, 20);
    expect(isStale('2026-03-21', now)).toBe(false); // 30 days
    expect(isStale('2026-03-20', now)).toBe(true);
  });
});

describe('monthTicks (PI-01 AC 8)', () => {
  it('labels each month the chart spans, placed by date', () => {
    const ticks = monthTicks([point('2026-01-01', 2), point('2026-03-01', 3)], 69, 5);
    expect(ticks.map((t) => t.label)).toEqual(['Jan', 'Feb', 'Mar']);
    // 59 days over 59 px: Feb 1 is day 31.
    expect(ticks.map((t) => t.x)).toEqual([5, 36, 64]);
  });

  it('labels the one month when every price falls inside it', () => {
    const ticks = monthTicks([point('2026-03-04', 2), point('2026-03-20', 3)], 100, 10);
    expect(ticks.map((t) => t.label)).toEqual(['Mar']);
  });

  it('thins the labels out over a long span', () => {
    const ticks = monthTicks([point('2025-01-15', 2), point('2026-03-01', 3)], 300, 10, 5);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0].label).toBe('Feb');
  });
});
