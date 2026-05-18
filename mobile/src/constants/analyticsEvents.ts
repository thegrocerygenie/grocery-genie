/**
 * Analytics event names and shared property types.
 *
 * Only events the mobile client itself emits belong here. The backend emits
 * every server-observable event on its own; the client posts only what the
 * backend cannot see (delivered via POST /api/analytics/events).
 */
export const ANALYTICS_EVENTS = {
  RECEIPT_ABANDONED: 'receipt_abandoned',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Stage at which a receipt flow was abandoned (see docs/prd/12-analytics.md). */
export type AbandonStage = 'capture' | 'review';

/** Where a receipt scan originated. */
export type ScanSource = 'camera' | 'library' | 'pdf' | 'manual';
