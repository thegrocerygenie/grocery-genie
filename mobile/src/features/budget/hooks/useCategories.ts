import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from '../services/budgetApi';
import type { CategoryInput } from '../types';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000, // 5 minutes — categories rarely change
  });
}

/** Add a custom category (Premium), with its colour and icon. */
export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput & { name: string }) => createCategory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
}

/** Rename a custom category or change its colour or icon (Premium). */
export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CategoryInput & { id: string }) => updateCategory(id, input),
    onSuccess: () => {
      // The name and look show in budgets and on the dashboard too.
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Delete a custom category: its items move to Other and its budget goes. */
export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['receipts'] });
      void queryClient.invalidateQueries({ queryKey: ['receipt'] });
    },
  });
}
