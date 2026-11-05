import { useQuery } from '@tanstack/react-query';

import { listPriceAlerts } from '../services/priceAlertsApi';

export const PRICE_ALERTS_KEY = ['notifications', 'price_change'] as const;

/** PI-03 AC 5: the Price alerts list. */
export function usePriceAlerts() {
  return useQuery({ queryKey: PRICE_ALERTS_KEY, queryFn: listPriceAlerts, staleTime: 30_000 });
}
