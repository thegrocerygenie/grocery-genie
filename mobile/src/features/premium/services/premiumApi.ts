import type { UserProfile } from '@/features/auth/types';
import { apiClient } from '@/services/api';

/**
 * Ask the backend to read this user's entitlement from RevenueCat's REST API
 * (`POST /api/users/me/premium/refresh`). The server asks RevenueCat; the app
 * sends nothing it could fake. Returns the profile with `is_premium`.
 */
export function refreshPremium(): Promise<UserProfile> {
  return apiClient<UserProfile>('/api/users/me/premium/refresh', { method: 'POST' });
}
