import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { isPremiumRequired } from '@/utils/premium';

import {
  acceptSuggestion,
  getItem,
  getLinkCandidates,
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
  splitItem,
  unmuteItem,
  unmuteStore,
  updatePriceAlertSettings,
} from '../services/itemsApi';
import type { ItemSplitPart, PriceAlertSettingsUpdate } from '../types';

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

/** PI-02 AC 15: the Link items sheet's groups, narrowed by `query`. */
export function useLinkCandidates(id: string | undefined, query: string) {
  return useQuery({
    queryKey: [...ITEMS_KEY, 'link-candidates', id, query.trim()],
    queryFn: () => getLinkCandidates(id as string, query),
    enabled: !!id,
    staleTime: 30_000,
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
/**
 * PI-04 comparison, Premium (D8, PREM-02 AC 1): asked only when `enabled`
 * (the profile says Premium). A `403 premium_required` is final, not retried.
 */
export function usePriceComparison(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...ITEMS_KEY, 'compare', id],
    queryFn: () => getPriceComparison(id as string),
    enabled: !!id && enabled,
    retry: (count, error) => !isPremiumRequired(error) && count < 3,
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

/**
 * PI-03 AC 4, 11: `muted` true mutes the item's price alerts until `until`
 * (ISO; null or left out is forever), false unmutes.
 */
export function useMuteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, muted, until }: { id: string; muted: boolean; until?: string | null }) =>
      muted ? muteItem(id, until ?? null) : unmuteItem(id),
    onSettled: (_data, _error, { id }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: [...ITEMS_KEY, 'detail', id] }),
        qc.invalidateQueries({ queryKey: PRICE_ALERT_SETTINGS_KEY }),
      ]),
  });
}

/** PI-03 AC 4, 11: `muted` true mutes price alerts at the store until `until`, false unmutes. */
export function useMuteStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      storeId,
      muted,
      until,
    }: {
      storeId: string;
      muted: boolean;
      until?: string | null;
    }) => (muted ? muteStore(storeId, until ?? null) : unmuteStore(storeId)),
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

/** PI-02 AC 13, 14 (DA-6): split by line. */
export function useSplitItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, splits }: { id: string; splits: ItemSplitPart[] }) => splitItem(id, splits),
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
