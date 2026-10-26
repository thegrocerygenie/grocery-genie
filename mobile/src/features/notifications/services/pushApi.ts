import { apiClient } from '@/services/api';

export function registerPushToken(token: string): Promise<void> {
  return apiClient<void>('/api/users/me/push-tokens', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function unregisterPushToken(token: string): Promise<void> {
  return apiClient<void>('/api/users/me/push-tokens', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  });
}

export function markNotificationRead(id: string, source: 'push' | 'in_app'): Promise<unknown> {
  return apiClient(`/api/notifications/${encodeURIComponent(id)}/read?source=${source}`, {
    method: 'PATCH',
  });
}
