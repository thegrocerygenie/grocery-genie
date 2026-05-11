import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/services/api';

export interface DeletedItem {
  id: string;
  deleted_at: string;
  days_remaining: number;
  label: string;
  type: 'receipt' | 'budget';
}

export const RECEIPT_DELETED_KEY = ['receipts', 'recently-deleted'] as const;
export const BUDGET_DELETED_KEY = ['budgets', 'recently-deleted'] as const;

export function useRecentlyDeletedReceipts() {
  return useQuery<DeletedItem[]>({
    queryKey: RECEIPT_DELETED_KEY,
    queryFn: () => apiClient<DeletedItem[]>('/api/receipts/recently-deleted'),
  });
}

export function useRecentlyDeletedBudgets() {
  return useQuery<DeletedItem[]>({
    queryKey: BUDGET_DELETED_KEY,
    queryFn: () => apiClient<DeletedItem[]>('/api/budgets/recently-deleted'),
  });
}

export function useDeleteReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<void>(`/api/receipts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: RECEIPT_DELETED_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRestoreReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<unknown>(`/api/receipts/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: RECEIPT_DELETED_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<void>(`/api/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: BUDGET_DELETED_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRestoreBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<unknown>(`/api/budgets/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: BUDGET_DELETED_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
