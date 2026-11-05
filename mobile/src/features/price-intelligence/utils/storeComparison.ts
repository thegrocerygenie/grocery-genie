import type { StorePrice } from '../types';

/**
 * PI-04 AC 6, EC-PI 10: stores by latest price, cheapest first; a tie goes to
 * the lower average, then to the name. A new array: the server's own order
 * (by average) is left alone.
 */
export function orderStoresByLatest(stores: readonly StorePrice[]): StorePrice[] {
  return [...stores].sort(
    (a, b) =>
      a.latest_price - b.latest_price ||
      a.avg_price - b.avg_price ||
      a.store_name.localeCompare(b.store_name),
  );
}

export interface SwitchSavings {
  /** Highest latest price less the lowest, to the cent. */
  amount: number;
  cheapest: string;
  priciest: string;
}

/**
 * PI-04 AC 5: what switching from the priciest store to the cheapest saves on
 * one unit, from stores already in `orderStoresByLatest` order. None with
 * fewer than 2 stores or no gap (EC-PI 10).
 */
export function switchSavings(ordered: readonly StorePrice[]): SwitchSavings | null {
  if (ordered.length < 2) return null;
  const cheapest = ordered[0];
  const priciest = ordered[ordered.length - 1];
  const amount = Math.round((priciest.latest_price - cheapest.latest_price) * 100) / 100;
  if (amount <= 0) return null;
  return { amount, cheapest: cheapest.store_name, priciest: priciest.store_name };
}

/** PI-04 AC 7: a row's bar length, its latest price over the highest latest price. */
export function priceBarShare(store: StorePrice, stores: readonly StorePrice[]): number {
  const highest = Math.max(0, ...stores.map((s) => s.latest_price));
  return highest > 0 ? store.latest_price / highest : 0;
}
