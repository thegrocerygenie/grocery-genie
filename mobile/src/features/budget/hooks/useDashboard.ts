import { useQuery } from '@tanstack/react-query';

import { isPremiumRequired } from '@/utils/premium';
import { getDashboardSpending, type TrendMonths } from '../services/budgetApi';

export function useDashboardSpending(
  period?: string,
  months: TrendMonths = 3,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['dashboard', 'spending', period, months],
    queryFn: () => getDashboardSpending(period, months),
    staleTime: 30_000,
    enabled: options.enabled ?? true,
    // premium_required is an answer, not a failure: asking again changes nothing.
    retry: (failureCount, error) => !isPremiumRequired(error) && failureCount < 3,
  });
}
