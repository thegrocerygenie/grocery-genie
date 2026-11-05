import { PRICES_COPY } from '../constants';
import type { PriceHistory, StoreRef } from '../types';

/** Each store with a price of the item, once, in the order given. */
export function storesOf(points: PriceHistory['observations']): StoreRef[] {
  const seen = new Map<string, string>();
  for (const p of points) {
    if (p.store_id && !seen.has(p.store_id)) {
      seen.set(p.store_id, p.store_name ?? PRICES_COPY.unknownStore);
    }
  }
  return [...seen].map(([storeId, name]) => ({ id: storeId, name }));
}
