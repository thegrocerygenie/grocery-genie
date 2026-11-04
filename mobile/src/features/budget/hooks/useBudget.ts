import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBudget,
  deleteBudget,
  listBudgets,
  setBudgetRollover,
  updateBudget,
} from '../services/budgetApi';
import type { BudgetCreateRequest, BudgetUpdateRequest } from '../types';

/** The user's active budgets (overall first). */
export function useBudgets() {
  return useQuery({ queryKey: ['budgets'], queryFn: listBudgets });
}

export function useBudgetCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BudgetCreateRequest) => createBudget(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useBudgetUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ budgetId, data }: { budgetId: string; data: BudgetUpdateRequest }) =>
      updateBudget(budgetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

/** Rollover on or off for one budget (Premium). */
export function useBudgetRollover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ budgetId, enabled }: { budgetId: string; enabled: boolean }) =>
      setBudgetRollover(budgetId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useBudgetDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (budgetId: string) => deleteBudget(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}
