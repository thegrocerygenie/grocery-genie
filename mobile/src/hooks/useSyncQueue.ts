import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { scanReceipt } from '@/features/receipt-capture/services/receiptApi';
import { useOfflineStore } from '@/store/offlineStore';

import { useNetworkStatus } from './useNetworkStatus';

export function useSyncQueue() {
  const { isConnected } = useNetworkStatus();
  const wasDisconnected = useRef(false);
  const queryClient = useQueryClient();
  const { pendingReceipts, updateStatus, removePendingReceipt } =
    useOfflineStore();

  useEffect(() => {
    if (!isConnected) {
      wasDisconnected.current = true;
      return;
    }

    // Only sync when connectivity was just restored, or on mount with pending receipts
    if (!wasDisconnected.current && pendingReceipts.length === 0) return;
    wasDisconnected.current = false;

    const syncPending = async () => {
      const toSync = pendingReceipts.filter((r) => r.status === 'pending');
      for (const receipt of toSync) {
        updateStatus(receipt.id, 'syncing');
        try {
          await scanReceipt(receipt.imageUri, receipt.mimeType);
          removePendingReceipt(receipt.id);
        } catch {
          updateStatus(receipt.id, 'failed');
        }
      }
      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['receipts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    syncPending();
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps
}
