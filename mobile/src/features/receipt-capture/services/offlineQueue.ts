import type { ScanSource } from '@/constants/analyticsEvents';
import { ApiError } from '@/services/api';
import { useOfflineStore } from '@/store/offlineStore';

/** HTTP statuses where the same photo can succeed later (auth refresh, rate limit, outage). */
const RETRYABLE_STATUSES = new Set([401, 408, 429]);

/**
 * True when a scan failed for a reason outside the photo itself: no network
 * (fetch throws a TypeError), an expired session, rate limiting or a server
 * error. A 4xx such as 422 (blurry, not a receipt) fails the same way every time.
 */
export function isRetryableScanError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return RETRYABLE_STATUSES.has(error.status) || error.status >= 500;
  }
  return true;
}

export interface SyncDeps {
  scan: (imageUri: string, mimeType: string, source: ScanSource) => Promise<unknown>;
  deleteImage: (imageUri: string) => void;
  /** The signed-in user; only photos they captured are uploaded. */
  ownerId: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * NFR reliability 3: upload photos captured offline. Only one run at a time,
 * so a connectivity flap cannot upload the same photo twice. Stops at the first
 * retryable error: the rest would fail the same way, and the next trigger
 * (reconnect, app foreground) retries them.
 */
export function syncPendingReceipts(deps: SyncDeps): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runSync(deps).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSync({ scan, deleteImage, ownerId }: SyncDeps): Promise<SyncResult> {
  const { updateStatus, markAttemptFailed, removePendingReceipt } = useOfflineStore.getState();
  // Another account's photo (or one with no owner) waits for its owner: uploading
  // it here would file it under the wrong account, or let that account's server
  // mark it failed.
  const queued = useOfflineStore
    .getState()
    .pendingReceipts.filter((r) => r.status === 'pending' && r.ownerId === ownerId);
  const result: SyncResult = { synced: 0, failed: 0 };

  for (const receipt of queued) {
    updateStatus(receipt.id, 'syncing');
    try {
      await scan(receipt.imageUri, receipt.mimeType, receipt.source ?? 'camera');
    } catch (error) {
      if (isRetryableScanError(error)) {
        markAttemptFailed(receipt.id);
        return result;
      }
      updateStatus(receipt.id, 'failed');
      result.failed += 1;
      continue;
    }
    removePendingReceipt(receipt.id);
    deleteImage(receipt.imageUri);
    result.synced += 1;
  }
  return result;
}

/** "Captured 2h ago" for a queued row. */
export function formatQueuedAgo(capturedAt: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(capturedAt).getTime()) / 60_000);
  if (minutes < 1) return 'Captured just now';
  if (minutes < 60) return `Captured ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Captured ${hours}h ago`;
  return `Captured ${Math.floor(hours / 24)}d ago`;
}
