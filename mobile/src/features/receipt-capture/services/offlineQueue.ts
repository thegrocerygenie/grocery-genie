import type { ScanSource } from '@/constants/analyticsEvents';
import { ApiError } from '@/services/api';
import { useOfflineStore } from '@/store/offlineStore';

import { isAiConsentRequiredError } from '@/features/ai-consent/utils/aiConsent';

import { isQuotaExceededError } from '../utils/scanQuota';

/** HTTP statuses where the same photo can succeed later (auth refresh, rate limit, outage). */
const RETRYABLE_STATUSES = new Set([401, 408, 429]);

/**
 * True when a scan failed for a reason outside the photo itself: no network
 * (fetch throws a TypeError), an expired session, rate limiting or a server
 * error. A 4xx such as 422 (blurry, not a receipt) fails the same way every
 * time, and so does the monthly quota until the month ends.
 */
export function isRetryableScanError(error: unknown): boolean {
  if (isQuotaExceededError(error)) return false;
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
  /**
   * Who is signed in right now. Each upload sends the token current when it
   * starts, so the run stops once this is no longer `ownerId`.
   */
  currentOwner: () => string | null;
  /** The server refused for AI consent: the queue waits until the user allows it. */
  onConsentRequired?: () => void;
}

export interface SyncResult {
  synced: number;
  failed: number;
}

let inFlight: { ownerId: string; run: Promise<SyncResult> } | null = null;

/**
 * NFR reliability 3: upload photos captured offline. Only one run at a time,
 * so a connectivity flap cannot upload the same photo twice. Stops at the first
 * retryable error: the rest would fail the same way, and the next trigger
 * (reconnect, app foreground) retries them.
 */
export function syncPendingReceipts(deps: SyncDeps): Promise<SyncResult> {
  if (inFlight?.ownerId === deps.ownerId) return inFlight.run;
  // A run for another account (signed out mid-sync) stops at its next photo;
  // this account's run starts after it, so the two never upload at once.
  const previous = inFlight?.run.catch(() => undefined);
  const entry = {
    ownerId: deps.ownerId,
    run: (previous ? previous.then(() => runSync(deps)) : runSync(deps)).finally(() => {
      if (inFlight === entry) inFlight = null;
    }),
  };
  inFlight = entry;
  return entry.run;
}

async function runSync({
  scan,
  deleteImage,
  ownerId,
  currentOwner,
  onConsentRequired,
}: SyncDeps): Promise<SyncResult> {
  const { updateStatus, markAttemptFailed, markFailed, holdForConsent, removePendingReceipt } =
    useOfflineStore.getState();
  // Another account's photo (or one with no owner) waits for its owner: uploading
  // it here would file it under the wrong account, or let that account's server
  // mark it failed.
  const queued = useOfflineStore
    .getState()
    .pendingReceipts.filter((r) => r.status === 'pending' && r.ownerId === ownerId);
  const result: SyncResult = { synced: 0, failed: 0 };

  for (const receipt of queued) {
    // The rest wait for their owner's next sign-in.
    if (currentOwner() !== ownerId) return result;
    updateStatus(receipt.id, 'syncing');
    try {
      await scan(receipt.imageUri, receipt.mimeType, receipt.source ?? 'camera');
    } catch (error) {
      // 5.1.2(i): no photo leaves the phone until the user allows AI reading.
      // The rest would be refused the same way.
      if (isAiConsentRequiredError(error)) {
        holdForConsent(receipt.id);
        onConsentRequired?.();
        return result;
      }
      if (isRetryableScanError(error)) {
        markAttemptFailed(receipt.id);
        return result;
      }
      markFailed(receipt.id, isQuotaExceededError(error) ? 'quota' : 'unreadable');
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
