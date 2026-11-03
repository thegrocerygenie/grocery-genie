import type { PricePoint } from '../types';
import {
  chartGeometry,
  formatPercent,
  formatUnitPrice,
  priceChange,
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

describe('priceChange', () => {
  it('compares the latest price with the first', () => {
    expect(priceChange([point('2026-03-01', 0.7), point('2026-03-20', 0.77)])).toEqual({
      percent: 10,
      sinceDate: '2026-03-01',
    });
  });

  it('needs two prices', () => {
    expect(priceChange([point('2026-03-01', 0.7)])).toBeNull();
    expect(priceChange([])).toBeNull();
  });

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
