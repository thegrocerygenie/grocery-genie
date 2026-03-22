import { useQuery } from '@tanstack/react-query';
import { getDashboardSpending } from '../services/budgetApi';

export function useDashboardSpending(period?: string) {
  return useQuery({
    queryKey: ['dashboard', 'spending', period],
    queryFn: () => getDashboardSpending(period),
    staleTime: 30_000,
  });
}
