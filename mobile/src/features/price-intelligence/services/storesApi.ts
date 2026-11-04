import { apiClient } from '@/services/api';
import type { StoreList } from '../types';

/** The user's stores as their prices group them (EC Price Intelligence 1). */
export async function listStores(): Promise<StoreList> {
  return apiClient<StoreList>('/api/stores');
}

/** `id` groups under `intoId` for this user only; `intoId` keeps its name. */
export async function mergeStore(id: string, intoId: string): Promise<StoreList> {
  return apiClient<StoreList>(`/api/stores/${id}/merge`, {
    method: 'POST',
    body: JSON.stringify({ into_store_id: intoId }),
  });
}

/** Undo the merge of `id`. Idempotent. */
export async function unmergeStore(id: string): Promise<void> {
  await apiClient<void>(`/api/stores/${id}/merge`, { method: 'DELETE' });
}
