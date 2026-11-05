import type { PriceAlertNotification } from '../types';
import { groupPriceAlerts, toPriceAlertRow } from './priceAlertRows';

const NOW = new Date('2026-11-05T12:00:00Z');

function alert(overrides: Partial<PriceAlertNotification> = {}): PriceAlertNotification {
  return {
    id: 'n-1',
    type: 'price_change',
    title: 'Eggs up 22%',
    body: 'Eggs at Safeway: was $4.49 avg, now $5.49',
    data: JSON.stringify({
      canonical_item_id: 'i-1',
      store_id: 's-1',
      item_name: 'Eggs',
      store_name: 'Safeway',
      direction: 'up',
      percent: 22,
      old_average: '$4.49',
      new_price: '$5.49',
      recent_prices: [4.49, 4.79, 5.49],
    }),
    read: false,
    created_at: '2026-11-04T09:00:00Z',
    ...overrides,
  };
}

describe('toPriceAlertRow (PI-03 AC 5)', () => {
  it('reads a rise from the alert data', () => {
    expect(toPriceAlertRow(alert())).toEqual({
      id: 'n-1',
      itemId: 'i-1',
      itemName: 'Eggs',
      direction: 'up',
      percentText: '+22%',
      detail: 'Safeway · was $4.49 avg, now $5.49',
      stockUp: false,
      sparkline: [4.49, 4.79, 5.49],
      createdAt: '2026-11-04T09:00:00Z',
    });
  });

  it('shows a drop with was/now and stock-up worth it under it', () => {
    const row = toPriceAlertRow(
      alert({
        data: JSON.stringify({
          canonical_item_id: 'i-2',
          item_name: 'Olive oil',
          store_name: null,
          direction: 'down',
          percent: -14,
          old_average: '$14.99',
          new_price: '$12.99',
          recent_prices: [14.99, 12.99],
        }),
      }),
    );
    expect(row.direction).toBe('down');
    expect(row.percentText).toBe('−14%');
    expect(row.detail).toBe('was $14.99 avg, now $12.99');
    expect(row.stockUp).toBe(true);
  });

  it('falls back to the title and body of an alert sent before the list', () => {
    const row = toPriceAlertRow(
      alert({
        title: 'Organic Bananas price up 20%',
        body: 'Organic Bananas: $0.78/lb at Loblaws, up 20% from your 30-day average of $0.65/lb.',
        data: JSON.stringify({ canonical_item_id: 'i-3', store_id: null }),
      }),
    );
    expect(row.itemName).toBe('Organic Bananas price up 20%');
    expect(row.detail).toMatch(/30-day average/);
    expect(row.direction).toBe('up');
    expect(row.percentText).toBe('+20%');
    expect(row.sparkline).toEqual([]);
    expect(row.itemId).toBe('i-3');
  });

  it('never opens a malformed item id', () => {
    expect(toPriceAlertRow(alert({ data: '{"canonical_item_id": "../x"}' })).itemId).toBeNull();
    expect(toPriceAlertRow(alert({ data: 'not json' })).itemId).toBeNull();
    expect(toPriceAlertRow(alert({ data: null })).itemId).toBeNull();
  });
});

describe('groupPriceAlerts (PI-03 AC 5)', () => {
  it('puts the last 7 days under This week and the rest under Earlier, newest first', () => {
    const rows = [
      alert({ id: 'old', created_at: '2026-10-20T09:00:00Z' }),
      alert({ id: 'new', created_at: '2026-11-05T08:00:00Z' }),
      alert({ id: 'mid', created_at: '2026-10-30T09:00:00Z' }),
    ].map(toPriceAlertRow);

    const groups = groupPriceAlerts(rows, NOW);

    expect(groups.map((g) => [g.title, g.data.map((r) => r.id)])).toEqual([
      ['This week', ['new', 'mid']],
      ['Earlier', ['old']],
    ]);
  });

  it('leaves out an empty group', () => {
    const groups = groupPriceAlerts([toPriceAlertRow(alert())], NOW);
    expect(groups.map((g) => g.title)).toEqual(['This week']);
  });
});
