import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state for a RefreshControl.
 *
 * `refreshing` is true only while a refresh the user pulled runs. A query's
 * `isRefetching` is also true for background refetches (focus, invalidation),
 * and a RefreshControl driven by it can stay stuck on iOS (M9).
 */
export function useUserRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch {
      // The query keeps the error; the screen shows it.
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return { refreshing, onRefresh };
}
