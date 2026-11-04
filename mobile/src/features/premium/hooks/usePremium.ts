import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ME_QUERY_KEY, useMe } from '@/features/auth/hooks/useAuth';
import type { UserProfile } from '@/features/auth/types';
import { refreshPremium } from '@/features/premium/services/premiumApi';
import {
  getPremiumOffer,
  isPurchasesAvailable,
  purchasePremium,
  restorePremium,
  type PremiumPlan,
  type PurchaseOutcome,
  type RestoreOutcome,
} from '@/features/premium/services/purchases';

/** Premium as the backend sees it (`is_premium`), never the SDK alone. */
export function useIsPremium(): boolean {
  const { data } = useMe();
  return data?.is_premium === true;
}

export function usePremiumOffer(userId: string | undefined) {
  const available = isPurchasesAvailable();
  return useQuery({
    queryKey: ['premium', 'offer', userId],
    queryFn: () => getPremiumOffer(userId as string),
    enabled: available && !!userId,
    staleTime: 5 * 60_000,
  });
}

/**
 * After a purchase or restore, ask the backend (which asks RevenueCat) and
 * store the profile it returns. Then refetch the rest: a 12-month trend that
 * was refused is allowed now. Null when the backend could not say yet; the
 * webhook will.
 */
async function syncPremium(qc: QueryClient): Promise<UserProfile | null> {
  let profile: UserProfile | null = null;
  try {
    profile = await refreshPremium();
    qc.setQueryData(ME_QUERY_KEY, profile);
  } catch {
    profile = null;
  }
  // The profile was just stored; refetch it only when the backend could not answer.
  await qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] !== 'premium' && (profile === null || q.queryKey[0] !== 'auth'),
  });
  return profile;
}

export interface PremiumResult<T> {
  outcome: T;
  /** The backend says the user is Premium. */
  premium: boolean;
  /** The backend answered (false: the refresh failed, e.g. a 503). */
  checked: boolean;
}

export function usePurchasePremium() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      plan,
    }: {
      userId: string;
      plan: PremiumPlan;
    }): Promise<PremiumResult<PurchaseOutcome>> => {
      const outcome = await purchasePremium(userId, plan);
      if (outcome.kind !== 'purchased') return { outcome, premium: false, checked: false };
      const profile = await syncPremium(qc);
      return { outcome, premium: profile?.is_premium === true, checked: profile !== null };
    },
  });
}

export function useRestorePremium() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string): Promise<PremiumResult<RestoreOutcome>> => {
      const outcome = await restorePremium(userId);
      if (outcome.kind !== 'restored') return { outcome, premium: false, checked: false };
      const profile = await syncPremium(qc);
      return { outcome, premium: profile?.is_premium === true, checked: profile !== null };
    },
  });
}
