import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { ME_QUERY_KEY, meQueryOptions } from '@/features/auth/hooks/useAuth';
import type { UserProfile } from '@/features/auth/types';

import { AI_CONSENT_POLICY_VERSION } from '../constants';
import { grantAiConsent, withdrawAiConsent } from '../services/aiConsentApi';
import { requestAiConsent } from '../services/consentPrompt';
import { aiConsentGranted, withConsent } from '../utils/aiConsent';

/**
 * The account's consent from the cached profile; undefined while unknown.
 * Reads the cache only (enabled: false): useMe (root layout) fetches it. It
 * still passes the real fetcher, because an invalidation refetches with the
 * options of whichever observer updated last (see meQueryOptions).
 */
export function useAiConsentStatus(): boolean | undefined {
  const { data } = useQuery({ ...meQueryOptions, enabled: false });
  return aiConsentGranted(data);
}

export function useGrantAiConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => grantAiConsent(AI_CONSENT_POLICY_VERSION),
    onSuccess: (profile) => qc.setQueryData(ME_QUERY_KEY, profile),
  });
}

export function useWithdrawAiConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawAiConsent,
    onSuccess: (profile) => qc.setQueryData(ME_QUERY_KEY, profile),
  });
}

/** Record that the server refused for consent, so the app asks before the next scan. */
export function useMarkAiConsentRequired() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.setQueryData<UserProfile>(ME_QUERY_KEY, (profile) => withConsent(profile, false));
  }, [qc]);
}

/**
 * Run before anything that sends a receipt to the AI. `ensureConsent` opens
 * the consent sheet only when the account has not allowed it, and resolves
 * true when the action may go ahead. When consent is unknown it resolves true:
 * the server refuses without consent, and `markRequired` records that refusal.
 */
export function useAiConsentGate() {
  const qc = useQueryClient();
  const router = useRouter();

  const askForConsent = useCallback(
    () => requestAiConsent(() => router.push('/ai-consent')),
    [router],
  );

  const ensureConsent = useCallback(async () => {
    const granted = aiConsentGranted(qc.getQueryData<UserProfile>(ME_QUERY_KEY));
    if (granted !== false) return true;
    return askForConsent();
  }, [qc, askForConsent]);

  const markRequired = useMarkAiConsentRequired();

  return { ensureConsent, askForConsent, markRequired };
}
