import { ApiError } from '@/services/api';

/** Short form for the camera's hint pill. */
export const QUOTA_HINT = 'Monthly scan limit reached';

/** Full form for an alert or a queued row. */
export const QUOTA_MESSAGE =
  'You’ve reached this month’s receipt scan limit. You can still add this receipt with manual entry.';

/**
 * True for the backend's monthly receipt quota (app/api/routes/receipts.py).
 * The hourly rate limit (app/core/rate_limit.py) is also a 429, but it clears
 * within the hour, so it stays retryable; only the detail tells them apart.
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 429) return false;
  const detail = (error.data as { detail?: unknown } | null)?.detail;
  return typeof detail === 'string' && /quota/i.test(detail);
}
