import { useMe } from '@/features/auth/hooks/useAuth';

/** The user's budget currency: budget amounts are in it, and only receipts in
 * it count toward budgets. USD (the server default) until the profile loads. */
export function useBudgetCurrency(): string {
  return useMe().data?.currency_preference ?? 'USD';
}
