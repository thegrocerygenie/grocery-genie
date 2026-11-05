import { apiClient } from '@/services/api';
import type { PriceAlertNotification } from '../types';

interface NotificationList {
  items: PriceAlertNotification[];
  total: number;
  page: number;
  per_page: number;
}

/** PI-03 AC 5: the user's price change alerts, newest first (the latest 100). */
export async function listPriceAlerts(): Promise<PriceAlertNotification[]> {
  const params = new URLSearchParams({ type: 'price_change', order: 'newest', per_page: '100' });
  const list = await apiClient<NotificationList>(`/api/notifications?${params.toString()}`);
  return list.items;
}
