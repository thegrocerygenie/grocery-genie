import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  acceptSuggestion,
  getItem,
  getPriceHistory,
  listItems,
  listSuggestions,
  mergeItem,
  rejectSuggestion,
  renameItem,
  splitAlias,
} from '../services/itemsApi';

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
