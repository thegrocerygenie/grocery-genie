import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  acceptSuggestion,
  getItem,
  getPriceAlertSettings,
  getPriceComparison,
  getPriceHistory,
  listItems,
  listSuggestions,
  mergeItem,
  muteItem,
  muteStore,
  rejectSuggestion,
  renameItem,
  splitAlias,
  unmuteItem,
  unmuteStore,
  updatePriceAlertSettings,
} from '../services/itemsApi';
import type { PriceAlertSettingsUpdate } from '../types';

export const ITEMS_KEY = ['items'] as const;

export function useItems(query: string) {
  return useQuery({
    queryKey: [...ITEMS_KEY, 'list', query.trim()],
    queryFn: () => listItems(query),
    staleTime: 30_000,
  });
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: [...ITEMS_KEY, 'detail', id],
    queryFn: () => getItem(id as string),
    enabled: !!id,
  });
}

export function usePriceHistory(id: string | undefined) {
  return useQuery({
    queryKey: [...ITEMS_KEY, 'prices', id],
    queryFn: () => getPriceHistory(id as string),
    enabled: !!id,
  });
}

/** PI-04 AC 4: the store comparison on item detail. */
export function usePriceComparison(id: string | undefined) {
  return useQuery({
    queryKey: [...ITEMS_KEY, 'compare', id],
    queryFn: () => getPriceComparison(id as string),
    enabled: !!id,
  });
}

const PRICE_ALERT_SETTINGS_KEY = [...ITEMS_KEY, 'price-alert-settings'] as const;

export function usePriceAlertSettings() {
  return useQuery({ queryKey: PRICE_ALERT_SETTINGS_KEY, queryFn: getPriceAlertSettings });
}

export function useUpdatePriceAlertSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PriceAlertSettingsUpdate) => updatePriceAlertSettings(body),
    onSuccess: (data) => qc.setQueryData(PRICE_ALERT_SETTINGS_KEY, data),
  });
}

/** PI-03 AC 4: `muted` true mutes the item's price alerts, false unmutes. */
export function useMuteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) =>
      muted ? muteItem(id) : unmuteItem(id),
    onSettled: (_data, _error, { id }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: [...ITEMS_KEY, 'detail', id] }),
        qc.invalidateQueries({ queryKey: PRICE_ALERT_SETTINGS_KEY }),
      ]),
  });
}

/** PI-03 AC 4: `muted` true mutes price alerts at the store, false unmutes. */
export function useMuteStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, muted }: { storeId: string; muted: boolean }) =>
      muted ? muteStore(storeId) : unmuteStore(storeId),
    onSettled: () => qc.invalidateQueries({ queryKey: PRICE_ALERT_SETTINGS_KEY }),
  });
}

export function useSuggestions() {
  return useQuery({
    queryKey: [...ITEMS_KEY, 'suggestions'],
    queryFn: listSuggestions,
  });
}

/** Any item change can move prices between items: refetch them all, and
 * receipts, whose lines name their item. */
function invalidate(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ITEMS_KEY });
  qc.invalidateQueries({ queryKey: ['receipt'] });
}

export function useRenameItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameItem(id, name),
    onSuccess: () => invalidate(qc),
  });
}

export function useMergeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, intoId }: { id: string; intoId: string }) => mergeItem(id, intoId),
    onSuccess: () => invalidate(qc),
  });
}

export function useSplitAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, aliasId }: { id: string; aliasId: string }) => splitAlias(id, aliasId),
    onSuccess: () => invalidate(qc),
  });
}

export function useAcceptSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptSuggestion(id),
    onSuccess: () => invalidate(qc),
  });
}

export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectSuggestion(id),
    onSuccess: () => invalidate(qc),
  });
}
