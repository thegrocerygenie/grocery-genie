import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { listStores, mergeStore, unmergeStore } from '../services/storesApi';
import { ITEMS_KEY } from './useItems';

export const STORES_KEY = ['stores'] as const;

export function useStores() {
  return useQuery({ queryKey: STORES_KEY, queryFn: listStores });
}

/** A merge regroups prices: refetch the stores and every price view. */
function invalidate(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: STORES_KEY });
  qc.invalidateQueries({ queryKey: ITEMS_KEY });
}

export function useMergeStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, intoId }: { id: string; intoId: string }) => mergeStore(id, intoId),
    onSettled: () => invalidate(qc),
  });
}

export function useUnmergeStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unmergeStore(id),
    onSettled: () => invalidate(qc),
  });
}
