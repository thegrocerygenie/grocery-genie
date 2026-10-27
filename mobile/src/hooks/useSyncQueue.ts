import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import {
  useAiConsentStatus,
  useMarkAiConsentRequired,
} from '@/features/ai-consent/hooks/useAiConsent';
import { scanReceipt } from '@/features/receipt-capture/services/receiptApi';
import { syncPendingReceipts } from '@/features/receipt-capture/services/offlineQueue';
import { deletePendingImage } from '@/features/receipt-capture/services/pendingImageFiles';
import { tokenSubject } from '@/features/auth/utils/tokenSubject';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';

import { useNetworkStatus } from './useNetworkStatus';

/**
 * Waits between retries after an upload failed while online (server down, rate
 * limit). The last one repeats until an upload gets through.
 */
export const SYNC_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

/** True when one of this user's photos waits to retry after a failed upload. */
function waitingToRetry(ownerId: string): boolean {
  return useOfflineStore
    .getState()
    .pendingReceipts.some(
      (r) => r.ownerId === ownerId && r.status === 'pending' && r.lastAttemptFailed,
    );
}

/**
 * One upload run for the signed-in user's queue, refreshing receipts and the
 * dashboard after anything uploaded. Safe to call at any time: concurrent runs
 * share one (syncPendingReceipts), so no photo uploads twice.
 */
export function useSyncNow(): () => Promise<void> {
  const queryClient = useQueryClient();
  const ownerId = tokenSubject(useAuthStore((s) => s.accessToken));
  const consent = useAiConsentStatus();
  const markRequired = useMarkAiConsentRequired();

  return useCallback(async () => {
    // Without AI consent the photos wait on the device (App Store 5.1.2(i)).
    if (!ownerId || consent === false) return;
    const { synced } = await syncPendingReceipts({
      scan: (uri, mimeType, source) => scanReceipt(uri, mimeType, source),
      deleteImage: deletePendingImage,
      ownerId,
      currentOwner: () => tokenSubject(useAuthStore.getState().accessToken),
      onConsentRequired: markRequired,
    });
    if (synced > 0) {
      await queryClient.invalidateQueries({ queryKey: ['receipts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [ownerId, consent, markRequired, queryClient]);
}

/**
 * Uploads receipts captured offline whenever the app is online and has a
 * queue: on reconnect, when a new photo is queued, on return to the
 * foreground, and, after a failed attempt, on a backoff timer while the app
 * stays open (SYNC_RETRY_DELAYS_MS).
 */
export function useSyncQueue() {
  const { isConnected } = useNetworkStatus();
  const syncNow = useSyncNow();
  const ownerId = tokenSubject(useAuthStore((s) => s.accessToken));
  const consent = useAiConsentStatus();
  // Only the signed-in user's photos count. Failed photos never upload again,
  // so they must not trigger a sync. A pending → syncing → pending bounce keeps
  // the count, so a failing server does not restart this effect in a loop; the
  // timer below paces the retries instead.
  const queuedCount = useOfflineStore(
    (s) => s.pendingReceipts.filter((r) => r.status !== 'failed' && r.ownerId === ownerId).length,
  );

  useEffect(() => {
    if (!isConnected || !ownerId || queuedCount === 0 || consent === false) return;

    let stopped = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      await syncNow();
      if (stopped) return;
      if (!waitingToRetry(ownerId)) {
        retries = 0;
        return;
      }
      const delay = SYNC_RETRY_DELAYS_MS[Math.min(retries, SYNC_RETRY_DELAYS_MS.length - 1)];
      retries += 1;
      timer = setTimeout(() => {
        timer = null;
        // In the background the foreground listener retries instead.
        if (AppState.currentState === 'active') void sync();
      }, delay);
    };

    void sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [isConnected, ownerId, queuedCount, consent, syncNow]);
}
