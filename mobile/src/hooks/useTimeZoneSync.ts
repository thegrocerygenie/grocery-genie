import { useEffect } from 'react';

import { useMe, useUpdatePreferences } from '@/features/auth/hooks/useAuth';
import { deviceTimeZone } from '@/utils/money';

/**
 * Keeps the profile's time zone on the iPhone's, so the weekly summary goes
 * out at 9 AM local time (BC-06) after a move or a trip. Runs while signed in.
 */
export function useTimeZoneSync(): void {
  const { data: profile } = useMe();
  const { mutate } = useUpdatePreferences();
  const saved = profile?.timezone;

  useEffect(() => {
    const device = deviceTimeZone();
    if (saved && device && saved !== device) mutate({ timezone: device });
  }, [saved, mutate]);
}
