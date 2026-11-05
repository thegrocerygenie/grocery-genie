import type { PricePoint } from '../types';
import { UNIT_PRICE_VARIES_RATIO, canSaveSplit, groupStats, unitPriceVaries } from './split';

function point(id: string, price: number, overrides: Partial<PricePoint> = {}): PricePoint {
  return {
    receipt_id: `r-${id}`,
    line_item_id: id,
    line_name: 'OLIVE OIL',
    date: '2026-03-01',
    store_id: 's-1',
    store_name: 'FreshCo',
    unit_price: price,
    quantity: 1,
    unit_of_measure: null,
    currency: 'USD',
    in_timeline: true,
    ...overrides,
  };
}

describe('unitPriceVaries (PI-02 AC 12)', () => {
  it('is 1.5, the user’s answer (D11)', () => {
    expect(UNIT_PRICE_VARIES_RATIO).toBe(1.5);
  });

  it('warns when the highest is at least 1.5 times the lowest', () => {
    expect(unitPriceVaries([point('a', 10), point('b', 15)])).toBe(true);
    expect(unitPriceVaries([point('a', 10), point('b', 24.99), point('c', 11)])).toBe(true);
  });

  it('stays quiet below 1.5 times', () => {
    expect(unitPriceVaries([point('a', 10), point('b', 14.99)])).toBe(false);
  });

  it('compares like for like only, and needs two prices', () => {
    expect(
      unitPriceVaries([point('a', 10), point('b', 30, { in_timeline: false }), point('c', 11)]),
    ).toBe(false);
    expect(unitPriceVaries([point('a', 10)])).toBe(false);
    expect(unitPriceVaries([])).toBe(false);
  });
});

describe('groupStats (PI-02 AC 11)', () => {
  it('counts purchases and averages the like-for-like prices', () => {
    expect(groupStats([point('a', 11.49), point('b', 11.99)])).toEqual({
      count: 2,
      average: 11.74,
      currency: 'USD',
    });
  });

  it('averages the unit most prices are in', () => {
    const stats = groupStats([
      point('a', 0.69, { unit_of_measure: 'lb' }),
      point('b', 0.79, { unit_of_measure: 'lb' }),
      point('c', 2, { unit_of_measure: null }),
    ]);
    expect(stats).toEqual({ count: 3, average: 0.74, currency: 'USD' });
  });

  it('has no average with no lines', () => {
    expect(groupStats([])).toEqual({ count: 0, average: null, currency: null });
  });
});

describe('canSaveSplit (PI-02 AC 11)', () => {
  const lines = ['a', 'b', 'c'];

  it('needs every new item named, with a line, and the original keeping one', () => {
    expect(canSaveSplit(lines, [{ name: 'Olive oil 3L', lines: ['c'] }])).toBe(true);
    expect(canSaveSplit(lines, [{ name: '  ', lines: ['c'] }])).toBe(false);
    expect(canSaveSplit(lines, [{ name: 'Olive oil 3L', lines: [] }])).toBe(false);
    expect(
      canSaveSplit(lines, [
        { name: 'A', lines: ['a', 'b'] },
        { name: 'B', lines: ['c'] },
      ]),
    ).toBe(false);
    expect(
      canSaveSplit(lines, [
        { name: 'A', lines: ['a'] },
        { name: 'B', lines: [] },
      ]),
    ).toBe(false);
  });
});
