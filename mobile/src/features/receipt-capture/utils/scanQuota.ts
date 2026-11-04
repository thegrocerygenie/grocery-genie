import { Alert, type AlertButton } from 'react-native';

import { ApiError } from '@/services/api';

/** Short form for the camera's hint pill and a queued row. */
export const QUOTA_HINT = 'Monthly scan limit reached';

/** Title of the upgrade prompt: an invitation, never an error (D2). */
export const QUOTA_TITLE = 'You’ve used this month’s free scans';

/** Full form for the upgrade prompt or a queued row. */
export const QUOTA_MESSAGE =
  'Premium has unlimited receipts. You can still add this receipt with manual entry.';

/** A photo the cap stopped, once the user has Premium: it can upload now. */
export const QUOTA_RETRY_TITLE = 'Upload this receipt now?';

export const QUOTA_RETRY_MESSAGE = 'Premium has unlimited receipts, so this photo can upload now.';

export const QUOTA_ACTIONS = {
  upgrade: 'See Premium',
  retry: 'Upload now',
  manual: 'Enter manually',
  discard: 'Discard',
  dismiss: 'Cancel',
} as const;

/** The backend's stable code for the cap (app/core/entitlements.py). */
const QUOTA_CODE = 'receipt_quota_exceeded';

/**
 * True for the backend's monthly receipt quota (app/api/routes/receipts.py).
 * The hourly rate limit (app/core/rate_limit.py) is also a 429, but it clears
 * within the hour, so it stays retryable. The quota carries
 * `code: "receipt_quota_exceeded"`; its `detail` string, which servers before
 * that code also sent, says "quota".
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 429) return false;
  const body = error.data as { detail?: unknown; code?: unknown } | null;
  if (body?.code === QUOTA_CODE) return true;
  return typeof body?.detail === 'string' && /quota/i.test(body.detail);
}

interface QuotaPromptActions {
  /** Opens the paywall (`/paywall`). */
  onUpgrade: () => void;
  /** Opens manual entry (`/manual-entry`), which the cap does not block. */
  onManualEntry: () => void;
  /** Drops the photo; offered only for a queued one. */
  onDiscard?: () => void;
}

/**
 * D2: a free user at the monthly cap is invited to Premium, which lifts it,
 * with manual entry as the way to add this receipt now.
 */
export function showQuotaUpgradePrompt({
  onUpgrade,
  onManualEntry,
  onDiscard,
}: QuotaPromptActions): void {
  const buttons: AlertButton[] = [
    { text: QUOTA_ACTIONS.upgrade, onPress: onUpgrade, isPreferred: true },
    { text: QUOTA_ACTIONS.manual, onPress: onManualEntry },
  ];
  if (onDiscard) {
    buttons.push({ text: QUOTA_ACTIONS.discard, style: 'destructive', onPress: onDiscard });
  }
  buttons.push({ text: QUOTA_ACTIONS.dismiss, style: 'cancel' });
  Alert.alert(QUOTA_TITLE, QUOTA_MESSAGE, buttons);
}

interface QuotaRetryActions {
  /** Puts the photo back in the upload queue. */
  onRetry: () => void;
  onDiscard: () => void;
}

/**
 * A queued photo the cap stopped, for a user who is Premium now (the backend
 * profile's `is_premium`): the cap no longer applies, so offer the upload
 * again instead of the paywall.
 */
export function showQuotaRetryPrompt({ onRetry, onDiscard }: QuotaRetryActions): void {
  Alert.alert(QUOTA_RETRY_TITLE, QUOTA_RETRY_MESSAGE, [
    { text: QUOTA_ACTIONS.retry, onPress: onRetry, isPreferred: true },
    { text: QUOTA_ACTIONS.discard, style: 'destructive', onPress: onDiscard },
    { text: QUOTA_ACTIONS.dismiss, style: 'cancel' },
  ]);
}
