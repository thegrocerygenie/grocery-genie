import { useCallback } from 'react';

export function useAnalytics() {
  const emit = useCallback((eventName: string, properties?: Record<string, unknown>) => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Analytics] ${eventName}`, properties ?? {});
    }
    // Future: POST to /api/analytics/events
  }, []);

  return { emit };
}
