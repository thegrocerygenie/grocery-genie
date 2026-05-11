import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as authApi from '@/features/auth/services/authApi';
import type { TokenPair, UserProfile } from '@/features/auth/types';
import { useAuthStore } from '@/store/authStore';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

async function persistTokens(pair: TokenPair) {
  await useAuthStore.getState().setSession({
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
  });
}

export function useMe(enabled = true) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery<UserProfile>({
    queryKey: ME_QUERY_KEY,
    queryFn: authApi.fetchMe,
    enabled: enabled && !!accessToken,
    staleTime: 30_000,
  });
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
