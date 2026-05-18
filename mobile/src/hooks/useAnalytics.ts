import { useCallback } from 'react';

import type { AnalyticsEventName } from '@/constants/analyticsEvents';
import { apiClient } from '@/services/api';

/**
 * Emits client-owned analytics events to the backend ingestion endpoint.
 *
 * Fire-and-forget: a failed emit never throws into UI code or blocks
 * navigation. The backend emits every server-observable event itself; the
 * client only delivers events the backend cannot see (e.g. receipt_abandoned).
 */
export function useAnalytics() {
  const emit = useCallback(
    (eventName: AnalyticsEventName, properties: Record<string, unknown> = {}) => {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(`[Analytics] ${eventName}`, properties);
      }
      apiClient<void>('/api/analytics/events', {
        method: 'POST',
        body: JSON.stringify({ event_name: eventName, properties }),
      }).catch((err: unknown) => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[Analytics] emit failed', err);
        }
      });
    },
    [],
  );

  return { emit };
}
