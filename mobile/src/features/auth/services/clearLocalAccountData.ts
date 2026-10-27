import { deletePendingImage } from '@/features/receipt-capture/services/pendingImageFiles';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOfflineStore } from '@/store/offlineStore';
import { usePushStore } from '@/store/pushStore';
import { useReceiptStore } from '@/store/receiptStore';

/**
 * Drop what this device kept for a deleted account. The offline queue is
 * shared by every account on the device, so only `ownerId`'s receipts and
 * photos go; with no known owner the queue is left alone. The caller clears
 * the TanStack Query cache.
 */
export async function clearLocalAccountData(ownerId: string | null): Promise<void> {
  if (ownerId) {
    const offline = useOfflineStore.getState();
    for (const r of offline.pendingReceipts.filter((p) => p.ownerId === ownerId)) {
      deletePendingImage(r.imageUri);
      offline.removePendingReceipt(r.id);
    }
  }
  useNotificationStore.setState({
    preferences: useNotificationStore.getInitialState().preferences,
  });
  // The server dropped the push token with the account; no unregister call.
  usePushStore.getState().setToken(null);
  useReceiptStore.getState().clearScanSession();
  await useAuthStore.getState().clear();
}
