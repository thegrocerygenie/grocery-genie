import { apiErrorCode } from '@/services/api';

/**
 * True when the server refused a Premium-only feature: `403` with
 * `{"detail": {"code": "premium_required", "feature": ...}}` (08-api-contracts.md).
 * The app answers it with an upgrade prompt, never an error screen (D2).
 */
export function isPremiumRequired(error: unknown): boolean {
  return apiErrorCode(error) === 'premium_required';
}
