import type { UserProfile } from '@/features/auth/types';
import { apiClient } from '@/services/api';

/** Allow AI reading for the policy version the sheet showed. */
export async function grantAiConsent(policyVersion: string): Promise<UserProfile> {
  return apiClient<UserProfile>('/api/users/me/ai-consent', {
    method: 'PUT',
    body: JSON.stringify({ policy_version: policyVersion }),
  });
}

export async function withdrawAiConsent(): Promise<UserProfile> {
  return apiClient<UserProfile>('/api/users/me/ai-consent', { method: 'DELETE' });
}
