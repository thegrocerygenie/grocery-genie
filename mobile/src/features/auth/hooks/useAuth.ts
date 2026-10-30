import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as authApi from '@/features/auth/services/authApi';
import { clearLocalAccountData } from '@/features/auth/services/clearLocalAccountData';
import { runAppleReauth } from '@/features/auth/services/socialSignIn';
import type { TokenPair, UserProfile } from '@/features/auth/types';
import { tokenSubject } from '@/features/auth/utils/tokenSubject';
import { releasePushToken } from '@/features/notifications/releasePushToken';
import { unregisterPushToken } from '@/features/notifications/services/pushApi';
import { apiErrorCode } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { usePushStore } from '@/store/pushStore';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

async function persistTokens(pair: TokenPair) {
  await useAuthStore.getState().setSession({
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
  });
}

/**
 * The profile query. Every observer of ME_QUERY_KEY must use these options:
 * TanStack Query keeps the options of the observer that updated last, and an
 * invalidation refetches with them. An observer without fetchMe (for example
 * queryFn: skipToken) turns every later invalidation into a failed no-op.
 */
export const meQueryOptions = queryOptions<UserProfile>({
  queryKey: ME_QUERY_KEY,
  queryFn: authApi.fetchMe,
  staleTime: 30_000,
});

export function useMe(enabled = true) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({ ...meQueryOptions, enabled: enabled && !!accessToken });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.signUp,
    onSuccess: async (pair) => {
      await persistTokens(pair);
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.signIn,
    onSuccess: async (pair) => {
      await persistTokens(pair);
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Before signOut: unregistering needs the still-valid session.
      await releasePushToken({
        token: usePushStore.getState().token,
        unregister: unregisterPushToken,
        clear: () => usePushStore.getState().setToken(null),
      });
      try {
        await authApi.signOut();
      } catch {
        // Ignore network failures during sign-out — we still clear locally.
      }
      await useAuthStore.getState().clear();
      qc.clear();
    },
  });
}

/** The user closed the Sign in with Apple sheet, so nothing was deleted. */
export class AppleReauthCancelledError extends Error {}

/**
 * Delete the account on the server, then everything the device kept for it.
 * A Sign in with Apple account first confirms with Apple, so the server can
 * revoke the app's grant. A failed call leaves the device as it was.
 */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const ownerId = tokenSubject(useAuthStore.getState().accessToken);
      try {
        await authApi.deleteAccount();
      } catch (error) {
        if (apiErrorCode(error) !== 'apple_reauth_required') throw error;
        const code = await runAppleReauth();
        if (!code) throw new AppleReauthCancelledError('Apple sign-in cancelled');
        await authApi.deleteAccount(code);
      }
      await clearLocalAccountData(ownerId);
      qc.clear();
    },
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.verifyEmail,
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
}

export function useResendVerification() {
  return useMutation({ mutationFn: authApi.resendVerification });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: authApi.forgotPassword });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) =>
      authApi.resetPassword(token, newPassword),
  });
}

export function useAppleSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.appleSignIn,
    onSuccess: async (pair) => {
      await persistTokens(pair);
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useGoogleSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idToken: string) => authApi.googleSignIn(idToken),
    onSuccess: async (pair) => {
      await persistTokens(pair);
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useRequestEmailChange() {
  return useMutation({ mutationFn: authApi.requestEmailChange });
}

export function useConfirmEmailChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.confirmEmailChange,
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.updatePreferences,
    onSuccess: (profile) => qc.setQueryData(ME_QUERY_KEY, profile),
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.completeOnboarding,
    onSuccess: (profile) => qc.setQueryData(ME_QUERY_KEY, profile),
    // Offline: let the user in now. The server still says onboarding is due,
    // so a later /me load brings them back to finish it.
    onError: () =>
      qc.setQueryData<UserProfile>(ME_QUERY_KEY, (me) => me && { ...me, needs_onboarding: false }),
  });
}
