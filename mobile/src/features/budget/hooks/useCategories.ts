import { useQuery } from '@tanstack/react-query';
import { getCategories } from '../services/budgetApi';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000, // 5 minutes — categories rarely change
  });
}
