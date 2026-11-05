import { useEffect } from 'react';
import { usePathname } from 'expo-router';

import { useRouteStore } from '@/store/routeStore';

/** Records each screen change in useRouteStore (PI-02 AC 7). Renders nothing. */
export function RouteTracker() {
  const pathname = usePathname();
  const record = useRouteStore((s) => s.record);
  useEffect(() => record(pathname), [pathname, record]);
  return null;
}
