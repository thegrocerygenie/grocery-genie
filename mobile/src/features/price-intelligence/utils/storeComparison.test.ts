import type { StorePrice } from '../types';
import { orderStoresByLatest, priceBarShare, switchSavings } from './storeComparison';

function store(name: string, latest: number, avg: number): StorePrice {
  return {
    store_id: `s-${name}`,
    store_name: name,
    latest_price: latest,
    latest_date: '2026-03-01',
    avg_price: avg,
    observation_count: 2,
  };
}

describe('orderStoresByLatest (PI-04 AC 6, EC-PI 10)', () => {
  it('orders by latest price, cheapest first', () => {
    const ordered = orderStoresByLatest([
      store('Whole Foods', 5.99, 5.79),
      store("Trader Joe's", 3.99, 4.12),
      store('Costco', 4.49, 4.39),
    ]);

    expect(ordered.map((s) => s.store_name)).toEqual(["Trader Joe's", 'Costco', 'Whole Foods']);
  });

  it('breaks a tie on latest price by average, then by name', () => {
    const ordered = orderStoresByLatest([
      store('Safeway', 4.0, 4.5),
      store('Loblaws', 4.0, 4.2),
      store('FreshCo', 4.0, 4.2),
    ]);

    expect(ordered.map((s) => s.store_name)).toEqual(['FreshCo', 'Loblaws', 'Safeway']);
  });

  it('leaves the list it was given as it was', () => {
    const stores = [store('B', 2, 2), store('A', 1, 1)];
    orderStoresByLatest(stores);
    expect(stores.map((s) => s.store_name)).toEqual(['B', 'A']);
  });
});

describe('switchSavings (PI-04 AC 5, EC-PI 10)', () => {
  it('is the gap between the highest and lowest latest price, cheapest vs priciest', () => {
    const savings = switchSavings(
      orderStoresByLatest([
        store("Trader Joe's", 3.99, 4.12),
        store('Whole Foods', 5.99, 5.79),
        store('Costco', 4.49, 4.39),
      ]),
    );

    expect(savings).toEqual({ amount: 2, cheapest: "Trader Joe's", priciest: 'Whole Foods' });
  });

  it('rounds the gap to the cent', () => {
    const savings = switchSavings([store('A', 0.71, 0.7), store('B', 0.81, 0.8)]);
    expect(savings?.amount).toBe(0.1);
  });

  it('is none with one store', () => {
    expect(switchSavings([store('A', 1, 1)])).toBeNull();
  });

  it('is none when every store has the same latest price', () => {
    expect(switchSavings([store('A', 3, 2.5), store('B', 3, 3.5)])).toBeNull();
  });
});

describe('priceBarShare (PI-04 AC 7)', () => {
  it("is the store's latest price over the highest latest price", () => {
    const stores = [store('A', 3, 3), store('B', 6, 6)];
    expect(priceBarShare(stores[0], stores)).toBe(0.5);
    expect(priceBarShare(stores[1], stores)).toBe(1);
  });

  it('is empty when every latest price is zero', () => {
    const stores = [store('A', 0, 0)];
    expect(priceBarShare(stores[0], stores)).toBe(0);
  });
});
