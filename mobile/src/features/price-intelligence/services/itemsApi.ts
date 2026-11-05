import { apiClient } from '@/services/api';
import type {
  ItemDetail,
  ItemList,
  ItemSuggestion,
  PriceAlertSettings,
  PriceAlertSettingsUpdate,
  PriceComparison,
  PriceHistory,
} from '../types';

export async function listItems(query?: string): Promise<ItemList> {
  const params = new URLSearchParams({ per_page: '100' });
  if (query?.trim()) params.set('q', query.trim());
  return apiClient<ItemList>(`/api/items?${params.toString()}`);
}

export async function getItem(id: string): Promise<ItemDetail> {
  return apiClient<ItemDetail>(`/api/items/${id}`);
}

/** PI-01: every price, or (AC 5) only those dated from `range.from` on. */
export async function getPriceHistory(
  id: string,
  range?: { from?: string },
): Promise<PriceHistory> {
  const query = range?.from ? `?${new URLSearchParams({ from: range.from }).toString()}` : '';
  return apiClient<PriceHistory>(`/api/items/${id}/prices${query}`);
}

export async function renameItem(id: string, canonicalName: string): Promise<ItemDetail> {
  return apiClient<ItemDetail>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ canonical_name: canonicalName }),
  });
}

/** PI-02 AC 3 (link): `id` folds into `intoId`, which keeps its name. */
export async function mergeItem(id: string, intoId: string): Promise<ItemDetail> {
  return apiClient<ItemDetail>(`/api/items/${id}/merge`, {
    method: 'POST',
    body: JSON.stringify({ into_item_id: intoId }),
  });
}

/** PI-02 AC 3 (unlink): the name becomes its own item. Returns the new item. */
export async function splitAlias(id: string, aliasId: string): Promise<ItemDetail> {
  return apiClient<ItemDetail>(`/api/items/${id}/aliases/${aliasId}/split`, {
    method: 'POST',
  });
}

export async function listSuggestions(): Promise<ItemSuggestion[]> {
  return apiClient<ItemSuggestion[]>('/api/items/suggestions');
}

export async function acceptSuggestion(id: string): Promise<ItemDetail> {
  return apiClient<ItemDetail>(`/api/items/suggestions/${id}/accept`, { method: 'POST' });
}

export async function rejectSuggestion(id: string): Promise<void> {
  await apiClient<void>(`/api/items/suggestions/${id}/reject`, { method: 'POST' });
}

/** PI-04: the item's latest and average price at each store, cheapest first. */
export async function getPriceComparison(id: string): Promise<PriceComparison> {
  return apiClient<PriceComparison>(`/api/items/${id}/compare`);
}

/** PI-03 settings: on/off, threshold, and what is muted. */
export async function getPriceAlertSettings(): Promise<PriceAlertSettings> {
  return apiClient<PriceAlertSettings>('/api/items/price-alert-settings');
}

export async function updatePriceAlertSettings(
  body: PriceAlertSettingsUpdate,
): Promise<PriceAlertSettings> {
  return apiClient<PriceAlertSettings>('/api/items/price-alert-settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** PI-03 AC 4: no price alerts for the item. Idempotent. */
export async function muteItem(id: string): Promise<void> {
  await apiClient<void>(`/api/items/${id}/mute`, { method: 'POST' });
}

export async function unmuteItem(id: string): Promise<void> {
  await apiClient<void>(`/api/items/${id}/mute`, { method: 'DELETE' });
}

/** PI-03 AC 4: no price alerts for prices paid at the store. Idempotent. */
export async function muteStore(storeId: string): Promise<void> {
  await apiClient<void>(`/api/stores/${storeId}/mute`, { method: 'POST' });
}

export async function unmuteStore(storeId: string): Promise<void> {
  await apiClient<void>(`/api/stores/${storeId}/mute`, { method: 'DELETE' });
}
