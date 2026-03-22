import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBudget, updateBudget } from '../services/budgetApi';
import type { BudgetCreateRequest, BudgetUpdateRequest } from '../types';

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
