import { apiClient } from '@/services/api';
import type { TokenPair, UserProfile } from '@/features/auth/types';

export async function signUp(payload: {
  email: string;
  password: string;
  name?: string;
}): Promise<TokenPair> {
  return apiClient<TokenPair>('/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

export async function signIn(payload: { email: string; password: string }): Promise<TokenPair> {
  return apiClient<TokenPair>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

export async function signOut(): Promise<void> {
  await apiClient<void>('/api/auth/sign-out', { method: 'POST' });
}

export async function verifyEmail(token: string): Promise<{ verified_at: string | null }> {
  return apiClient('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
    skipAuth: true,
  });
}

export async function resendVerification(email: string): Promise<void> {
  await apiClient<void>('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
    skipAuth: true,
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient<void>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
    skipAuth: true,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient<void>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
    skipAuth: true,
  });
}

export async function fetchMe(): Promise<UserProfile> {
  return apiClient<UserProfile>('/api/auth/me');
}

export async function appleSignIn(payload: {
  identity_token: string;
  authorization_code: string;
  nonce?: string;
  name?: string;
}): Promise<TokenPair> {
  return apiClient<TokenPair>('/api/auth/apple', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

export async function googleSignIn(idToken: string): Promise<TokenPair> {
  return apiClient<TokenPair>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken }),
    skipAuth: true,
  });
}

export async function requestEmailChange(payload: {
  new_email: string;
  current_password: string;
}): Promise<void> {
  await apiClient<void>('/api/users/me/email-change/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function confirmEmailChange(token: string): Promise<{ email: string }> {
  return apiClient('/api/users/me/email-change/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
    skipAuth: true,
  });
}

export async function updatePreferences(payload: {
  locale?: string;
  currency_preference?: string;
  notification_thresholds?: { fifty?: boolean; eighty?: boolean; hundred?: boolean };
  weekly_summary?: { enabled?: boolean; day?: number };
  ocr_languages?: string[];
}): Promise<UserProfile> {
  return apiClient<UserProfile>('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
