import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ME_QUERY_KEY } from '@/features/auth/hooks/useAuth';
import {
  confirmWaitlistClaim,
  getWaitlistOffer,
  requestWaitlistClaim,
} from '@/features/premium/services/waitlistOfferApi';

export const WAITLIST_OFFER_QUERY_KEY = ['premium', 'waitlist-offer'] as const;

/** The waitlist's free year as the server sees it (V11-P5). */
export function useWaitlistOffer() {
  return useQuery({
    queryKey: WAITLIST_OFFER_QUERY_KEY,
    queryFn: getWaitlistOffer,
    staleTime: 60_000,
  });
}

export function useRequestWaitlistClaim() {
  return useMutation({ mutationFn: requestWaitlistClaim });
}

/** After a claim, the profile (is_premium) and the offer both changed. */
export function useConfirmWaitlistClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: confirmWaitlistClaim,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: WAITLIST_OFFER_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ]);
    },
  });
}
