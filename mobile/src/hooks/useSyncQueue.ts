import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { scanReceipt } from '@/features/receipt-capture/services/receiptApi';
import { syncPendingReceipts } from '@/features/receipt-capture/services/offlineQueue';
import { deletePendingImage } from '@/features/receipt-capture/services/pendingImageFiles';
import { useOfflineStore } from '@/store/offlineStore';

import { useNetworkStatus } from './useNetworkStatus';

/**
 * Uploads receipts captured offline whenever the app is online and has a
 * queue: on reconnect, when a new photo is queued, and on return to the
 * foreground (which retries after a server error).
 */
export function useSyncQueue() {
  const { isConnected } = useNetworkStatus();
  const queryClient = useQueryClient();
  // Failed photos never upload again, so they must not trigger a sync. A
  // pending → syncing → pending bounce keeps the count, so a failing server
  // does not cause a retry loop.
  const queuedCount = useOfflineStore(
    (s) => s.pendingReceipts.filter((r) => r.status !== 'failed').length,
  );

  useEffect(() => {
    if (!isConnected || queuedCount === 0) return;

    const sync = async () => {
      const { synced } = await syncPendingReceipts({
        scan: (uri, mimeType) => scanReceipt(uri, mimeType, 'camera'),
        deleteImage: deletePendingImage,
      });
      if (synced > 0) {
        await queryClient.invalidateQueries({ queryKey: ['receipts'] });
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    };

    void sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => subscription.remove();
  }, [isConnected, queuedCount, queryClient]);
}
