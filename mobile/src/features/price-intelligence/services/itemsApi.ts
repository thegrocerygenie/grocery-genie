import { apiClient } from '@/services/api';
import type {
  ItemDetail,
  ItemList,
  ItemSplitPart,
  LinkCandidates,
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

/** PI-01: every price; item detail's range control filters it (AC 5). */
export async function getPriceHistory(id: string): Promise<PriceHistory> {
  return apiClient<PriceHistory>(`/api/items/${id}/prices`);
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

/** PI-02 AC 13, 14 (DA-6): chosen lines become new items. Returns them, in order. */
export async function splitItem(id: string, splits: ItemSplitPart[]): Promise<ItemDetail[]> {
  const body = await apiClient<{ items: ItemDetail[] }>(`/api/items/${id}/split`, {
    method: 'POST',
    body: JSON.stringify({ splits }),
  });
  return body.items;
}

/** PI-02 AC 15: the Link items sheet's "Suggested" and "All items". */
export async function getLinkCandidates(id: string, query?: string): Promise<LinkCandidates> {
  const params = new URLSearchParams();
  if (query?.trim()) params.set('q', query.trim());
  const qs = params.toString();
  return apiClient<LinkCandidates>(`/api/items/${id}/link-candidates${qs ? `?${qs}` : ''}`);
}

export async function listSuggestions(): Promise<ItemSuggestion[]> {
  return apiClient<ItemSuggestion[]>('/api/items/suggestions');
}

/** PI-02 AC 7, 8: only the suggestions that one receipt's lines raised. */
export async function listReceiptSuggestions(receiptId: string): Promise<ItemSuggestion[]> {
  const params = new URLSearchParams({ receipt_id: receiptId });
  return apiClient<ItemSuggestion[]>(`/api/items/suggestions?${params.toString()}`);
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

/**
 * PI-03 AC 4, 11: no price alerts for the item until `until` (ISO), or
 * forever when null. Muting again replaces the time.
 */
export async function muteItem(id: string, until: string | null = null): Promise<void> {
  await apiClient<void>(`/api/items/${id}/mute`, {
    method: 'POST',
    body: JSON.stringify({ until }),
  });
}

export async function unmuteItem(id: string): Promise<void> {
  await apiClient<void>(`/api/items/${id}/mute`, { method: 'DELETE' });
}

/** PI-03 AC 4, 11: no price alerts for prices paid at the store, until `until` or forever. */
export async function muteStore(storeId: string, until: string | null = null): Promise<void> {
  await apiClient<void>(`/api/stores/${storeId}/mute`, {
    method: 'POST',
    body: JSON.stringify({ until }),
  });
}

export async function unmuteStore(storeId: string): Promise<void> {
  await apiClient<void>(`/api/stores/${storeId}/mute`, { method: 'DELETE' });
}
